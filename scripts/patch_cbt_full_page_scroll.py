#!/usr/bin/env python3
"""Make entire exam content scroll under fixed header (not question-only)."""
from pathlib import Path

p = Path("src/components/cbt/CbtExamSession.impl.tsx")
t = p.read_text()

replacements = [
    (
        '    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 select-none">',
        '    <div className="min-h-dvh bg-slate-50 select-none">',
    ),
    (
        '    <div className="flex min-h-dvh flex-col bg-slate-50 select-none">',
        '    <div className="min-h-dvh bg-slate-50 select-none">',
    ),
    (
        '      <div className="mx-auto grid w-full max-w-[1200px] min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-3 pt-[calc(4rem+0.75rem)] sm:p-6 sm:pt-[calc(4rem+1.5rem)] lg:grid-cols-[220px_1fr]">',
        '      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-4 p-3 pt-[calc(4rem+0.75rem)] pb-6 sm:p-6 sm:pt-[calc(4rem+1.5rem)] lg:grid-cols-[220px_1fr]">',
    ),
    (
        '      <div className="mx-auto grid w-full max-w-[1200px] flex-1 grid-cols-1 gap-4 p-3 pt-[calc(4rem+0.75rem)] sm:p-6 sm:pt-[calc(4rem+1.5rem)] lg:grid-cols-[220px_1fr]">',
        '      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-4 p-3 pt-[calc(4rem+0.75rem)] pb-6 sm:p-6 sm:pt-[calc(4rem+1.5rem)] lg:grid-cols-[220px_1fr]">',
    ),
    (
        '        <section className="order-1 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:order-2">',
        '        <section className="order-1 flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:order-2">',
    ),
    (
        '          <div className="min-h-0 flex-1 overflow-y-auto">\n          <h1 className="mt-4 text-lg font-bold leading-snug text-slate-900 sm:text-xl">{q?.question_text}</h1>',
        '          <h1 className="mt-4 text-lg font-bold leading-snug text-slate-900 sm:text-xl">{q?.question_text}</h1>',
    ),
    (
        '          </ul>\n          </div>\n          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">',
        '          </ul>\n          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">',
    ),
    (
        '          </div>\n          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">',
        '          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">',
    ),
]

n = 0
for a, b in replacements:
    if a in t:
        t = t.replace(a, b)
        n += 1
        print("applied", n)

p.write_text(t)
assert "min-h-0 flex-1 overflow-y-auto" not in t, "inner question scroll still present"
assert 'className="min-h-dvh bg-slate-50 select-none"' in t, "outer page layout missing"
print("patch_cbt_full_page_scroll ok", n)
