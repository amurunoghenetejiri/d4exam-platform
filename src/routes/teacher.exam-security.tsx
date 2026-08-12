import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, Save } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { ExamSecuritySettings } from "@/types";

export const Route = createFileRoute("/teacher/exam-security")({
  head: () => ({
    meta: [
      { title: "Exam Security — D4EXAM" },
      {
        name: "description",
        content: "Default CBT security settings applied when you create examinations.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const [settings, setSettings] = useState<ExamSecuritySettings>({
    fullscreen: true,
    tabMonitoring: true,
    maxTabSwitches: 5,
    blockCopyPaste: true,
    randomizeQuestions: true,
    randomizeOptions: true,
    requireCamera: false,
    requireMicrophone: false,
    thresholdAction: "flag",
  });

  function save() {
    toast.success("Security defaults saved. New exams will use these settings.");
  }

  function toggle<K extends keyof ExamSecuritySettings>(key: K, value: ExamSecuritySettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  return (
    <>
      <PageHeader
        title="Exam Security"
        description="Default lockdown settings for CBT delivery. Applied when you build a new examination (you can override per exam)."
        actions={
          <Button className="font-semibold" onClick={save}>
            <Save className="mr-1.5 h-4 w-4" />
            Save defaults
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Lockdown">
          <div className="space-y-3">
            <Toggle
              label="Fullscreen lockdown"
              hint="Candidate must stay in fullscreen"
              checked={settings.fullscreen}
              onChange={(v) => toggle("fullscreen", v)}
            />
            <Toggle
              label="Tab & focus monitoring"
              hint="Detect leaving the exam window"
              checked={settings.tabMonitoring}
              onChange={(v) => toggle("tabMonitoring", v)}
            />
            <div className="space-y-2 rounded-xl border border-slate-200 px-4 py-3">
              <Label className="font-semibold">Max tab switches before action</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={settings.maxTabSwitches}
                onChange={(e) => toggle("maxTabSwitches", Number(e.target.value) || 5)}
                disabled={!settings.tabMonitoring}
              />
            </div>
            <div className="space-y-2 rounded-xl border border-slate-200 px-4 py-3">
              <Label className="font-semibold">When threshold is reached</Label>
              <Select
                value={settings.thresholdAction}
                onValueChange={(v) =>
                  toggle("thresholdAction", v as ExamSecuritySettings["thresholdAction"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warn">Warn candidate</SelectItem>
                  <SelectItem value="flag">Flag for officer review</SelectItem>
                  <SelectItem value="terminate">Terminate attempt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Toggle
              label="Block copy / paste"
              hint="Disable clipboard during the attempt"
              checked={settings.blockCopyPaste}
              onChange={(v) => toggle("blockCopyPaste", v)}
            />
          </div>
        </SectionCard>

        <SectionCard title="Paper integrity">
          <div className="space-y-3">
            <Toggle
              label="Randomise question order"
              hint="Each candidate gets a shuffled sequence"
              checked={settings.randomizeQuestions}
              onChange={(v) => toggle("randomizeQuestions", v)}
            />
            <Toggle
              label="Randomise option order"
              hint="MCQ choices shuffled per candidate"
              checked={settings.randomizeOptions}
              onChange={(v) => toggle("randomizeOptions", v)}
            />
            <Toggle
              label="Require camera"
              hint="Optional proctoring camera (if school enables)"
              checked={settings.requireCamera}
              onChange={(v) => toggle("requireCamera", v)}
            />
            <Toggle
              label="Require microphone"
              hint="Optional audio monitoring"
              checked={settings.requireMicrophone}
              onChange={(v) => toggle("requireMicrophone", v)}
            />
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm text-slate-700">
              Integrity events (tab switches, fullscreen exit, copy attempts) are logged for the
              Examination Officer and appear on the Integrity page during live exams.
            </p>
          </div>
        </SectionCard>
      </div>
    </>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
      <span>
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
      </span>
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
    </label>
  );
}
