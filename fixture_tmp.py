import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import api
c = api.app.test_client()
with c.session_transaction() as s:
    s["username"] = "admin"; s["role"] = "admin"; s["logged_in"] = True

fixtures = {}
endpoints = [
    "/api/syslog", "/api/syslog/events", "/api/syslog/summary",
    "/api/syslog/severity", "/api/syslog/devices",
    "/api/alerts/stats", "/api/alerts/log",
    "/api/alerts/email_config", "/api/alerts/telegram_config", "/api/alerts/discord_config",
    "/api/alerts/template", "/api/alerts/rules",
    "/api/onu/history?serial_no=TEST",
]
for ep in endpoints:
    try:
        r = c.get(ep)
        ct = r.content_type or ""
        if "json" in ct:
            fixtures[ep] = r.get_json()
        else:
            fixtures[ep] = {"__nonjson__": True, "status": r.status_code}
    except Exception as e:
        fixtures[ep] = {"__error__": str(e)}

out = "//AUTO-GENERATED FIXTURES FROM LIVE BACKEND\nexport default " + json.dumps(fixtures, default=str)[:200000]
with open(r"frontend\src\fixtures.js", "w", encoding="utf-8") as f:
    f.write(out)

for ep, v in fixtures.items():
    t = type(v).__name__
    preview = json.dumps(v, default=str)[:150] if not isinstance(v, dict) else json.dumps({k: type(val).__name__ for k, val in list(v.items())[:6]})
    print(ep, "->", t, preview)
