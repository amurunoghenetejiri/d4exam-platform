from pathlib import Path

p = Path("src/components/cbt/CbtExamSession.impl.tsx")
t = p.read_text()
if "lastLoggedFaceRef" not in t:
    t = t.replace(
        'const faceStatusRef = useRef<string>("starting");',
        'const faceStatusRef = useRef<string>("starting");\n  const lastLoggedFaceRef = useRef<string>("");',
    )
old = """    const isViolation = ev.kind === \"none\" or ev.kind === \"multi\" or ev.kind === \"camera_blocked\";
"""
# simpler markers
if "lastLoggedFaceRef.current === logKey" not in t:
    needle = "    if (isViolation) faceWarnCountRef.current += 1;\n    void logSecurityEvent({"
    insert = """    if (isViolation) faceWarnCountRef.current += 1;
    // Event-based logging only — do not spam identical states every frame
    const logKey = `${mapped.eventType}:${ev.faceCount ?? ""}`;
    if (lastLoggedFaceRef.current === logKey) return;
    lastLoggedFaceRef.current = logKey;
    void logSecurityEvent({"""
    if needle in t:
        t = t.replace(needle, insert, 1)
        print("cbt log patched")
    else:
        print("cbt needle missing")
else:
    print("cbt already patched")
p.write_text(t)

p2 = Path("src/routes/officer.live-monitor.tsx")
t2 = p2.read_text()
old2 = """        const warnCh = supabase.channel(`student-exam-warn:${selected.a.student_id}`);
        await warnCh.subscribe();
        await warnCh.send({
"""
new2 = """        const warnCh = supabase.channel(`student-exam-warn:${selected.a.student_id}`);
        await new Promise<void>((resolve, reject) => {
          const t = window.setTimeout(() => resolve(), 2500);
          warnCh.subscribe((status) => {
            if (status === "SUBSCRIBED") {
              window.clearTimeout(t);
              resolve();
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              window.clearTimeout(t);
              reject(new Error(String(status)));
            }
          });
        });
        await warnCh.send({
"""
if old2 in t2:
    t2 = t2.replace(old2, new2, 1)
    t2 = t2.replace(
        "void supabase.removeChannel(warnCh);",
        "window.setTimeout(() => { void supabase.removeChannel(warnCh); }, 1500);",
        1,
    )
    print("officer warn patched")
elif 'status === "SUBSCRIBED"' in t2:
    print("officer already patched")
else:
    print("officer pattern missing")
p2.write_text(t2)
print("done")
