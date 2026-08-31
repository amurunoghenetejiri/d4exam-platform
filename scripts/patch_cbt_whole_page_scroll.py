#!/usr/bin/env python3
"""Make whole CBT exam content scroll under fixed header (not question-only)."""
from pathlib import Path

p = Path("src/components/cbt/CbtExamSession.impl.tsx")
t = p.read_text()

# Already correct?
if 'd4-cbt-scroll' in t and 'd4-cbt-exam relative h-dvh overflow-hidden' in t and '</main>' in t:
    print("already patched")
else:
    variants = [
        '    <div className="min-h-dvh bg-slate-50 select-none">',
        '    <div className="flex min-h-dvh flex-col bg-slate-50 select-none">',
        '    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 select-none">',
        '    <div className="d4-cbt-exam relative h-dvh overflow-hidden bg-slate-50 select-none">',
    ]
    found = None
    for v in variants:
        if v in t:
            found = v
            break
    if not found:
        raise SystemExit("outer div not found")

    for v in variants:
        t = t.replace(v, '    <div className="d4-cbt-exam relative h-dvh overflow-hidden bg-slate-50 select-none">', 1)

    t = t.replace(
        '<div className="bg-amber-500 px-3 py-1.5 text-center text-xs font-bold text-white">\n          OFFICER PREVIEW',
        '<div className="fixed inset-x-0 top-0 z-50 bg-amber-500 px-3 py-1.5 text-center text-xs font-bold text-white">\n          OFFICER PREVIEW',
        1,
    )

    t = t.replace(
        '<header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-[#0b1b3a] text-white">',
        '<header className="d4-cbt-header fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-[#0b1b3a] text-white">',
        1,
    )

    grid_patterns = [
        '      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-4 p-3 pt-[calc(4rem+0.75rem)] pb-6 sm:p-6 sm:pt-[calc(4rem+1.5rem)] lg:grid-cols-[220px_1fr]">',
        '      <div className="mx-auto grid w-full max-w-[1200px] min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-3 pt-[calc(4rem+0.75rem)] sm:p-6 sm:pt-[calc(4rem+1.5rem)] lg:grid-cols-[220px_1fr]">',
        '      <div className="mx-auto grid w-full max-w-[1200px] flex-1 grid-cols-1 gap-4 p-3 pt-[calc(4rem+0.75rem)] sm:p-6 sm:pt-[calc(4rem+1.5rem)] lg:grid-cols-[220px_1fr]">',
        '      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-4 p-3 pb-8 sm:p-6 lg:grid-cols-[220px_1fr]">',
    ]
    grid_new = '''      <main className="d4-cbt-scroll h-full overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] pt-16">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-4 p-3 pb-8 sm:p-6 lg:grid-cols-[220px_1fr]">'''
    for g in grid_patterns:
        if g in t and 'd4-cbt-scroll' not in t:
            t = t.replace(g, grid_new, 1)
            break
    if 'd4-cbt-scroll' not in t:
        raise SystemExit("grid open not replaced")

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

    if '</main>' not in t:
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
    print("cbt patched")

css = Path("src/styles.css")
ct = css.read_text()
if "d4-cbt-scroll" not in ct:
    ct += """

/* CBT: only the main content pane scrolls; header stays fixed */
html.d4-exam-immersive .d4-cbt-scroll {
  -webkit-overflow-scrolling: touch;
  overflow-y: auto !important;
  overscroll-behavior-y: contain;
}
"""
    css.write_text(ct)
    print("css patched")
else:
    print("css ok")

t = p.read_text()
assert "d4-cbt-exam" in t and "d4-cbt-scroll" in t and "</main>" in t
assert "min-h-0 flex-1 overflow-y-auto" not in t
print("verify ok")
