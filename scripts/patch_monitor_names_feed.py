"""Officer monitor: full name (not matric), feed mode, results names."""
from pathlib import Path

p = Path("src/routes/officer.live-monitor.tsx")
t = p.read_text()

# display name — never use matric as the bold name line
old_name = '''function studentDisplayName(a: AttemptRow): string {
  const fromMeta = nameFromMetadata(a.metadata);
  if (fromMeta) return fromMeta;
  const fromStudent = String(a.students?.full_name || "").trim();
  if (fromStudent) return fromStudent;
  const _prof = a.students?.profiles as unknown;
      const fromProfile = String(
        Array.isArray(_prof)
          ? (_prof[0] as { full_name?: string | null } | undefined)?.full_name || ""
          : (_prof as { full_name?: string | null } | null | undefined)?.full_name || "",
      ).trim();
  if (fromProfile) return fromProfile;
  return a.students?.matric_number || a.students?.student_id || "Student";
}'''

new_name = '''function studentDisplayName(a: AttemptRow): string {
  const matric = String(a.students?.matric_number || a.students?.student_id || "").trim();
  const fromMeta = nameFromMetadata(a.metadata);
  if (fromMeta && fromMeta.toLowerCase() !== matric.toLowerCase()) return fromMeta;
  const fromStudent = String(a.students?.full_name || "").trim();
  if (fromStudent && fromStudent.toLowerCase() !== matric.toLowerCase()) return fromStudent;
  const _prof = a.students?.profiles as unknown;
  const fromProfile = String(
    Array.isArray(_prof)
      ? (_prof[0] as { full_name?: string | null } | undefined)?.full_name || ""
      : (_prof as { full_name?: string | null } | null | undefined)?.full_name || "",
  ).trim();
  if (fromProfile && fromProfile.toLowerCase() !== matric.toLowerCase()) return fromProfile;
  return fromStudent || fromProfile || fromMeta || "Student";
}'''

if old_name in t:
    t = t.replace(old_name, new_name, 1)
    print("displayName")
elif "never show matric" in t or "toLowerCase() !== matric.toLowerCase()" in t:
    print("displayName already")
else:
    print("displayName MISSING")

if "pickFeedFrame" not in t:
    t = t.replace(
        "function studentDisplayName(a: AttemptRow): string {",
        '''function pickFeedFrame(
  feedMode: "camera" | "screen" | "both",
  cam?: { src: string; ts: number } | null,
  screen?: { src: string; ts: number } | null,
): { src: string; ts: number } | undefined {
  if (feedMode === "screen") return screen || undefined;
  if (feedMode === "camera") return cam || undefined;
  return cam || screen || undefined;
}

function studentDisplayName(a: AttemptRow): string {''',
        1,
    )
    print("pickFeedFrame")

if 'const [feedMode, setFeedMode]' not in t:
    t = t.replace(
        'const [view, setView] = useState<"grid" | "list">("grid");',
        'const [view, setView] = useState<"grid" | "list">("grid");\n  const [feedMode, setFeedMode] = useState<"camera" | "screen" | "both">("both");',
        1,
    )
    print("feedMode state")

old_fr = '''        const basePresence = parsePresence(a.metadata);
        const frame = frames[a.id] || frames[`student:${a.student_id}`];
        const st = String(a.status || "").toLowerCase();
        const isDone = ["submitted", "terminated", "flagged", "completed"].includes(st);
        const hasLiveVideo = !isDone && Boolean(frame && isLiveCamFrameFresh(frame.ts, now));'''
new_fr = '''        const basePresence = parsePresence(a.metadata);
        const camFrame = frames[a.id] || frames[`student:${a.student_id}`];
        const scrFrame = screenFrames[a.id] || screenFrames[`student:${a.student_id}`];
        const frame = pickFeedFrame(feedMode, camFrame, scrFrame);
        const st = String(a.status || "").toLowerCase();
        const isDone = ["submitted", "terminated", "flagged", "completed"].includes(st);
        const camLive = Boolean(camFrame && isLiveCamFrameFresh(camFrame.ts, now));
        const scrLive = Boolean(scrFrame && isLiveScreenFrameFresh(scrFrame.ts, now));
        const hasLiveVideo = !isDone && (
          feedMode === "screen" ? scrLive : feedMode === "camera" ? camLive : (camLive || scrLive)
        );'''
if old_fr in t:
    t = t.replace(old_fr, new_fr, 1)
    print("frame pick")
elif "camFrame" in t:
    print("frame pick already")
else:
    print("frame pick MISSING")

t = t.replace(
    "}, [attemptsQ.data, recentDoneQ.data, now, frames]);",
    "}, [attemptsQ.data, recentDoneQ.data, now, frames, screenFrames, feedMode]);",
    1,
)

if 'Feed' not in t or 'setFeedMode(k)' not in t:
    old = '''          ) : view === "grid" ? (
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2 md:grid-cols-3 xl:grid-cols-4">'''
    new = '''          ) : (
            <>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Feed</span>
              {([
                ["camera", "Camera"],
                ["screen", "Screen"],
                ["both", "Both"],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFeedMode(k)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px] font-bold",
                    feedMode === k ? "bg-primary text-white" : "bg-slate-100 text-slate-600",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {view === "grid" ? (
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2 md:grid-cols-3 xl:grid-cols-4">'''
    if old in t:
        t = t.replace(old, new, 1)
        t = t.replace(
            '''            </ul>
          )}
        </div>
        <aside className="hidden lg:block">''',
            '''            </ul>
          )}
            </>
          )}
        </div>
        <aside className="hidden lg:block">''',
            1,
        )
        print("feed UI")
    else:
        print("feed UI marker MISSING")
else:
    print("feed UI already")

# ensure isLiveScreenFrameFresh imported
if "isLiveScreenFrameFresh" not in t.split("from \"@/lib/live-video\"")[0][-500:]:
    if "isLiveScreenFrameFresh" not in t:
        t = t.replace(
            "startLiveScreenSubscriber,",
            "startLiveScreenSubscriber,\n  isLiveScreenFrameFresh,",
            1,
        )
        print("import isLiveScreenFrameFresh")

p.write_text(t)
print("monitor done")

# Results page
p2 = Path("src/components/officer/OfficerResultsPage.tsx")
t2 = p2.read_text()
t2 = t2.replace(
    "students(matric_number, student_id, profiles(full_name))",
    "students(full_name, matric_number, student_id, profiles(full_name))",
    1,
)
old_nm = 'const nm = r.students?.profiles?.full_name || r.students?.matric_number || "Student";'
new_nm = '''const nm = (r.students as { full_name?: string | null } | null)?.full_name
                  || r.students?.profiles?.full_name
                  || "Student";'''
if old_nm in t2:
    t2 = t2.replace(old_nm, new_nm, 1)
    print("results nm")
p2.write_text(t2)
print("results done")
