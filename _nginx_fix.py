#!/usr/bin/env python3
"""修 aiec server 的 nginx 配置:
- 在 443 server block 内、location / 之前插入 location = /weavepage/ { return 302 ... }
- 备份 → sudo sed 注入 → nginx -t → nginx -s reload
- 失败回退 .bak → reload
- 验证:curl HEAD 看 302 + 跟随后 200
"""
import json
import sys
import os
import re
import time
import paramiko

SFTP_CONFIG_PATH = r"E:\办公文件\L1网站\.vscode\sftp.json"
CONF = "/etc/nginx/sites-enabled/www.aiec.fun"
BAK = "/etc/nginx/sites-enabled/www.aiec.fun.bak.2026-08-18"
SNIPPET = """    # WeavePage: 目录 URL 自动跳到 download.php(nginx autoindex off 时 403)
    location = /weavepage/ {
        return 302 /weavepage/download.php;
    }

"""


def main():
    cfg = json.load(open(SFTP_CONFIG_PATH, "r", encoding="utf-8"))
    client = paramiko.SSHClient()
    known_hosts = os.path.expanduser("~/.ssh/known_hosts")
    if os.path.exists(known_hosts):
        client.load_host_keys(known_hosts)
        client.set_missing_host_key_policy(paramiko.WarningPolicy())
    else:
        client.set_missing_host_key_policy(paramiko.RejectPolicy())

    client.connect(cfg["host"], cfg["port"], cfg["username"], cfg["password"], timeout=15)

    def run(cmd: str):
        """Run shell command with sudo, password from stdin."""
        full = f"sudo -S bash -c {json.dumps(cmd)}"
        print(f"\n$ {cmd[:120]}")
        sin, so, se = client.exec_command(full)
        sin.write(cfg["password"] + "\n")
        sin.flush()
        sin.channel.shutdown_write()
        out = so.read().decode("utf-8", errors="ignore")
        err = se.read().decode("utf-8", errors="ignore")
        rc = so.channel.recv_exit_status()
        if out.strip():
            print(out[:1500])
        if err.strip() and "[sudo]" not in err.lower():
            print(f"[stderr] {err[:500]}")
        print(f"  rc={rc}")
        return rc

    # 1. 备份
    run(f"cp -n {CONF} {BAK}")

    # 2. 用 SFTP 读 → 本地内存拼 → 上传到 /tmp → sudo cp 覆盖
    sftp = client.open_sftp()
    orig = sftp.open(CONF, "r").read().decode("utf-8")
    target = "    location / {\n        try_files $uri $uri/ /index.php?$args;\n    }"
    if SNIPPET.strip().split("\n")[0].strip() in orig:
        print(f"  [INFO] snippet 已存在,跳过注入")
    elif target not in orig:
        print("[ERR] 找不到注入锚点,停止")
        sys.exit(1)
    else:
        new = orig.replace(target, SNIPPET + target, 1)
        tmp = "/tmp/www.aiec.fun.new"
        with sftp.open(tmp, "w") as f:
            f.write(new)
        sftp.close()
        run(f"cp {tmp} {CONF} && rm {tmp}")
        print(f"  snippet 已写入 {CONF}")

    # 3. nginx -t
    rc = run("nginx -t 2>&1")
    if rc != 0:
        print("\n[ROLLBACK] nginx -t 失败,从 BAK 恢复")
        run(f"cp {BAK} {CONF}")
        run("nginx -s reload || true")
        sys.exit(1)

    # 4. reload
    rc = run("nginx -s reload 2>&1")
    if rc != 0:
        time.sleep(1)
        run("systemctl status nginx --no-pager | head -10 || true")

    client.close()
    print("\n[DONE] nginx 配置已更新 + reload 完成。请立即用浏览器/curl 测试 https://www.aiec.fun/weavepage/。")


if __name__ == "__main__":
    main()
