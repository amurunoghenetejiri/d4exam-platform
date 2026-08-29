from pathlib import Path
import re
p = Path("src/components/cbt/CbtExamSession.impl.tsx")
t = p.read_text()
m = re.search(r"const onFsChange = \(\) => \{[\s\S]*?\n    \};", t)
if m and "finishingRef.current" not in m.group(0):
    block = m.group(0)
    new_block = block.replace(
        "const onFsChange = () => {",
        "const onFsChange = () => {\n      if (finishingRef.current || doneRef.current) return;",
        1,
    )
    t = t.replace(block, new_block, 1)
    print("fs guard")
else:
    print("fs guard skip")

old_fin = """  async function finishAttempt(auto = false) {
    if (done || finishingRef.current) return;
    finishingRef.current = true;
    shutdownMedia();
    setFsGate(false);
    setPaused(false);
    void leaveExamFullscreen();"""

new_fin = """  async function finishAttempt(auto = false) {
    if (done || finishingRef.current) return;
    finishingRef.current = true;
    doneRef.current = true;
    setFsGate(false);
    setPaused(false);
    shutdownMedia();
    void leaveExamFullscreen();"""

if old_fin in t:
    t = t.replace(old_fin, new_fin, 1)
    print("finishAttempt")
elif "doneRef.current = true" in t and "finishAttempt" in t:
    print("finishAttempt already")
else:
    print("finishAttempt MISSING")

p.write_text(t)
print("ok")
