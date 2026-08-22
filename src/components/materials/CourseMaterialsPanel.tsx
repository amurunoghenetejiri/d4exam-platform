import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  FileText,
  Upload,
  Trash2,
  ExternalLink,
  Loader2,
  ClipboardList,
  Lightbulb,
  GraduationCap,
  File,
} from "lucide-react";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/lib/session";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type MaterialType =
  | "notes"
  | "assignment"
  | "study_guide"
  | "past_question"
  | "reading_tips"
  | "other";

const TYPE_OPTIONS: { value: MaterialType; label: string }[] = [
  { value: "notes", label: "Notes" },
  { value: "assignment", label: "Assignment" },
  { value: "study_guide", label: "Study guide" },
  { value: "past_question", label: "Past question" },
  { value: "reading_tips", label: "Reading tips" },
  { value: "other", label: "Other" },
];

const TYPE_ICON: Record<MaterialType, typeof FileText> = {
  notes: BookOpen,
  assignment: ClipboardList,
  study_guide: GraduationCap,
  past_question: FileText,
  reading_tips: Lightbulb,
  other: File,
};

const MAX_FILES = 50;
const MAX_FILE_MB = 15;

type CourseOpt = { id: string; code: string; name: string };

type MaterialRow = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  material_type: string;
  file_url: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  uploader_role: string;
  uploader_name: string | null;
  uploaded_by: string;
  created_at: string;
};

