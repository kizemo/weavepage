#!/usr/bin/env python3
"""纯客户端修复:在 /var/www/wordpress/weavepage/index.html 放 meta-refresh
= /weavepage/download.php。kizemo 有目录写权限,无需 sudo。"""
import json, os, paramiko

SFTP_CONFIG_PATH = r"E:\办公文件\L1网站\.vscode\sftp.json"
INDEX = "/var/www/wordpress/weavepage/index.html"

CONTENT = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=/weavepage/download.php">
<title>WeavePage 织页 - 跳转下载</title>
</head>
<body>
<p>正在跳转到下载页...<a href="/weavepage/download.php">点此手动跳转</a></p>
</body>
</html>
"""


def main():
    cfg = json.load(open(SFTP_CONFIG_PATH, "r", encoding="utf-8"))
    c = paramiko.SSHClient()
    kh = os.path.expanduser("~/.ssh/known_hosts")
    if os.path.exists(kh):
        c.load_host_keys(kh); c.set_missing_host_key_policy(paramiko.WarningPolicy())
    else:
        c.set_missing_host_key_policy(paramiko.RejectPolicy())
    c.connect(cfg["host"], cfg["port"], cfg["username"], cfg["password"], timeout=15)

    sftp = c.open_sftp()
    # 检查现有
    try:
        existing = sftp.open(INDEX, "r").read().decode("utf-8")
        print(f"已存在 index.html ({len(existing)} 字节),会覆盖")
    except IOError:
        print("index.html 不存在,会新建")
        existing = None
    sftp.open(INDEX, "w").write(CONTENT)
    # chmod 644 让 world-readable
    sftp.chmod(INDEX, 0o644)
    # 验证
    new = sftp.open(INDEX, "r").read().decode("utf-8")
    stat = sftp.stat(INDEX)
    print(f"写入完成: {len(new)} 字节,权限 {oct(stat.st_mode)[-3:]}")
    sftp.close()
    c.close()
    print("[DONE]")


if __name__ == "__main__":
    main()
