#!/usr/bin/env python3
from pathlib import Path

def main():
    cbt = Path("src/components/cbt/CbtExamSession.impl.tsx")
    ct = cbt.read_text()
    old = (
        "    doneRef.current = true;\n"
        "    setFsGate(false);\n"
        "    setPaused(false);\n"
        "    shutdownMedia();\n"
        "    void leaveExamFullscreen();\n"
        "    if (previewMode) {\n"
        "      toast.message(\"Preview ended — nothing was saved\");\n"
        "      setDone(true);\n"
        "      finishingRef.current = false;\n"
        "      return;\n"
        "    }"
    )
    new = (
        "    doneRef.current = true;\n"
        "    setFsGate(false);\n"
        "    setPaused(false);\n"
        "    setDone(true); // immediate UI exit — no camera reconnect flash\n"
        "    shutdownMedia();\n"
        "    void leaveExamFullscreen();\n"
        "    if (previewMode) {\n"
        "      toast.message(\"Preview ended — nothing was saved\");\n"
        "      finishingRef.current = false;\n"
        "      return;\n"
        "    }"
    )
    if "immediate UI exit" in ct or "setDone(true); // immediate" in ct:
        print("already applied")
        return
    if old not in ct:
        raise SystemExit("finishAttempt start pattern missing")
    cbt.write_text(ct.replace(old, new, 1))
    print("instant setDone applied", cbt.stat().st_size)

if __name__ == "__main__":
    main()
