import json, os, paramiko
cfg = json.load(open(r"E:\办公文件\L1网站\.vscode\sftp.json", "r", encoding="utf-8"))
c = paramiko.SSHClient()
kh = os.path.expanduser("~/.ssh/known_hosts")
if os.path.exists(kh):
    c.load_host_keys(kh); c.set_missing_host_key_policy(paramiko.WarningPolicy())
else:
    c.set_missing_host_key_policy(paramiko.RejectPolicy())
c.connect(cfg["host"], cfg["port"], cfg["username"], cfg["password"], timeout=15)
for cmd in [
    "id",
    "groups",
    "sudo -n -l 2>&1 | head -10 || true",
    "ls -la /etc/sudoers.d/ 2>&1 | head -10",
    "cat /etc/sudoers.d/*kizemo* 2>/dev/null || cat /etc/sudoers.d/*kiz* 2>/dev/null || true",
    "cat /etc/sudoers 2>/dev/null | grep -v '^#' | grep . | head -20",
    "echo 'PWD-OK' | sudo -S id 2>&1",
]:
    print(f"\n=== {cmd[:80]} ===")
    if cmd.startswith("echo 'PWD-OK'"):
        sin, so, se = c.exec_command(cmd)
        sin.write(cfg["password"] + "\n"); sin.flush(); sin.channel.shutdown_write()
    else:
        sin, so, se = c.exec_command(cmd)
    o = so.read().decode("utf-8", errors="ignore")
    e = se.read().decode("utf-8", errors="ignore")
    print((o + (("\n[err] "+e) if e else ""))[:1500])
c.close()
