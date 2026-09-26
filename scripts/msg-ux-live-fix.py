#!/usr/bin/env python3
"""Apply messaging UX fixes to student.contact-officer and officer.reports"""
from pathlib import Path

def fix_student():
    p = Path("src/routes/student.contact-officer.tsx")
    if not p.exists():
        print("no student route"); return
    t = p.read_text()
    offline_gate = (
        '      if (!isOnlineNow()) {\n'
        '        toast.error("Internet connection is required to send messages.");\n'
        '        return;\n'
        '      }\n'
    )
    if offline_gate in t:
        t = t.replace(offline_gate, '      // Silent offline: still attempt send\n')
        print("student: removed offline gate")
    t = t.replace(
        'useState<{ id: string; text: string } | null>(null)',
        'useState<{ id: string; text: string; fromSelf?: boolean } | null>(null)',
        1,
    )
    old_set = (
        '                    setReplyTo({\n'
        '                      id: m.reportId,\n'
        '                      text: (m.text && m.text !== "(attachment)" ? m.text : m.attachment_type || "Attachment").slice(0, 120),\n'
        '                    });'
    )
    new_set = (
        '                    setReplyTo({\n'
        '                      id: m.reportId,\n'
        '                      text: (m.text && m.text !== "(attachment)" ? m.text : m.attachment_type || "Attachment").slice(0, 120),\n'
        '                      fromSelf: m.side === "out",\n'
        '                    });'
    )
    if old_set in t:
        t = t.replace(old_set, new_set, 1)
        print("student: fromSelf on reply")
    t = t.replace(
        '{officerNickname}</p>\n              <p className="line-clamp-2 text-xs text-slate-700">{replyTo.text}</p>',
        '{replyTo.fromSelf ? "You" : officerNickname}</p>\n              <p className="line-clamp-2 text-xs text-slate-700">{replyTo.text}</p>',
    )
    t = t.replace(
        'className="block w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50" onClick={() => { setRenameVal(officerNickname)',
        'className="block w-full px-3 py-2.5 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50" onClick={() => { setRenameVal(officerNickname)',
    )
    if 'fixed inset-0 z-[65]' not in t and 'chatMenuOpen ? (' in t:
        t = t.replace(
            '{chatMenuOpen ? (\n            <div className="absolute right-0 z-[70]',
            '{chatMenuOpen ? (\n            <>\n              <button type="button" className="fixed inset-0 z-[65] cursor-default" aria-label="Close menu" onClick={() => setChatMenuOpen(false)} />\n              <div className="absolute right-0 z-[70]',
            1,
        )
        t = t.replace(
            'Clear chat</button>\n            </div>\n          ) : null}\n        </div>\n      </div>\n      <div className="relative z-10 min-h-0 flex-1 space-y-4',
            'Clear chat</button>\n              </div>\n            </>\n          ) : null}\n        </div>\n      </div>\n      <div className="relative z-10 min-h-0 flex-1 space-y-4',
            1,
        )
        print("student: menu backdrop")
    t = t.replace(
        '<button type="button" onClick={() => setInChat(false)} className="grid h-9 w-9 place-items-center rounded-full text-white hover:bg-white/10 lg:hidden">\n          <ArrowLeft className="h-5 w-5" />\n        </button>',
        '<button type="button" onClick={() => setInChat(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 text-white ring-2 ring-white/90 shadow-md hover:bg-white/25 lg:hidden" aria-label="Back">\n          <ArrowLeft className="h-5 w-5 stroke-[2.5]" />\n        </button>',
    )
    t = t.replace(
        'officerOnline ? "text-emerald-600" : "text-slate-400"',
        'officerOnline ? "text-emerald-300" : "text-white/60"',
    )
    if 'h-12 w-12 shrink-0 place-items-center rounded-full bg-[#2563eb]' not in t:
        t = t.replace(
            'className={cn("mb-0.5 grid h-10 w-10 place-items-center rounded-full text-white", recording ? "bg-red-500" : "bg-[#0b1b3a]")} onClick={() => (recording ? stopRecKeep() : void startRec())} aria-label="Record voice">\n              <Mic className="h-4 w-4" />',
            'className="mb-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#2563eb] text-white shadow-md ring-2 ring-white/30 hover:bg-blue-600" onClick={() => void startRec()} aria-label="Record voice">\n              <Mic className="h-6 w-6" strokeWidth={2.25} />',
        )
        print("student: bigger mic")
    t = t.replace(
        'className="mb-1 grid h-9 w-9 place-items-center rounded-full text-white/90 hover:bg-white/10" onClick={() => fileRef.current?.click()} aria-label="Attach file">\n            <Paperclip className="h-5 w-5" />',
        'className="mb-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/40 shadow-sm hover:bg-white/25" onClick={() => fileRef.current?.click()} aria-label="Attach file">\n            <Paperclip className="h-5 w-5" strokeWidth={2.25} />',
    )
    if 'replyToKey?.endsWith' not in t and 'm.replyPreview.slice(0, 100)' in t:
        t = t.replace(
            '{m.replyPreview.slice(0, 100)}',
            '<span className="mb-0.5 block text-[10px] font-bold opacity-80">\n                        {m.replyToKey?.endsWith("-s") ? "You" : officerNickname}\n                      </span>\n                      {m.replyPreview.slice(0, 100)}',
        )
        print("student: reply author label")
    p.write_text(t)
    print("student done", len(t))

