#!/usr/bin/env python3
"""WeavePage installer SFTP 上传到 aiec.fun/weavepage/

参考 _sftp_v058.py 的安全写法:
- SFTP 密码从 E:\\办公文件\\L1网站\\.vscode\\sftp.json 读取 (凭据不硬编码)
- paramiko.WarningPolicy() 而非 AutoAddPolicy (防 silent TOFU)
- 上传后跑 server-side md5sum 与本地 md5 比对 (cross-source verify)

用法: python _upload_weavepage.py
"""
import json
import os
import sys
import hashlib
import paramiko

SFTP_CONFIG_PATH = r"E:\办公文件\L1网站\.vscode\sftp.json"
LOCAL_BASE = r"E:\办公文件\L1网站\weavepage"
REMOTE_BASE = "/var/www/wordpress/weavepage"
LOCAL_FILE = "WeavePage_0.1.2_x64-setup.exe"


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


def main():
    cfg = load_sftp_config()
    print(f"=== [1/5] SFTP config loaded ===")
    print(f"  host={cfg['host']} port={cfg['port']} user={cfg['username']}")
    print(f"  protocol={cfg['protocol']} remotePath={cfg['remotePath']}")

    local_path = os.path.join(LOCAL_BASE, LOCAL_FILE)
    if not os.path.exists(local_path):
        print(f"  [ERR] 本地文件不存在: {local_path}")
        sys.exit(1)
    local_size = os.path.getsize(local_path)
    print(f"\n=== [2/5] 本地文件预检 ===")
    print(f"  {LOCAL_FILE}")
    print(f"  path:  {local_path}")
    print(f"  size:  {local_size:,} bytes ({local_size / 1024 / 1024:.1f} MiB)")

    print(f"\n=== [3/5] 本地 md5 计算 ===")
    local_md5 = md5_file(local_path)
    print(f"  md5:   {local_md5}")

    print(f"\n=== [4/5] SFTP 连接 + 远程目录创建 + 上传 ===")
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

    remote_path = f"{REMOTE_BASE}/{LOCAL_FILE}"
    print(f"  上传 {LOCAL_FILE} -> {remote_path} ...", end=" ", flush=True)
    try:
        sftp.put(local_path, remote_path)
        print("OK")
    except Exception as e:
        print(f"FAIL: {e}")
        sftp.close()
        client.close()
        sys.exit(1)

    sftp.close()

    # Server-side md5 verify
    print(f"\n=== [5/5] Server-side md5 verify (cross-source) ===")
    stdin, stdout, stderr = client.exec_command(f"md5sum '{remote_path}'")
    line = stdout.readline().strip()
    if not line:
        err = stderr.read().decode("utf-8", errors="ignore")
        print(f"  [ERR] md5sum 输出为空: {err}")
        client.close()
        sys.exit(1)
    server_md5 = line.split()[0].upper()
    server_size_field = line.split()[1] if len(line.split()) >= 2 else "?"
    print(f"  server md5:    {server_md5}")
    print(f"  server size:   {server_size_field}")
    print(f"  local  md5:    {local_md5}")
    if server_md5 == local_md5:
        print(f"  match:         OK (md5 cross-source verified)")
    else:
        print(f"  match:         MISMATCH (FAIL) — server md5 != local md5")
        client.close()
        sys.exit(1)

    # Server-side size check (冗余)
    stdin, stdout, stderr = client.exec_command(f"stat -c '%s' '{remote_path}'")
    server_stat_size = stdout.readline().strip()
    if server_stat_size == str(local_size):
        print(f"  size  check:   OK ({server_stat_size} == {local_size})")
    else:
        print(f"  size  check:   MISMATCH (server {server_stat_size} != local {local_size})")
        client.close()
        sys.exit(1)

    client.close()

    print(f"\n[DONE] WeavePage_0.1.2_x64-setup.exe 已上传到 {remote_path}")
    print(f"       公开 URL: https://www.aiec.fun/weavepage/{LOCAL_FILE}")


if __name__ == "__main__":
    main()
