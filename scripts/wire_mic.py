from pathlib import Path

p = Path("src/components/cbt/CbtExamSession.impl.tsx")
s = p.read_text()
if "useLiveMicPublish" not in s:
    s = s.replace(
        'import { useLiveCamPublish } from "@/lib/use-live-cam-publish";',
        'import { useLiveCamPublish } from "@/lib/use-live-cam-publish";\nimport { useLiveMicPublish } from "@/lib/use-live-mic-publish";',
    )
s = s.replace(
    "audio: Boolean(security.requireMicrophone)",
    "audio: Boolean(security.requireMicrophone || security.requireCamera)",
)
s = s.replace(
    "const needMic = Boolean(security.requireMicrophone);",
    "const needMic = Boolean(security.requireMicrophone || security.requireCamera);",
)
if "useLiveMicPublish({" not in s:
    i = s.find("useLiveScreenPublish({")
    if i < 0:
        raise SystemExit("no useLiveScreenPublish")
    e = s.find("});", i) + 3
    hook = """\n  useLiveMicPublish({\n    enabled: started && !done && !previewMode,\n    schoolId: examQ.data?.school_id ?? student?.schoolId ?? session?.schoolId,\n    studentId: student?.studentId,\n    examId: id,\n    attemptId: liveAttemptId || attemptIdRef.current,\n    getStream: () => mediaStreamRef.current || liveStream,\n  });\n"""
    s = s[:e] + hook + s[e:]
p.write_text(s)
print("cbt", p.stat().st_size)

op = Path("src/routes/officer.live-monitor.tsx")
o = op.read_text()
if "startLiveMicSubscriber" in o and "audioMuted" in o:
    print("olm already wired")
else:
    if 'from "@/lib/live-audio"' not in o:
        o = o.replace(
            'from "@/lib/live-video";',
            'from "@/lib/live-video";\nimport {\n  startLiveMicSubscriber,\n  playMicChunk,\n  type LiveMicChunkPayload,\n} from "@/lib/live-audio";',
        )
    if "MicOff" not in o:
        o = o.replace("Monitor,", "Monitor,\n  Mic,\n  MicOff,")
    if "audioMuted" not in o:
        o = o.replace(
            "const [selectedId, setSelectedId] = useState<string | null>(null);",
            "const [selectedId, setSelectedId] = useState<string | null>(null);\n  const [audioMuted, setAudioMuted] = useState(true);\n  const audioCtxRef = useRef<AudioContext | null>(null);\n  const audioMutedRef = useRef(true);\n  const selectedIdRef = useRef<string | null>(null);\n  audioMutedRef.current = audioMuted;\n  selectedIdRef.current = selectedId;",
        )
    if "startLiveMicSubscriber" not in o:
        insert_at = o.find("  const selected = cards.find((c) => c.a.id === selectedId)")
        if insert_at < 0:
            insert_at = o.find("const selected = cards.find")
        effect = """\n  useEffect(() => {\n    if (!schoolId) return;\n    const sub = startLiveMicSubscriber({\n      schoolId,\n      onChunk: (payload: LiveMicChunkPayload) => {\n        const focused = selectedIdRef.current;\n        const muted = audioMutedRef.current;\n        let play = false;\n        if (focused) play = payload.attemptId === focused;\n        else play = !muted;\n        if (!play) return;\n        try {\n          if (!audioCtxRef.current) {\n            const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;\n            audioCtxRef.current = new AC();\n          }\n          const ctx = audioCtxRef.current;\n          if (ctx.state === \"suspended\") void ctx.resume();\n          playMicChunk(ctx, payload, focused ? 1.15 : 0.55);\n        } catch {\n          /* ignore */\n        }\n      },\n    });\n    return () => sub.stop();\n  }, [schoolId]);\n\n"""
        if insert_at > 0:
            o = o[:insert_at] + effect + o[insert_at:]
    if "Listening" not in o:
        gi = o.find('{view === "grid"')
        if gi > 0:
            btn = """\n              <Button\n                type=\"button\"\n                variant={audioMuted ? \"outline\" : \"default\"}\n                size=\"sm\"\n                className={cn(\n                  \"h-7 shrink-0 px-2 text-[10px] font-semibold sm:h-8 sm:text-xs\",\n                  !audioMuted && \"bg-emerald-600 text-white hover:bg-emerald-700\",\n                )}\n                onClick={() => {\n                  setAudioMuted((m) => {\n                    const next = !m;\n                    if (!next) {\n                      try {\n                        if (!audioCtxRef.current) {\n                          const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;\n                          audioCtxRef.current = new AC();\n                        }\n                        void audioCtxRef.current?.resume();\n                      } catch {\n                        /* ignore */\n                      }\n                    }\n                    return next;\n                  });\n                }}\n                title={audioMuted ? \"Unmute student microphones\" : \"Mute all\"}\n              >\n                {audioMuted ? (\n                  <>\n                    <MicOff className=\"mr-1 h-3.5 w-3.5\" /> Muted\n                  </>\n                ) : (\n                  <>\n                    <Mic className=\"mr-1 h-3.5 w-3.5\" /> Listening\n                  </>\n                )}\n              </Button>\n"""
            o = o[:gi] + btn + o[gi:]
            print("mute button")
    op.write_text(o)
    print("olm", op.stat().st_size)
print("done")
