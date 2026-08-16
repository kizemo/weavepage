#!/usr/bin/env python3
"""WeavePage 页面文件批量 SFTP 上传 (counter.php / download.php / version.json / common.php / .htaccess)

参考 _sftp_v058.py + _upload_weavepage.py 的安全写法:
- SFTP 密码从 E:\\办公文件\\L1网站\\.vscode\\sftp.json 读取
- paramiko.WarningPolicy() (防 silent TOFU)
- 每文件上传后 md5 + size 双校验

用法: python _upload_weavepage_files.py
"""
import json
import os
import sys
import hashlib
import paramiko

SFTP_CONFIG_PATH = r"E:\办公文件\L1网站\.vscode\sftp.json"
LOCAL_BASE = r"E:\办公文件\L1网站\weavepage"
REMOTE_BASE = "/var/www/wordpress/weavepage"

# 待上传文件 (相对 LOCAL_BASE)
FILES = [
    "common.php",
    "version.json",
    "download.php",
    "counter.php",
    ".htaccess",
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


def main():
    cfg = load_sftp_config()
    print(f"=== [1/4] SFTP config loaded ===")
    print(f"  host={cfg['host']} port={cfg['port']} user={cfg['username']}")
    print(f"  protocol={cfg['protocol']} remotePath={cfg['remotePath']}")

    # 本地预检
    print(f"\n=== [2/4] 本地文件预检 + md5 ===")
    local_md5s = {}
    for name in FILES:
        local_path = os.path.join(LOCAL_BASE, name)
        if not os.path.exists(local_path):
            print(f"  [ERR] 本地不存在: {name}")
            sys.exit(1)
        local_md5s[name] = md5_file(local_path)
        size = os.path.getsize(local_path)
        print(f"  {name:20s}  {size:>8d} B   md5={local_md5s[name]}")

    # SFTP 连接
    print(f"\n=== [3/4] SFTP 连接 + 上传 ===")
    client = paramiko.SSHClient()
    known_hosts_path = find_known_hosts()
    if known_hosts_path:
        client.load_host_keys(known_hosts_path)
        client.set_missing_host_key_policy(paramiko.WarningPolicy())
        print(f"  known_hosts: {known_hosts_path} (loaded, WarningPolicy)")
    else:
        print(f"  [WARN] ~/.ssh/known_hosts 不存在, 启用 RejectPolicy")
        client.set_missing_host_key_policy(paramiko.RejectPolicy())

    try:
        client.connect(cfg["host"], cfg["port"], cfg["username"], cfg["password"], timeout=30)
    except paramiko.SSHException as e:
        print(f"  [ERR] SFTP 连接失败: {e}")
        sys.exit(1)
    print(f"  SFTP 连接 OK")

    sftp = client.open_sftp()

    # 确保远程目录存在
    remote_dir_exists = True
    try:
        sftp.stat(REMOTE_BASE)
    except IOError:
        remote_dir_exists = False
    if not remote_dir_exists:
        print(f"  [ERR] 远程目录不存在: {REMOTE_BASE} (请先跑 _upload_weavepage.py)")
        sftp.close()
        client.close()
        sys.exit(1)

    # 逐个上传
    for name in FILES:
        local_path = os.path.join(LOCAL_BASE, name)
        remote_path = f"{REMOTE_BASE}/{name}"
        print(f"  上传 {name} -> {remote_path} ...", end=" ", flush=True)
        try:
            sftp.put(local_path, remote_path)
            print("OK")
        except Exception as e:
            print(f"FAIL: {e}")
            sftp.close()
            client.close()
            sys.exit(1)

    sftp.close()

    # server-side md5 verify
    print(f"\n=== [4/4] Server-side md5 verify (cross-source) ===")
    all_match = True
    for name in FILES:
        remote_path = f"{REMOTE_BASE}/{name}"
        stdin, stdout, stderr = client.exec_command(f"md5sum '{remote_path}'")
        line = stdout.readline().strip()
        if not line:
            err = stderr.read().decode("utf-8", errors="ignore")
            print(f"  [ERR] {name}: md5sum 输出为空: {err}")
            all_match = False
            continue
        server_md5 = line.split()[0].upper()
        local_md5 = local_md5s[name].upper()
        if server_md5 == local_md5:
            print(f"  {name:20s}  OK  server={server_md5}  local={local_md5}")
        else:
            print(f"  {name:20s}  MISMATCH  server={server_md5}  local={local_md5}")
            all_match = False

    client.close()

    if not all_match:
        print(f"\n[FAIL] 文件上传后 md5 校验失败")
        sys.exit(1)

    print(f"\n[DONE] {len(FILES)} 个文件已上传到 {REMOTE_BASE}/")
    print(f"       公开 URL:")
    print(f"         https://www.aiec.fun/weavepage/             -> download.php (landing)")
    print(f"         https://www.aiec.fun/weavepage/counter.php  -> counter page")
    print(f"         https://www.aiec.fun/weavepage/version.json -> Tauri updater JSON")
    print(f"         https://www.aiec.fun/weavepage/download.php?file=WeavePage_0.1.1_x64-setup.exe")


if __name__ == "__main__":
    main()
