from pathlib import Path
p = Path("src/routes/officer.live-monitor.tsx")
t = p.read_text()

if "Monitor" not in t[:3000]:
    t = t.replace(
        "ChevronLeft,\n} from \"lucide-react\";",
        "ChevronLeft,\n  Monitor,\n} from \"lucide-react\";",
        1,
    )
    print("import Monitor")

t = t.replace(
    'className="flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl sm:max-w-lg"',
    'className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl sm:max-w-4xl"',
    1,
)
print("wider")

old_card_start = '<div className="absolute bottom-1 left-1 right-1 flex items-center justify-between'
if old_card_start in t and "from-black/90 via-black/55" not in t:
    i = t.find(old_card_start)
    j = t.find('<div className="p-1.5 sm:p-2">', i)
    k = t.find('</div>\n    </button>', j)
    if i >= 0 and j >= 0 and k >= 0:
        new_card = """        <div className=\"absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-1.5 pb-1.5 pt-8 sm:px-2 sm:pb-2\">
          <div className=\"mb-1 flex items-center justify-between gap-0.5\">
            <FaceChip presence={presence} sev={sev} isDone={isDone} statusLabel={statusLabel} />
            {!isDone && (
              <span className=\"shrink-0 rounded bg-black/50 px-1 py-0.5 font-mono text-[9px] font-semibold text-white sm:px-1.5 sm:text-[10px]\">
                {formatDuration(presence.timeRemainingSec)}
              </span>
            )}
          </div>
          <p className=\"truncate text-[11px] font-extrabold leading-tight text-white drop-shadow sm:text-xs\">{name}</p>
          <p className=\"truncate text-[9px] font-medium leading-tight text-white/85 sm:text-[10px]\">{matric}</p>
          <p className=\"truncate text-[9px] leading-tight text-white/65 sm:text-[10px]\">{course}</p>
        </div>
      </div>
      <div className=\"hidden\" aria-hidden />
"""
        end_p = t.find("</div>", j + 10)
        end_p2 = t.find("</div>", end_p + 1)
        t = t[:i] + new_card + t[end_p2 + 6 :]
        print("card overlay")
    else:
        print("card indices", i, j, k)
elif "from-black/90 via-black/55" in t:
    print("card already")
else:
    print("card start missing")

old_start = '<div className="relative w-full shrink-0 bg-slate-900 aspect-[4/3]'
if old_start in t and "Feed mode + dual pane" not in t:
    i = t.find(old_start)
    j = t.find('<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">', i)
    new_media = (
        open("scripts/_dual_pane_snippet.tsx").read()
        if Path("scripts/_dual_pane_snippet.tsx").exists()
        else ""
    )
    if not new_media:
        print("no snippet")
    elif i >= 0 and j >= 0:
        t = t[:i] + new_media + t[j:]
        print("dual pane")
    else:
        print("media idx", i, j)
elif "Feed mode + dual pane" in t:
    print("dual already")

p.write_text(t)
print("size", p.stat().st_size)
