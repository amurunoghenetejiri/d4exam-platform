#!/usr/bin/env python3
from pathlib import Path

def main():
    idx = Path("src/routes/student.index.tsx")
    t = idx.read_text()
    if "endsAtByExam" not in t:
        marker = (
            "  const attemptsByExam = useMemo(() => {\n"
            "    const m = new Map<string, string>();\n"
            "    for (const a of attemptsQ.data ?? []) m.set(a.exam_id, a.status);\n"
            "    return m;\n"
            "  }, [attemptsQ.data]);\n\n"
            "  const finishedByResult"
        )
        block = (
            "  const attemptsByExam = useMemo(() => {\n"
            "    const m = new Map<string, string>();\n"
            "    for (const a of attemptsQ.data ?? []) m.set(a.exam_id, a.status);\n"
            "    return m;\n"
            "  }, [attemptsQ.data]);\n\n"
            "  const endsAtByExam = useMemo(() => {\n"
            "    const m = new Map<string, string | null>();\n"
            "    for (const a of attemptsQ.data ?? []) {\n"
            "      const row = a as { exam_id: string; ends_at?: string | null };\n"
            "      m.set(row.exam_id, row.ends_at ?? null);\n"
            "    }\n"
            "    return m;\n"
            "  }, [attemptsQ.data]);\n\n"
            "  const [nowTick, setNowTick] = useState(() => Date.now());\n"
            "  useEffect(() => {\n"
            "    const hasLive = [...endsAtByExam.values()].some((ea) => ea);\n"
            "    if (!hasLive) return;\n"
            "    const tmr = setInterval(() => setNowTick(Date.now()), 1000);\n"
            "    return () => clearInterval(tmr);\n"
            "  }, [endsAtByExam]);\n\n"
            "  function formatLeft(ms: number): string {\n"
            "    if (ms <= 0) return \"00:00:00\";\n"
            "    const totalSec = Math.floor(ms / 1000);\n"
            "    const h = Math.floor(totalSec / 3600);\n"
            "    const m = Math.floor((totalSec % 3600) / 60);\n"
            "    const s = totalSec % 60;\n"
            "    const pad = (n: number) => String(n).padStart(2, \"0\");\n"
            "    return `${pad(h)}:${pad(m)}:${pad(s)}`;\n"
            "  }\n\n"
            "  const finishedByResult"
        )
        if marker not in t:
            raise SystemExit("attemptsByExam marker missing")
        t = t.replace(marker, block, 1)
        print("endsAtByExam")
    if "Continue ·" not in t:
        old = (
            "                        Continue\n"
            "                      </Button>\n"
            "                    ) : canStart ? ("
        )
        new = (
            "                        {(() => {\n"
            "                          const ea = endsAtByExam.get(e.id);\n"
            "                          if (!ea) return \"Continue\";\n"
            "                          const left = Math.max(0, new Date(ea).getTime() - nowTick);\n"
            "                          if (left <= 0) return \"Continue\";\n"
            "                          return `Continue · ${formatLeft(left)}`;\n"
            "                        })()}\n"
            "                      </Button>\n"
            "                    ) : canStart ? ("
        )
        if old not in t:
            raise SystemExit("Continue button missing")
        t = t.replace(old, new, 1)
        print("Continue timer")
    idx.write_text(t)
    print("index", len(t))

    cbt = Path("src/components/cbt/CbtExamSession.impl.tsx")
    ct = cbt.read_text()
    if "resumeIndexRef" not in ct:
        ct = ct.replace(
            "const finishingRef = useRef(false);",
            "const finishingRef = useRef(false);\n  const resumeIndexRef = useRef<number | null>(null);",
            1,
        )
        print("resumeIndexRef")
    if "resumeIndexRef.current = idx;" not in ct:
        ct = ct.replace(
            "              setIndex(idx);\n            } catch {}",
            "              resumeIndexRef.current = idx;\n              setIndex(idx);\n            } catch {}",
            1,
        )
        print("resume store")
    if "setDone(true);\n    shutdownMedia" not in ct:
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
            "    setDone(true);\n"
            "    shutdownMedia();\n"
            "    void leaveExamFullscreen();\n"
            "    if (previewMode) {\n"
            "      toast.message(\"Preview ended — nothing was saved\");\n"
            "      finishingRef.current = false;\n"
            "      return;\n"
            "    }"
        )
        if old in ct:
            ct = ct.replace(old, new, 1)
            print("instant done")
        else:
            print("finishAttempt pattern not found")
    cbt.write_text(ct)
    print("cbt", len(ct))
    print("ALL OK")

if __name__ == "__main__":
    main()
