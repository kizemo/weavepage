#!/usr/bin/env python3
"""探测 aiec server 的 nginx 配置:看看 /weavepage/ 这个路径是否能在 nginx 上安全加一条 location
不修改任何东西,纯诊断。"""
import json
import sys
import os
import paramiko

SFTP_CONFIG_PATH = r"E:\办公文件\L1网站\.vscode\sftp.json"


def load_sftp_config():
    with open(SFTP_CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def main():
    cfg = load_sftp_config()
    print(f"host={cfg['host']} port={cfg['port']} user={cfg['username']}")

    client = paramiko.SSHClient()
    known_hosts = os.path.expanduser("~/.ssh/known_hosts")
    if os.path.exists(known_hosts):
        client.load_host_keys(known_hosts)
        client.set_missing_host_key_policy(paramiko.WarningPolicy())
    else:
        client.set_missing_host_key_policy(paramiko.RejectPolicy())

    client.connect(cfg["host"], cfg["port"], cfg["username"], cfg["password"], timeout=15)
    print("SSH 连接 OK")

    # 探测:服务器角色、nginx 配置路径
    cmds = [
        ("hostname", "主机名"),
        ("nginx -v 2>&1 || true", "nginx 版本"),
        ("ls /etc/nginx/ 2>&1 | head -20", "/etc/nginx/ 目录"),
        ("cat /etc/nginx/nginx.conf 2>&1 | head -40", "nginx.conf 头"),
        ("ls /etc/nginx/conf.d/ 2>&1 | head -10", "conf.d"),
        ("ls /etc/nginx/sites-enabled/ 2>&1 | head -10", "sites-enabled"),
        ("cat /etc/nginx/sites-enabled/*.conf 2>/dev/null | head -60", "site config(s)"),
        ("ls -la /var/www/wordpress/ 2>&1 | head -10", "/var/www/wordpress/"),
        ("ls -la /var/www/wordpress/weavepage/ 2>&1", "weavepage 目录"),
    ]
    for cmd, label in cmds:
        print(f"\n=== {label} ({cmd[:60]}) ===")
        stdin, stdout, stderr = client.exec_command(cmd)
        out = stdout.read().decode("utf-8", errors="ignore")
        err = stderr.read().decode("utf-8", errors="ignore")
        if out:
            print(out[:1500])
        if err:
            print(f"[stderr] {err[:500]}")

    client.close()


if __name__ == "__main__":
    main()
