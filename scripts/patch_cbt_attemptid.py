#!/usr/bin/env python3
from pathlib import Path
p = Path("src/components/cbt/CbtExamSession.impl.tsx")
t = p.read_text()
if "useExamAttemptHeartbeat" not in t:
    t = t.replace(
        'import { useLiveCamPublish } from "@/lib/use-live-cam-publish";',
        'import { useLiveCamPublish } from "@/lib/use-live-cam-publish";\nimport { useExamAttemptHeartbeat } from "@/lib/use-exam-attempt-heartbeat";',
        1,
    )
    needle = (
        "  useLiveScreenPublish({\n"
        "    enabled: started && !done && !previewMode && Boolean(screenStream),\n"
        "    schoolId: examQ.data?.school_id ?? student?.schoolId ?? session?.schoolId,\n"
        "    studentId: student?.studentId,\n"
        "    examId: id,\n"
        "    attemptId: liveAttemptId || attemptIdRef.current,\n"
        "    stream: screenStream,\n"
        "    getStream: () => screenStreamRef.current || screenStream,\n"
        "  });\n"
    )
    insert = needle + (
        "\n  useExamAttemptHeartbeat({\n"
        "    enabled: started && !done && !previewMode,\n"
        "    attemptId: liveAttemptId || attemptIdRef.current,\n"
        "  });\n"
    )
    if needle in t:
        t = t.replace(needle, insert, 1)
if "setLiveAttemptId(existing.id as string)" not in t:
    t = t.replace(
        "if (existing?.id) attemptIdRef.current = existing.id as string;",
        "if (existing?.id) {\n"
        "          attemptIdRef.current = existing.id as string;\n"
        "          setLiveAttemptId(existing.id as string);\n"
        "        }",
        1,
    )
if "setLiveAttemptId(existingFull.id as string)" not in t:
    t = t.replace(
        "if (existingFull?.id) {\n"
        "          attemptIdRef.current = existingFull.id as string;\n"
        "          tabSwitchCountRef.current = Number(existingFull.tab_switch_count ?? 0);",
        "if (existingFull?.id) {\n"
        "          attemptIdRef.current = existingFull.id as string;\n"
        "          setLiveAttemptId(existingFull.id as string);\n"
        "          tabSwitchCountRef.current = Number(existingFull.tab_switch_count ?? 0);",
        1,
    )
p.write_text(t)
print("cbt ok")
