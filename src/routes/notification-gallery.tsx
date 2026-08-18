import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { STYLES, SAMPLE_MESSAGES, TONES, Swipeable, type Tone } from "@/components/demo/NotificationStyles";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notification-gallery")({
  head: () => ({
    meta: [
      { title: "Notification Styles Gallery — D4EXAM" },
      { name: "description", content: "Internal demo gallery of 20 toast notification styles for D4EXAM." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Notification Styles Gallery — D4EXAM" },
      { property: "og:description", content: "Internal demo gallery of 20 toast notification styles for D4EXAM." },
    ],
  }),
  component: GalleryPage,
});

const TONE_KEYS: Tone[] = ["success", "warning", "error", "info"];

function StyleCard({ style, tone }: { style: (typeof STYLES)[number]; tone: Tone }) {
  const [visible, setVisible] = useState(true);
  const [localTone, setLocalTone] = useState<Tone>(tone);
  const data = SAMPLE_MESSAGES.find((m) => m.tone === localTone)!;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-background/60 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Style {String(style.id).padStart(2, "0")}</p>
          <p className="truncate text-xs text-muted-foreground">{style.name}</p>
        </div>
        <div className="flex gap-1">
          {TONE_KEYS.map((t) => (
            <button
              key={t}
              type="button"
              aria-label={`Show ${t} example`}
              onClick={() => {
                setLocalTone(t);
                setVisible(true);
              }}
              className={cn(
                "pressable h-5 w-5 rounded-full border-2 border-transparent",
                TONES[t].bar,
                localTone === t && "border-foreground",
              )}
            />
          ))}
        </div>
      </div>

      <div className="min-h-[92px] rounded-lg bg-muted/40 p-3">
        {visible ? (
          <Swipeable onDismiss={() => setVisible(false)}>
            {style.render({ data, onDismiss: () => setVisible(false) })}
          </Swipeable>
        ) : (
          <div className="flex h-full min-h-[68px] items-center justify-center text-xs text-muted-foreground">
            Dismissed
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setVisible(true)}
        className="pressable rounded-md border bg-card px-3 py-1.5 text-xs font-medium"
      >
        {visible ? "Reset / show again" : "Show notification"}
      </button>
    </div>
  );
}

function GalleryPage() {
  const [tone, setTone] = useState<Tone>("success");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Internal demo</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Notification Styles Gallery</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          20 distinct toast designs using D4EXAM tokens. Every demo supports swipe-to-dismiss (touch or mouse drag)
          and an independent X button. Nothing here affects the production toast system.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {TONE_KEYS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTone(t)}
              className={cn(
                "pressable rounded-full border px-3 py-1.5 text-xs font-medium capitalize",
                tone === t ? cn(TONES[t].softBg, TONES[t].text, TONES[t].border) : "bg-card",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STYLES.map((s) => (
          <StyleCard key={`${s.id}-${tone}`} style={s} tone={tone} />
        ))}
      </div>
    </main>
  );
}
