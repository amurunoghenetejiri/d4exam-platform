#!/usr/bin/env python3
"""Make whole CBT exam content scroll under pinned header (not question-only).

Uses flex column: header shrink-0, main flex-1 min-h-0 overflow-y-auto.
Works reliably on Android WebView where fixed + h-full often fails.
"""
from pathlib import Path
import re

p = Path("src/components/cbt/CbtExamSession.impl.tsx")
t = p.read_text()

# Already correct flex layout?
if (
    "d4-cbt-exam relative flex h-dvh flex-col" in t
    and "d4-cbt-scroll min-h-0 flex-1" in t
    and 'header className="d4-cbt-header z-40 shrink-0' in t
):
    print("impl already flex-column whole-page scroll")
else:
    # Normalize outer shell
    for old in [
        '    <div className="d4-cbt-exam relative h-dvh overflow-hidden bg-slate-50 select-none">',
        '    <div className="min-h-dvh bg-slate-50 select-none">',
        '    <div className="flex min-h-dvh flex-col bg-slate-50 select-none">',
        '    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 select-none">',
        '    <div className="d4-cbt-exam relative flex h-dvh flex-col overflow-hidden bg-slate-50 select-none">',
    ]:
        if old in t:
            t = t.replace(old, '    <div className="d4-cbt-exam relative flex h-dvh flex-col overflow-hidden bg-slate-50 select-none">', 1)
            break

    # Preview banner: in-flow shrink-0 (not fixed)
    t = t.replace(
        '<div className="fixed inset-x-0 top-0 z-50 bg-amber-500 px-3 py-1.5 text-center text-xs font-bold text-white">',
        '<div className="shrink-0 bg-amber-500 px-3 py-1.5 text-center text-xs font-bold text-white">',
        1,
    )
    t = t.replace(
        '<div className="bg-amber-500 px-3 py-1.5 text-center text-xs font-bold text-white">',
        '<div className="shrink-0 bg-amber-500 px-3 py-1.5 text-center text-xs font-bold text-white">',
        1,
    )

    # Header: in-flow shrink-0 (not position fixed)
    t = re.sub(
        r'<header className="(?:d4-cbt-header )?fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-\[#0b1b3a\] text-white">',
        '<header className="d4-cbt-header z-40 shrink-0 border-b border-slate-200 bg-[#0b1b3a] text-white">',
        t,
        count=1,
    )
    t = t.replace(
        '<header className="d4-cbt-header fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-[#0b1b3a] text-white">',
        '<header className="d4-cbt-header z-40 shrink-0 border-b border-slate-200 bg-[#0b1b3a] text-white">',
        1,
    )

    # Main scroll pane
    main_open = '''      <main className="d4-cbt-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-4 p-3 pb-8 sm:p-6 lg:grid-cols-[220px_1fr]">'''

    t = re.sub(
        r'<main className="d4-cbt-scroll[^"]*">\s*<div className="mx-auto grid w-full max-w-\[1200px\][^"]*">',
        main_open,
        t,
        count=1,
    )

    grid_patterns = [
        '      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-4 p-3 pt-[calc(4rem+0.75rem)] pb-6 sm:p-6 sm:pt-[calc(4rem+1.5rem)] lg:grid-cols-[220px_1fr]">',
        '      <div className="mx-auto grid w-full max-w-[1200px] min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-3 pt-[calc(4rem+0.75rem)] sm:p-6 sm:pt-[calc(4rem+1.5rem)] lg:grid-cols-[220px_1fr]">',
        '      <div className="mx-auto grid w-full max-w-[1200px] flex-1 grid-cols-1 gap-4 p-3 pt-[calc(4rem+0.75rem)] sm:p-6 sm:pt-[calc(4rem+1.5rem)] lg:grid-cols-[220px_1fr]">',
        '      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-4 p-3 pb-8 sm:p-6 lg:grid-cols-[220px_1fr]">',
    ]
    if "d4-cbt-scroll" not in t:
        for g in grid_patterns:
            if g in t:
                t = t.replace(g, main_open, 1)
                break

    t = t.replace('          <div className="min-h-0 flex-1 overflow-y-auto">\n          <h1', '          <h1')
    t = t.replace(
        '          </div>\n          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">',
        '          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">',
    )
    t = t.replace(
        '          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">',
        '          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">',
    )
    t = t.replace(
        '        <section className="order-1 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:order-2">',
        '        <section className="order-1 flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:order-2">',
    )

    if "</main>" not in t:
        close_old = '''        </section>
      </div>
      {started && !done && security.requireCamera && ('''
        close_new = '''        </section>
      </div>
      </main>
      {started && !done && security.requireCamera && ('''
        if close_old not in t:
            raise SystemExit("close pattern not found")
        t = t.replace(close_old, close_new, 1)

    p.write_text(t)
    print("impl patched")

# CSS
css = Path("src/styles.css")
ct = css.read_text()
old_blocks = [
'''/* CBT: only the main content pane scrolls; header stays fixed */
html.d4-exam-immersive .d4-cbt-scroll {
  -webkit-overflow-scrolling: touch;
  overflow-y: auto !important;
  overscroll-behavior-y: contain;
}
''',
'''/* CBT: header pinned (flex shrink-0); whole exam body scrolls in .d4-cbt-scroll */
html.d4-exam-immersive .d4-cbt-exam {
  display: flex !important;
  flex-direction: column !important;
  height: 100dvh !important;
  max-height: 100dvh !important;
  overflow: hidden !important;
}
html.d4-exam-immersive .d4-cbt-header {
  position: relative !important;
  flex-shrink: 0 !important;
  top: auto !important;
  inset: auto !important;
}
html.d4-exam-immersive .d4-cbt-scroll {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  -webkit-overflow-scrolling: touch;
  overflow-y: auto !important;
  overscroll-behavior-y: contain;
}
''',
]
for b in old_blocks:
    ct = ct.replace(b, "")

ct = ct.rstrip() + """

/* CBT: header pinned (flex shrink-0); whole exam body scrolls in .d4-cbt-scroll */
html.d4-exam-immersive .d4-cbt-exam {
  display: flex !important;
  flex-direction: column !important;
  height: 100dvh !important;
  max-height: 100dvh !important;
  overflow: hidden !important;
}
html.d4-exam-immersive .d4-cbt-header {
  position: relative !important;
  flex-shrink: 0 !important;
  top: auto !important;
  inset: auto !important;
}
html.d4-exam-immersive .d4-cbt-scroll {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  -webkit-overflow-scrolling: touch;
  overflow-y: auto !important;
  overscroll-behavior-y: contain;
}
"""
css.write_text(ct + "\n")
print("css patched")

# verify
t = p.read_text()
assert "flex h-dvh flex-col" in t
assert "d4-cbt-scroll min-h-0 flex-1" in t
assert "</main>" in t
assert 'header className="d4-cbt-header z-40 shrink-0' in t
assert "min-h-0 flex-1 overflow-y-auto\">\n          <h1" not in t
print("verify ok")
