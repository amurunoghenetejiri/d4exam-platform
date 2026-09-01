#!/usr/bin/env python3
from pathlib import Path

def patch(path, old, new, label):
    p = Path(path)
    t = p.read_text()
    if old not in t:
        print('SKIP', label)
        return False
    p.write_text(t.replace(old, new, 1))
    print('OK', label)
    return True

# 1 live-video payload type
patch(
    'src/lib/live-video.ts',
    '  timeRemainingSec?: number | null;\n};',
    '  timeRemainingSec?: number | null;\n  studentName?: string;\n  matricNumber?: string;\n  courseCode?: string;\n  examTitle?: string;\n};',
    'payload-type',
)
patch(
    'src/lib/live-video.ts',
    '    timeRemainingSec?: number | null;\n  };',
    '    timeRemainingSec?: number | null;\n    studentName?: string;\n    matricNumber?: string;\n    courseCode?: string;\n    examTitle?: string;\n  };',
    'getFaceMeta-type',
)
patch(
    'src/lib/live-video.ts',
    '          timeRemainingSec: meta.timeRemainingSec,\n        },\n      });',
    '          timeRemainingSec: meta.timeRemainingSec,\n          studentName: meta.studentName,\n          matricNumber: meta.matricNumber,\n          courseCode: meta.courseCode,\n          examTitle: meta.examTitle,\n        },\n      });',
    'send-identity',
)

# 2 cam publish getters
patch(
    'src/lib/use-live-cam-publish.ts',
    '  getTimeRemainingSec?: () => number | null;\n}) {',
    '  getTimeRemainingSec?: () => number | null;\n  getStudentName?: () => string | null | undefined;\n  getMatricNumber?: () => string | null | undefined;\n  getCourseCode?: () => string | null | undefined;\n  getExamTitle?: () => string | null | undefined;\n}) {',
    'cam-opts',
)
patch(
    'src/lib/use-live-cam-publish.ts',
    '          timeRemainingSec: o.getTimeRemainingSec?.() ?? null,\n        };',
    '          timeRemainingSec: o.getTimeRemainingSec?.() ?? null,\n          studentName: String(o.getStudentName?.() || "").trim() || undefined,\n          matricNumber: String(o.getMatricNumber?.() || "").trim() || undefined,\n          courseCode: String(o.getCourseCode?.() || "").trim() || undefined,\n          examTitle: String(o.getExamTitle?.() || "").trim() || undefined,\n        };',
    'cam-meta',
)

# 3 CBT wire
patch(
    'src/components/cbt/CbtExamSession.impl.tsx',
    '    getTimeRemainingSec: () => seconds,\n  });',
    '    getTimeRemainingSec: () => seconds,\n    getStudentName: () => String((student as { fullName?: string } | null)?.fullName || session?.fullName || "").trim() || null,\n    getMatricNumber: () => String((student as { matric?: string | null } | null)?.matric || "").trim() || null,\n    getCourseCode: () => {\n      const c = (examQ.data as { courses?: { code?: string } | { code?: string }[] } | null)?.courses;\n      if (Array.isArray(c)) return String(c[0]?.code || "").trim() || null;\n      return String((c as { code?: string } | undefined)?.code || "").trim() || null;\n    },\n    getExamTitle: () => String(examQ.data?.title || "").trim() || null,\n  });',
    'cbt-wire',
)

