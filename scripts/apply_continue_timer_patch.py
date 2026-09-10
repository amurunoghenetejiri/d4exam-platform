#!/usr/bin/env python3
import base64, pathlib, json
ROOT = pathlib.Path(__file__).resolve().parents[1]
PARTS = ROOT / "scripts" / "continue_timer_patch"
MANIFEST = [{"path": "src/components/dashboard/kit.tsx", "parts": 3, "safe": "src__components__dashboard__kit.tsx"}, {"path": "src/routes/student.index.tsx", "parts": 4, "safe": "src__routes__student.index.tsx"}, {"path": "src/components/cbt/CbtExamSession.impl.tsx", "parts": 11, "safe": "src__components__cbt__CbtExamSession.impl.tsx"}, {"path": "src/components/cbt/ExamCameraPip.tsx", "parts": 4, "safe": "src__components__cbt__ExamCameraPip.tsx"}]
def main():
    for m in MANIFEST:
        chunks = []
        for i in range(m["parts"]):
            p = PARTS / f"{m['safe']}.part{i:02d}"
            chunks.append(p.read_text().strip())
        data = base64.b64decode("".join(chunks))
        out = ROOT / m["path"]
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(data)
        print("wrote", m["path"], len(data))
if __name__ == "__main__":
    main()
