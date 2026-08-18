#!/usr/bin/env python3
"""清理 aiec server 上旧的 WeavePage 安装包

策略:保留当前版本 + 上一版本(用于回退备份),其余删除。
当前 = v0.1.10,上一 = v0.1.9 → 删 v0.1.1,0.1.2,0.1.4,0.1.5,0.1.6,0.1.7,0.1.8
"""
import json
import os
import paramiko

SFTP_CONFIG_PATH = r"E:\办公文件\L1网站\.vscode\sftp.json"
KEEP = {"WeavePage_0.1.10_x64-setup.exe", "WeavePage_0.1.9_x64-setup.exe"}
REMOTE_DIR = "/var/www/wordpress/weavepage"


def main():
    cfg = json.load(open(SFTP_CONFIG_PATH, "r", encoding="utf-8"))
    c = paramiko.SSHClient()
    kh = os.path.expanduser("~/.ssh/known_hosts")
    if os.path.exists(kh):
        c.load_host_keys(kh)
        c.set_missing_host_key_policy(paramiko.WarningPolicy())
    else:
        c.set_missing_host_key_policy(paramiko.RejectPolicy())
    c.connect(cfg["host"], cfg["port"], cfg["username"], cfg["password"], timeout=15)

    sftp = c.open_sftp()
    # 列目录
    files = sftp.listdir(REMOTE_DIR)
    installer_files = [f for f in files if f.startswith("WeavePage_") and f.endswith(".exe")]
    print(f"发现 {len(installer_files)} 个安装包:")
    for f in sorted(installer_files):
        marker = "KEEP" if f in KEEP else "DELETE"
        print(f"  [{marker}] {f}")

    deleted = []
    kept = []
    for f in installer_files:
        if f in KEEP:
            kept.append(f)
            continue
        remote_path = f"{REMOTE_DIR}/{f}"
        sftp.remove(remote_path)
        deleted.append(f)
        print("  [-] delete " + f)

    sftp.close()
    c.close()

    print("\n[DONE] keep=%d delete=%d" % (len(kept), len(deleted)))
    print("freed ~%d MB" % (len(deleted) * 220))


if __name__ == "__main__":
    main()
