import json, os, paramiko
cfg = json.load(open(r"E:\办公文件\L1网站\.vscode\sftp.json", "r", encoding="utf-8"))
c = paramiko.SSHClient()
kh = os.path.expanduser("~/.ssh/known_hosts")
if os.path.exists(kh):
    c.load_host_keys(kh); c.set_missing_host_key_policy(paramiko.WarningPolicy())
else:
    c.set_missing_host_key_policy(paramiko.RejectPolicy())
c.connect(cfg["host"], cfg["port"], cfg["username"], cfg["password"], timeout=15)
sin, so, se = c.exec_command("ls -la /var/www/wordpress/weavepage/")
print(so.read().decode("utf-8", errors="ignore"))
c.close()
