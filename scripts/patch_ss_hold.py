from pathlib import Path
p = Path("src/lib/screen-share.ts")
t = p.read_text()
if "d4_exam_media_hold" in t:
    print("hold already")
else:
    if "const result = await D4ScreenShare().start();" in t:
        t = t.replace(
            "const result = await D4ScreenShare().start();",
            'try { sessionStorage.setItem("d4_exam_media_hold", "1"); } catch {}\n    const result = await D4ScreenShare().start();',
            1,
        )
        p.write_text(t)
        print("hold added")
    else:
        print("MISSING start")
