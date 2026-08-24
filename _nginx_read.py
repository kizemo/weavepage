import json, sys, os, paramiko
cfg = json.load(open(r"E:\办公文件\L1网站\.vscode\sftp.json", "r", encoding="utf-8"))
c = paramiko.SSHClient()
kh = os.path.expanduser("~/.ssh/known_hosts")
if os.path.exists(kh):
    c.load_host_keys(kh)
    c.set_missing_host_key_policy(paramiko.WarningPolicy())
else:
    c.set_missing_host_key_policy(paramiko.RejectPolicy())
c.connect(cfg["host"], cfg["port"], cfg["username"], cfg["password"], timeout=15)
for cmd in [
    "ls -la /etc/nginx/sites-enabled/ /etc/nginx/sites-available/ 2>&1 | head -20",
    "cat /etc/nginx/sites-enabled/www.aiec.fun 2>&1",
    "grep -n -A 3 -i 'weavepage\|location / ' /etc/nginx/sites-enabled/www.aiec.fun 2>&1 | head -40",
    "grep -n 'index ' /etc/nginx/sites-enabled/www.aiec.fun 2>&1 | head -10",
    "cat /etc/nginx/sites-available/www.aiec.fun 2>/dev/null | wc -l",
    "ls /etc/nginx/conf.d/ /etc/nginx/includes/ 2>&1 | head -10",
]:
    print(f"\n=== {cmd[:80]} ===")
    sin, so, se = c.exec_command(cmd)
    o = so.read().decode("utf-8", errors="ignore")
    e = se.read().decode("utf-8", errors="ignore")
    print((o + (("\n[err] " + e) if e else ""))[:3000])
c.close()