function typeLabel(t: string) {
  return TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

export function CourseMaterialsPanel({
  role,
  schoolId,
  courses,
  displayName,
}: {
  role: "teacher" | "student";
  schoolId: string;
  courses: CourseOpt[];
  displayName: string;
}) {
  const { data: session } = useSessionUser();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [materialType, setMaterialType] = useState<MaterialType>("notes");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [filterCourse, setFilterCourse] = useState<string>("all");

  const courseIds = useMemo(() => courses.map((c) => c.id), [courses]);
  const courseMap = useMemo(() => {
    const m = new Map<string, CourseOpt>();
    for (const c of courses) m.set(c.id, c);
    return m;
  }, [courses]);

  const listQ = useQuery({
    queryKey: ["course-materials", schoolId, courseIds.join(",")],
    enabled: Boolean(schoolId && courseIds.length),
    staleTime: 8_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_materials")
        .select(
          "id, course_id, title, description, material_type, file_url, file_name, file_mime, file_size, uploader_role, uploader_name, uploaded_by, created_at",
        )
        .eq("school_id", schoolId)
        .in("course_id", courseIds)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as MaterialRow[];
    },
  });

  const items = (listQ.data ?? []).filter(
    (m) => filterCourse === "all" || m.course_id === filterCourse,
  );

  function onPickFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        toast.error(`You can upload at most ${MAX_FILES} files at once.`);
        break;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`${f.name} is larger than ${MAX_FILE_MB}MB.`);
        continue;
      }
      next.push(f);
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function uploadOne(file: File): Promise<{ url: string; name: string; mime: string; size: number } | null> {
    const safe = file.name.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120);
    const path = `${schoolId}/${courseId || "general"}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
    const { error } = await supabase.storage.from("course-materials").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) {
      console.warn("[materials] storage upload", error.message);
      return null;
    }
    const { data } = supabase.storage.from("course-materials").getPublicUrl(path);
    return {
      url: data.publicUrl,
      name: file.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
    };
  }

  async function submit() {
    if (!session?.userId || !schoolId) {
      toast.error("Sign in required.");
      return;
    }
    if (!courseId) {
      toast.error("Select a course.");
      return;
    }
    const baseTitle = title.trim();
    if (!baseTitle && files.length === 0 && !description.trim()) {
      toast.error("Add a title, note text, or at least one file.");
      return;
    }
    setBusy(true);
    try {
      const rows: Record<string, unknown>[] = [];

      if (files.length === 0) {
        rows.push({
          school_id: schoolId,
          course_id: courseId,
          uploaded_by: session.userId,
          uploader_role: role,
          uploader_name: displayName || null,
          title: baseTitle || typeLabel(materialType),
          description: description.trim() || null,
          material_type: materialType,
        });
      } else {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const up = await uploadOne(file);
          if (!up) {
            toast.error(`Could not upload ${file.name}. Check storage permissions.`);
            continue;
          }
          rows.push({
            school_id: schoolId,
            course_id: courseId,
            uploaded_by: session.userId,
            uploader_role: role,
            uploader_name: displayName || null,
            title:
              files.length === 1
                ? baseTitle || file.name
                : `${baseTitle || typeLabel(materialType)} (${i + 1}/${files.length})`,
            description: description.trim() || null,
            material_type: materialType,
            file_url: up.url,
            file_name: up.name,
            file_mime: up.mime,
            file_size: up.size,
          });
        }
      }

      if (!rows.length) {
        toast.error("Nothing was uploaded.");
        return;
      }

      const { error } = await supabase.from("course_materials").insert(rows as never);
      if (error) throw error;

      toast.success(rows.length === 1 ? "Material posted." : `${rows.length} materials posted.`);
      setTitle("");
      setDescription("");
      setFiles([]);
      await qc.invalidateQueries({ queryKey: ["course-materials"] });
    } catch (e) {
      toast.error((e as Error).message || "Could not post material");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const ok = window.confirm("Delete this material?");
    if (!ok) return;
    const { error } = await supabase.from("course_materials").delete().eq("id", id);
    if (error) {
      toast.error(error.message || "Could not delete");
      return;
    }
    toast.success("Deleted");
    await qc.invalidateQueries({ queryKey: ["course-materials"] });
  }

  if (!courses.length) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No courses yet"
        description={
          role === "teacher"
            ? "When School Admin assigns you courses, you can drop notes and materials here."
            : "When courses are offered for your department and level, materials will appear here."
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Course materials"
        description={
          role === "teacher"
            ? "Drop notes, assignments, and study resources for your courses. Students offering those courses will see them."
            : "View materials from your teachers and classmates. You can also share notes for your courses."
        }
      />

      <SectionCard title="Upload" description={`PDF, images, or text · up to ${MAX_FILES} files`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-600">
            Course
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `${c.code} — ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Type
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={materialType}
              onChange={(e) => setMaterialType(e.target.value as MaterialType)}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
            Title
            <Input
              className="mt-1"
              placeholder="e.g. Week 3 lecture notes"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
            Note / description (optional)
            <Textarea
              className="mt-1"
              rows={3}
              placeholder="Write a short note or instructions…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.ppt,.pptx,.txt,image/*"
            onChange={(e) => onPickFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 font-semibold"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Add files ({files.length}/{MAX_FILES})
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5 font-semibold"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Post material
          </Button>
        </div>
        {files.length > 0 && (
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-slate-600">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2">
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  className="shrink-0 text-red-600 hover:underline"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="mt-4 sm:mt-6">
        <SectionCard
          title="Materials"
          description={listQ.isLoading ? "Loading…" : `${items.length} item(s)`}
          actions={
            <select
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold"
              value={filterCourse}
              onChange={(e) => setFilterCourse(e.target.value)}
            >
              <option value="all">All courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code || c.name}
                </option>
              ))}
            </select>
          }
        >
          {listQ.isError ? (
            <p className="text-sm text-red-600">
              {(listQ.error as Error)?.message ||
                "Could not load materials. Run the course_materials SQL migration in Supabase if the table is missing."}
            </p>
          ) : items.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No materials yet"
              description="Uploaded notes and files for your courses will show up here."
            />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((m) => {
                const Icon = TYPE_ICON[(m.material_type as MaterialType) || "other"] ?? File;
                const course = courseMap.get(m.course_id);
                const mine = m.uploaded_by === session?.userId;
                return (
                  <li key={m.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{m.title}</p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                          {typeLabel(m.material_type)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {course ? `${course.code ? course.code + " · " : ""}${course.name}` : "Course"}
                        {" · "}
                        {m.uploader_role === "teacher" ? "Teacher" : "Student"}
                        {m.uploader_name ? ` · ${m.uploader_name}` : ""}
                        {" · "}
                        {new Date(m.created_at).toLocaleString()}
                      </p>
                      {m.description ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{m.description}</p>
                      ) : null}
                      {m.file_url ? (
                        <a
                          href={m.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            "mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline",
                          )}
                        >
                          {m.file_name || "Open file"} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                    {mine ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-slate-400 hover:text-red-600"
                        aria-label="Delete"
                        onClick={() => void remove(m.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
