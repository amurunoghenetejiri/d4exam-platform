#!/usr/bin/env python3
"""One card per student + officer warning broadcast to student exam."""
from pathlib import Path
import re

def main():
    p = Path("src/routes/officer.live-monitor.tsx")
    t = p.read_text()

    if "byStudent" not in t:
        old = (
            "  const cards = useMemo(() => {\n"
            "    const inProgress = attemptsQ.data ?? [];\n"
            "    const recentDone = recentDoneQ.data ?? [];\n"
            "    const merged = [...inProgress, ...recentDone];\n"
            "    const seen = new Set<string>();\n"
            "    return merged\n"
            "      .filter((a) => {\n"
            "        if (seen.has(a.id)) return false;\n"
            "        seen.add(a.id);\n"
            "        return true;\n"
            "      })\n"
            "      .map((a) => {"
        )
        new = (
            "  const cards = useMemo(() => {\n"
            "    const inProgress = attemptsQ.data ?? [];\n"
            "    const recentDone = recentDoneQ.data ?? [];\n"
            "    const merged = [...inProgress, ...recentDone];\n"
            "    // One card per student: prefer in-progress + live frame + most recent activity\n"
            "    const byStudent = new Map<string, AttemptRow>();\n"
            "    const attemptRank = (a: AttemptRow) => {\n"
            "      const st = String(a.status || \"\").toLowerCase();\n"
            "      const isDone = [\"submitted\", \"terminated\", \"flagged\", \"completed\"].includes(st);\n"
            "      const frame = frames[a.id] || frames[`student:${a.student_id}`];\n"
            "      const frameTs = frame?.ts ?? 0;\n"
            "      const updated = a.updated_at ? new Date(a.updated_at).getTime() : 0;\n"
            "      const started = a.started_at ? new Date(a.started_at).getTime() : 0;\n"
            "      const liveBoost = frame && isLiveCamFrameFresh(frame.ts, Date.now()) ? 1e15 : 0;\n"
            "      const progressBoost = isDone ? 0 : 1e14;\n"
            "      return progressBoost + liveBoost + Math.max(frameTs, updated, started);\n"
            "    };\n"
            "    for (const a of merged) {\n"
            "      const key = String(a.student_id || a.id);\n"
            "      const prev = byStudent.get(key);\n"
            "      if (!prev || attemptRank(a) >= attemptRank(prev)) byStudent.set(key, a);\n"
            "    }\n"
            "    const unique = Array.from(byStudent.values());\n"
            "    return unique\n"
            "      .map((a) => {"
        )
        if old not in t:
            raise SystemExit("cards block not found")
        t = t.replace(old, new, 1)
        print("dedupe applied")
    else:
        print("dedupe already present")

    if "warnCh" not in t:
        old = (
            "      await notifyStudentOfficerWarning({\n"
            "        schoolId,\n"
            "        studentId: selected.a.student_id,\n"
            "        examId: selected.a.exam_id,\n"
            "        examTitle: selected.title,\n"
            "        message: \"Warning: Follow exam rules. Further violations may void your result.\",\n"
            "      });\n"
            "      toast.success(`Warning sent to ${selected.name}`);"
        )
        new = (
            "      await notifyStudentOfficerWarning({\n"
            "        schoolId,\n"
            "        studentId: selected.a.student_id,\n"
            "        examId: selected.a.exam_id,\n"
            "        examTitle: selected.title,\n"
            "        message: \"Warning: Follow exam rules. Further violations may void your result.\",\n"
            "      });\n"
            "      // Instant in-exam delivery via Realtime broadcast (no RLS dependency)\n"
            "      try {\n"
            "        const warnCh = supabase.channel(`student-exam-warn:${selected.a.student_id}`);\n"
            "        await warnCh.subscribe();\n"
            "        await warnCh.send({\n"
            "          type: \"broadcast\",\n"
            "          event: \"officer_warning\",\n"
            "          payload: {\n"
            "            studentId: selected.a.student_id,\n"
            "            examId: selected.a.exam_id,\n"
            "            attemptId: selected.a.id,\n"
            "            message: \"Warning: Follow exam rules. Further violations may void your result.\",\n"
            "            ts: Date.now(),\n"
            "          },\n"
            "        });\n"
            "        void supabase.removeChannel(warnCh);\n"
            "      } catch (be) {\n"
            "        console.warn(\"[live-monitor] warn broadcast\", be);\n"
            "      }\n"
            "      toast.success(`Warning sent to ${selected.name}`);"
        )
        if old not in t:
            raise SystemExit("send block not found")
        t = t.replace(old, new, 1)
        print("broadcast applied")
    else:
        print("broadcast already present")

    p.write_text(t)

    sp = Path("src/components/cbt/CbtExamSession.impl.tsx")
    st = sp.read_text()
    if "broadcastCh" in st and "student-exam-warn:" in st:
        print("session already patched")
    else:
        marker = "  // Officer warnings from live monitor"
        if marker not in st:
            raise SystemExit("session marker missing")
        start = st.index(marker)
        dep = "  }, [started, done, previewMode, student?.studentId, id]);"
        end = st.index(dep, start) + len(dep)
        new_block = r'''  // Officer warnings from live monitor — top banner + haptic during the attempt
  useEffect(() => {
    if (!started || done || previewMode) return;
    const studentId = student?.studentId;
    if (!studentId || !id) return;

    const showWarn = (raw?: string | null) => {
      const msg =
        String(raw || "").trim() ||
        "Officer warning: Follow exam rules. Further violations may void your result.";
      setWarnBanner(msg);
      try {
        haptic("officer_warning");
      } catch {
        /* ignore */
      }
      window.setTimeout(() => setWarnBanner(null), 12_000);
    };

    // 1) Broadcast channel — immediate, no RLS dependency
    const broadcastCh = supabase
      .channel(`student-exam-warn:${studentId}`)
      .on("broadcast", { event: "officer_warning" }, ({ payload }) => {
        try {
          const p = (payload || {}) as {
            examId?: string;
            studentId?: string;
            message?: string;
          };
          if (p.studentId && String(p.studentId) !== String(studentId)) return;
          if (p.examId && String(p.examId) !== String(id)) return;
          showWarn(p.message);
        } catch {
          /* ignore */
        }
      })
      .subscribe();

    // 2) postgres integrity_events (backup if RLS allows)
    const pgCh = supabase
      .channel(`exam-officer-warn-${id}-${studentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "integrity_events",
          filter: `student_id=eq.${studentId}`,
        },
        (payload) => {
          try {
            const row = payload.new as {
              event_type?: string;
              description?: string;
              exam_id?: string | null;
            };
            const et = String(row.event_type || "").toUpperCase();
            if (et !== "WARNING_SHOWN" && et !== "OFFICER_WARNING") return;
            if (row.exam_id && String(row.exam_id) !== String(id)) return;
            showWarn(row.description);
          } catch {
            /* ignore */
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(broadcastCh);
      void supabase.removeChannel(pgCh);
    };
  }, [started, done, previewMode, student?.studentId, id]);'''
        st = st[:start] + new_block + st[end:]
        sp.write_text(st)
        print("session patched")

    t = p.read_text()
    start = t.index('  return (\n    <div className="mx-auto')
    end = t.index("\nfunction StatCard")
    jsx = t[start:end]
    o = len(re.findall(r"<div\b", jsx))
    c = len(re.findall(r"</div>", jsx))
    print("officer divs", o, c)
    assert o == c, (o, c)
    assert "byStudent" in t
    assert "student-exam-warn:" in t
    assert "student-exam-warn:" in sp.read_text()
    print("OK")

if __name__ == "__main__":
    main()
