from pathlib import Path

p = Path("src/components/cbt/CbtExamSession.impl.tsx")
t = p.read_text()

if "exam-officer-warn" in t:
    print("already has exam-officer-warn")
    raise SystemExit(0)

listener = '''
  // Officer warnings from live monitor — top banner + haptic during the attempt
  useEffect(() => {
    if (!started || done || previewMode) return;
    const studentId = student?.studentId;
    if (!studentId || !id) return;
    const channel = supabase
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
            const msg =
              String(row.description || "").trim() ||
              "Officer warning: Follow exam rules. Further violations may void your result.";
            setWarnBanner(msg);
            try {
              haptic("officer_warning");
            } catch {
              /* ignore */
            }
            window.setTimeout(() => setWarnBanner(null), 12_000);
          } catch {
            /* ignore */
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [started, done, previewMode, student?.studentId, id]);

'''

# Insert after immersive re-assert effect
anchor = "  // Re-assert immersive chrome while the exam is active."
idx = t.find(anchor)
if idx < 0:
    # try alternate: after done effect with leaveExamFullscreen
    anchor2 = "void leaveExamFullscreen();"
    idx2 = t.find(anchor2)
    if idx2 < 0:
        print("no insert anchor")
        raise SystemExit(1)
    # find closing of that useEffect
    end = t.find("  }, [done", idx2)
    end = t.find(");", end) + 2
    t = t[:end] + "\n" + listener + t[end:]
else:
    # find end of the immersive useEffect block
    end = t.find("  }, [started, done]);", idx)
    if end < 0:
        print("no end of immersive effect")
        raise SystemExit(1)
    end = end + len("  }, [started, done]);")
    t = t[:end] + "\n" + listener + t[end:]

p.write_text(t)
assert "exam-officer-warn" in t
print("OK", p.stat().st_size)