# 4 CBT metadata merge on update
patch(
    'src/components/cbt/CbtExamSession.impl.tsx',
    '          const studentNameUpd = String((student as { fullName?: string } | null)?.fullName || session?.fullName || "").trim() || undefined;\n          void supabase.from("exam_attempts").update({\n            question_order: orderIds,\n            status: "in_progress",\n            metadata: { studentName: studentNameUpd, lastSeenAt: new Date().toISOString() },\n          } as never).eq("id", attemptIdRef.current);',
    '          const studentNameUpd = String((student as { fullName?: string } | null)?.fullName || session?.fullName || "").trim() || undefined;\n          const matricUpd = String((student as { matric?: string | null } | null)?.matric || "").trim() || undefined;\n          void (async () => {\n            try {\n              const { data: prevRow } = await supabase.from("exam_attempts").select("metadata").eq("id", attemptIdRef.current!).maybeSingle();\n              const prevMeta = prevRow?.metadata && typeof prevRow.metadata === "object" && !Array.isArray(prevRow.metadata) ? (prevRow.metadata as Record<string, unknown>) : {};\n              await supabase.from("exam_attempts").update({\n                question_order: orderIds,\n                status: "in_progress",\n                metadata: { ...prevMeta, studentName: studentNameUpd || prevMeta.studentName, matricNumber: matricUpd || prevMeta.matricNumber, lastSeenAt: new Date().toISOString() },\n              } as never).eq("id", attemptIdRef.current!);\n            } catch (e) { console.warn("[cbt] metadata merge", e); }\n          })();',
    'cbt-meta',
)

# 5 officer FrameEntry + frame store + display
patch(
    'src/routes/officer.live-monitor.tsx',
    'type FrameEntry = { src: string; ts: number; faceStatus?: string; cameraActive?: boolean; answeredCount?: number; totalQuestions?: number; timeRemainingSec?: number | null };',
    'type FrameEntry = { src: string; ts: number; faceStatus?: string; cameraActive?: boolean; answeredCount?: number; totalQuestions?: number; timeRemainingSec?: number | null; studentName?: string; matricNumber?: string; courseCode?: string; examTitle?: string };',
    'frame-entry',
)
patch(
    'src/routes/officer.live-monitor.tsx',
    '          timeRemainingSec: p.timeRemainingSec,\n        };',
    '          timeRemainingSec: p.timeRemainingSec,\n          studentName: p.studentName ? String(p.studentName).trim() : undefined,\n          matricNumber: p.matricNumber ? String(p.matricNumber).trim() : undefined,\n          courseCode: p.courseCode ? String(p.courseCode).trim() : undefined,\n          examTitle: p.examTitle ? String(p.examTitle).trim() : undefined,\n        };',
    'frame-store',
)
patch(
    'src/routes/officer.live-monitor.tsx',
    '        const metaName = nameFromMetadata(a.metadata);\n        const name = (resolved && String(resolved).trim()) || metaName || studentDisplayName(a);',
    '        const frameId = camFrame || frames[a.id] || frames[`student:${a.student_id}`];\n        const metaName = nameFromMetadata(a.metadata);\n        const frameName = String(frameId?.studentName || "").trim();\n        const name = (resolved && String(resolved).trim()) || frameName || metaName || studentDisplayName(a);',
    'name-from-frame',
)
patch(
    'src/routes/officer.live-monitor.tsx',
    'const matric = String(a.students?.matric_number || a.students?.student_id || metaMatric || "").trim() || "\u2014";'.replace('\\u2014', '\u2014'),
    'const frameMatric = String(frameId?.matricNumber || "").trim();\n        const matric = String(a.students?.matric_number || a.students?.student_id || frameMatric || metaMatric || "").trim() || "\u2014";'.replace('\\u2014', '\u2014'),
    'matric-from-frame',
)
patch(
    'src/routes/officer.live-monitor.tsx',
    'const courseCode = String(courseObj?.code || examEnrichQ.data?.[String(a.exam_id)]?.courseCode || "").trim();',
    'const courseCode = String(courseObj?.code || examEnrichQ.data?.[String(a.exam_id)]?.courseCode || frameId?.courseCode || "").trim();',
    'course-from-frame',
)
patch(
    'src/routes/officer.live-monitor.tsx',
    'const title = String(a.examinations?.title || examEnrichQ.data?.[String(a.exam_id)]?.title || "").trim() || "Exam";',
    'const title = String(a.examinations?.title || examEnrichQ.data?.[String(a.exam_id)]?.title || frameId?.examTitle || "").trim() || "Exam";',
    'title-from-frame',
)

print('DONE')
