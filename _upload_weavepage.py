#!/usr/bin/env python3
"""WeavePage installer SFTP 上传到 aiec.fun/weavepage/

参考 _sftp_v058.py 的安全写法:
- SFTP 密码从 E:\\办公文件\\L1网站\\.vscode\\sftp.json 读取 (凭据不硬编码)
- paramiko.WarningPolicy() 而非 AutoAddPolicy (防 silent TOFU)
- 上传后跑 server-side md5sum 与本地 md5 比对 (cross-source verify)

v0.1.11 起改为双渠道:
  - setup.exe  (full 渠道) — 落地页 / GitHub release / 新装机
  - update.exe (update 渠道) — 应用内升级 (embedBootstrapper, 极轻量)
两个文件一次跑完上传 + 各自 md5/size 校验。

用法:
  cp release/WeavePage_X.Y.Z_x64-setup.exe  E:\\办公文件\\L1网站\\weavepage\\
  cp release/WeavePage_X.Y.Z_x64-update.exe E:\\办公文件\\L1网站\\weavepage\\
  python _upload_weavepage.py
"""
import json
import os
import sys
import hashlib
import paramiko

SFTP_CONFIG_PATH = r"E:\办公文件\L1网站\.vscode\sftp.json"
LOCAL_BASE = r"E:\办公文件\L1网站\weavepage"
REMOTE_BASE = "/var/www/wordpress/weavepage"

# 待上传的 installer 文件名列表(完整双渠道)
FILES_TO_UPLOAD = [
    "WeavePage_0.1.11_x64-setup.exe",
    "WeavePage_0.1.11_x64-update.exe",
]


def md5_file(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def load_sftp_config():
    if not os.path.exists(SFTP_CONFIG_PATH):
        print(f"  [ERR] SFTP config 不存在: {SFTP_CONFIG_PATH}")
        sys.exit(1)
    with open(SFTP_CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    required = ["host", "port", "username", "password", "remotePath", "protocol"]
    for k in required:
        if k not in cfg:
            print(f"  [ERR] SFTP config 缺字段: {k}")
            sys.exit(1)
    if cfg["password"] in ("", "PLACEHOLDER", "TODO"):
        print(f"  [ERR] SFTP password 是 placeholder, 请填 sftp.json")
        sys.exit(1)
    return cfg


def find_known_hosts():
    candidates = [
        os.path.expanduser("~/.ssh/known_hosts"),
        os.path.expanduser("~/AppData/Roaming/OpenSSH/known_hosts"),
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


# 单文件原子步骤:put + server-side md5 + size 校验;出错 sys.exit(1)
def upload_with_verify(client, sftp, local_path, filename):
    local_size = os.path.getsize(local_path)
    print(f"\n  --- 文件: {filename} ---")
    print(f"    local:  {local_path}")
    print(f"    size:   {local_size:,} bytes ({local_size / 1024 / 1024:.1f} MiB)")
    local_md5 = md5_file(local_path)
    print(f"    md5:    {local_md5}")

    remote_path = f"{REMOTE_BASE}/{filename}"
    print(f"    upload -> {remote_path} ...", end=" ", flush=True)
    try:
        sftp.put(local_path, remote_path)
        print("OK")
    except Exception as e:
        print(f"FAIL: {e}")
        sys.exit(1)

    # Server-side md5 verify
    stdin, stdout, stderr = client.exec_command(f"md5sum '{remote_path}'")
    line = stdout.readline().strip()
    if not line:
        err = stderr.read().decode("utf-8", errors="ignore")
        print(f"    [ERR] md5sum 输出为空: {err}")
        sys.exit(1)
    server_md5 = line.split()[0].upper()
    server_size_field = line.split()[1] if len(line.split()) >= 2 else "?"
    print(f"    server md5:   {server_md5}")
    print(f"    server size:  {server_size_field}")
    if server_md5 != local_md5:
        print(f"    [ERR] md5 MISMATCH — server != local")
        sys.exit(1)
    print(f"    md5  check:   OK")

    # Server-side size check (冗余)
    stdin, stdout, stderr = client.exec_command(f"stat -c '%s' '{remote_path}'")
    server_stat_size = stdout.readline().strip()
    if server_stat_size != str(local_size):
        print(f"    [ERR] size MISMATCH (server {server_stat_size} != local {local_size})")
        sys.exit(1)
    print(f"    size check:   OK")


def main():
    cfg = load_sftp_config()
    print(f"=== [1/3] SFTP config loaded ===")
    print(f"  host={cfg['host']} port={cfg['port']} user={cfg['username']}")
    print(f"  protocol={cfg['protocol']} remotePath={cfg['remotePath']}")

    # 预检:所有文件必须都存在(脚本不擅长只传一半)
    print(f"\n=== [2/3] 本地预检 ({len(FILES_TO_UPLOAD)} 个文件) ===")
    pending = []
    for filename in FILES_TO_UPLOAD:
        local_path = os.path.join(LOCAL_BASE, filename)
        if not os.path.exists(local_path):
            print(f"  [ERR] 本地文件不存在: {local_path}")
            sys.exit(1)
        print(f"  [OK] {filename}  ({os.path.getsize(local_path) / 1024 / 1024:.1f} MiB)")
        pending.append((local_path, filename))
    print(f"  共 {len(pending)} 个文件待上传")

    print(f"\n=== [3/3] SFTP 连接 + 上传 + 校验 ===")
    client = paramiko.SSHClient()
    known_hosts_path = find_known_hosts()
    if known_hosts_path:
        client.load_host_keys(known_hosts_path)
        client.set_missing_host_key_policy(paramiko.WarningPolicy())
        print(f"  known_hosts: {known_hosts_path} (loaded, WarningPolicy)")
    else:
        print(f"  [WARN] ~/.ssh/known_hosts 不存在, 启用 RejectPolicy (拒绝未知 host)")
        client.set_missing_host_key_policy(paramiko.RejectPolicy())

    try:
        client.connect(cfg["host"], cfg["port"], cfg["username"], cfg["password"], timeout=30)
    except paramiko.SSHException as e:
        print(f"  [ERR] SFTP 连接失败: {e}")
        sys.exit(1)
    print(f"  SFTP 连接 OK")

    sftp = client.open_sftp()

    # 创建远程目录 (递归, 幂等) — paramiko.SFTPClient 没有 exists(),
    # 用 stat() + IOError 判断
    remote_dir_exists = True
    try:
        sftp.stat(REMOTE_BASE)
    except IOError:
        remote_dir_exists = False
    if not remote_dir_exists:
        print(f"  mkdir {REMOTE_BASE} ...", end=" ")
        try:
            sftp.mkdir(REMOTE_BASE)
            print("OK (新建)")
        except IOError as e:
            print(f"FAIL: {e}")
            sftp.close()
            client.close()
            sys.exit(1)
    else:
        print(f"  {REMOTE_BASE} 已存在, 跳过 mkdir")

    for local_path, filename in pending:
        upload_with_verify(client, sftp, local_path, filename)

    sftp.close()
    client.close()

    print(f"\n[DONE] {len(pending)} 个文件全部上传到 {REMOTE_BASE}")
    for _, filename in pending:
        print(f"       公开 URL: https://www.aiec.fun/weavepage/{filename}")


if __name__ == "__main__":
    main()