def fix_officer():
    p = Path("src/routes/officer.reports.tsx")
    if not p.exists():
        print("no officer"); return
    t = p.read_text()
    offline_gate = (
        '    if (!isOnlineNow()) {\n'
        '      toast.error("Internet connection is required to send messages.");\n'
        '      return;\n'
        '    }\n'
    )
    if offline_gate in t:
        t = t.replace(offline_gate, '    // Silent offline — still attempt send\n')
        print("officer: offline gate")
    t = t.replace(
        '<button type="button" onClick={() => setThreadKey(null)} className="grid h-9 w-9 place-items-center rounded-full text-white hover:bg-white/10">\n              <ArrowLeft className="h-5 w-5" />\n            </button>',
        '<button type="button" onClick={() => setThreadKey(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 text-white ring-2 ring-white/90 shadow-md hover:bg-white/25" aria-label="Back">\n              <ArrowLeft className="h-5 w-5 stroke-[2.5]" />\n            </button>',
    )
    t = t.replace(
        'className="block w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50" onClick={() => {\n                    setRenameOpen(true);',
        'className="block w-full px-3 py-2.5 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50" onClick={() => {\n                    setRenameOpen(true);',
    )
    if 'fixed inset-0 z-[65]' not in t:
        t = t.replace(
            '{chatMenuOpen ? (\n                <div className="absolute right-0 z-[70]',
            '{chatMenuOpen ? (\n                <>\n                  <button type="button" className="fixed inset-0 z-[65] cursor-default" aria-label="Close menu" onClick={() => setChatMenuOpen(false)} />\n                  <div className="absolute right-0 z-[70]',
            1,
        )
        t = t.replace(
            'Clear chat</button>\n                </div>\n              ) : null}\n            </div>\n          </div>\n          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto',
            'Clear chat</button>\n                  </div>\n                </>\n              ) : null}\n            </div>\n          </div>\n          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto',
            1,
        )
        print("officer: menu backdrop")
    if 'h-12 w-12 shrink-0 place-items-center rounded-full bg-[#2563eb]' not in t:
        t = t.replace(
            'className={cn("mb-0.5 grid h-10 w-10 place-items-center rounded-full text-white", recording ? "bg-red-500" : "bg-[#0b1b3a]")}\n                  onClick={() => { if (!recording) void startRec(); }}\n                >\n                  <Mic className="h-4 w-4" />',
            'className="mb-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#2563eb] text-white shadow-md ring-2 ring-white/30 hover:bg-blue-600"\n                  onClick={() => { if (!recording) void startRec(); }}\n                  aria-label="Record voice"\n                >\n                  <Mic className="h-6 w-6" strokeWidth={2.25} />',
        )
        print("officer: bigger mic")
    t = t.replace(
        'studentOnline ? "text-emerald-600" : "text-slate-400"',
        'studentOnline ? "text-emerald-300" : "text-white/60"',
    )
    p.write_text(t)
    print("officer done", len(t))

def fix_pill():
    p = Path("src/components/OfflineStatusPill.tsx")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(
        '/** Hidden by product request — never show offline / "using saved data" banners. */\n'
        'export function OfflineStatusPill() {\n'
        '  return null;\n'
        '}\n'
    )
    print("pill ok")

if __name__ == "__main__":
    fix_pill()
    fix_student()
    fix_officer()
    print("all done")
