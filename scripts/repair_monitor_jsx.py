from pathlib import Path
p = Path("src/routes/officer.live-monitor.tsx")
t = p.read_text()
broken = '<div className="hidden" aria-hidden />\n\n      <ul className="max-h-[22rem]' in t
if not broken and "function AlertsPanel" in t:
    sc = t.find("function StudentCard")
    ap = t.find("function AlertsPanel")
    if sc >= 0 and ap > sc:
        print("already ok")
        raise SystemExit(0)

start = t.find('        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55')
if start < 0:
    start = t.find('<div className="hidden" aria-hidden />')
info_idx = t.find('function Info({ label, value }')
if start < 0 or info_idx < 0:
    raise SystemExit(f"markers missing {start} {info_idx}")

replacement = Path("scripts/_alerts_panel_tail.tsx").read_text()
t = t[:start] + replacement + t[info_idx:]
p.write_text(t)
print("repaired", p.stat().st_size)
