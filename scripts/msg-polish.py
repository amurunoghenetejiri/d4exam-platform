from pathlib import Path

def fix_message_media():
    mm = Path("src/components/messaging/MessageMedia.tsx")
    if not mm.exists():
        print("no MessageMedia"); return
    t = mm.read_text()
    t = t.replace(
        'className={cn("relative flex h-7 flex-1 items-center gap-[2.5px] overflow-hidden", onSeek && "cursor-pointer touch-none")}',
        'className={cn("relative flex h-7 w-full items-center gap-[2.5px] overflow-visible px-1.5", onSeek && "cursor-pointer touch-none")}',
        1,
    )
    t = t.replace(
        "const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));\n    onSeek(ratio);",
        "const pad = 6;\n    const usable = Math.max(1, rect.width - pad * 2);\n    const ratio = Math.max(0, Math.min(1, (clientX - rect.left - pad) / usable));\n    onSeek(ratio);",
        1,
    )
    if "knobLeft" not in t and "pct * 100" in t:
        t = t.replace(
            "style={{ left: `${pct * 100}%` }}",
            "style={{ left: `${6 + pct * 88}%` }}",
            1,
        )
    if "parseOfficerReply" not in t:
        block = (
            "export function encodeOfficerMedia(text: string, type: string, url: string): string {\n"
            "  const body = (text || \"\").trim();\n"
            "  const marker = `__media__|${type}|${url}`;\n"
            "  return body ? `${body}\\n${marker}` : marker;\n"
            "}\n\n"
            "export function parseOfficerReply(raw: string | null | undefined): {\n"
            "  text: string;\n"
            "  mediaType?: string;\n"
            "  mediaUrl?: string;\n"
            "} {\n"
            "  const s = (raw || \"\").trim();\n"
            "  if (!s) return { text: \"\" };\n"
            "  const m = s.match(/(?:^|\\n)__media__\\|([^|]+)\\|(.+)$/);\n"
            "  if (m) {\n"
            "    const text = s.replace(/(?:^|\\n)__media__\\|[^|]+\\|.+$/, \"\").trim();\n"
            "    return { text: text === \"(attachment)\" ? \"\" : text, mediaType: m[1], mediaUrl: m[2] };\n"
            "  }\n"
            "  return { text: s === \"(attachment)\" ? \"\" : s };\n"
            "}\n\n"
        )
        t = t.replace("export function attachmentLabel", block + "export function attachmentLabel", 1)
    mm.write_text(t)
    print("MessageMedia ok")

def polish_route(path, is_officer=False):
    p = Path(path)
    if not p.exists() or p.stat().st_size < 500:
        print("skip", path); return
    t = p.read_text()
    if is_officer:
        if "encodeOfficerMedia" not in t:
            t = t.replace(
                'attachmentLabel } from "@/components/messaging/MessageMedia";',
                'attachmentLabel, encodeOfficerMedia, parseOfficerReply } from "@/components/messaging/MessageMedia";',
                1,
            )
    else:
        if "parseOfficerReply" not in t:
            t = t.replace(
                'attachmentLabel } from "@/components/messaging/MessageMedia";',
                'attachmentLabel, parseOfficerReply } from "@/components/messaging/MessageMedia";',
                1,
            )
    t = t.replace(
        "border-t bg-white px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]",
        "border-t border-white/10 bg-[#0b1b3a] px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-white",
    )
    t = t.replace("z-20 mt-1 w-48", "z-[70] mt-1 w-52")
    t = t.replace("z-20 mt-1 w-52", "z-[70] mt-1 w-52")
    t = t.replace(
        'rounded-full text-slate-500 hover:bg-slate-100" onClick={() => setChatMenuOpen',
        'rounded-full text-white hover:bg-white/10" onClick={() => setChatMenuOpen',
    )
    t = t.replace(
        'rounded-full hover:bg-slate-100 lg:hidden"',
        'rounded-full text-white hover:bg-white/10 lg:hidden"',
    )
    t = t.replace(
        'rounded-full hover:bg-slate-100"',
        'rounded-full text-white hover:bg-white/10"',
    )
    t = t.replace(
        'rounded-full text-slate-500" onClick={() => fileRef.current?.click()',
        'rounded-full text-white/90 hover:bg-white/10" onClick={() => fileRef.current?.click()',
    )
    t = t.replace(
        "items-end rounded-full border bg-slate-50 px-3",
        "items-end rounded-full border border-white/20 bg-white px-3",
    )
    t = t.replace(
        'resize-none bg-transparent py-2 text-sm outline-none"',
        'resize-none bg-transparent py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"',
    )
    t = t.replace(
        'place-items-center rounded-full bg-[#0b1b3a] text-white">\n          <User className="h-5 w-5" />',
        'place-items-center rounded-full bg-white/15 ring-2 ring-white/90 shadow-md">\n          <User className="h-5 w-5 text-white" />',
    )
    if is_officer:
        t = t.replace(
            'className="flex shrink-0 items-center gap-3 border-b px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]"',
            'className="relative z-40 flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#0b1b3a] px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white"',
            1,
        )
        if "encodeOfficerMedia" in t:
            t = t.replace(
                'officer_reply: text.trim() || (attach ? "(attachment)" : ""),',
                'officer_reply: (attach ? encodeOfficerMedia(text, attach.type, attach.url) : text.trim()) || "(attachment)",',
                1,
            )
            t = t.replace(
                "      if (attach) {\n        payload.attachment_url = attach.url;\n        payload.attachment_type = attach.type;\n      }\n",
                "",
                1,
            )
    if "parseOfficerReply(r.officer_reply)" not in t:
        t = t.replace(
            "text: r.officer_reply!,\n          at: r.replied_at || r.created_at,\n          reportId: r.id,\n        });",
            "text: (parseOfficerReply(r.officer_reply).text || (parseOfficerReply(r.officer_reply).mediaUrl ? \"(attachment)\" : r.officer_reply!)),\n          at: r.replied_at || r.created_at,\n          reportId: r.id,\n          attachment_url: parseOfficerReply(r.officer_reply).mediaUrl || undefined,\n          attachment_type: parseOfficerReply(r.officer_reply).mediaType || undefined,\n        });",
            1,
        )
    p.write_text(t)
    print("polished", path)

fix_message_media()
polish_route("src/routes/student.contact-officer.tsx", False)
polish_route("src/routes/officer.reports.tsx", True)
print("ALL DONE")
