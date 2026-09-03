import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload, Trash2, Loader2, Search, Filter, MoreVertical, Download, Calendar, Eye, Pencil, X, FileImage, FileText, BookOpen,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/lib/session";
import { imagesToPdfBlob, isImageFile } from "@/lib/images-to-pdf";
import { MaterialViewer } from "@/components/materials/MaterialViewer";
import {
  TYPE_OPTIONS, CAT_META, MAX_FILES, MAX_FILE_MB, type MaterialType, type CourseOpt, type MaterialRow,
  typeMeta, formatBytes, formatDate,
} from "@/components/materials/materialsShared";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type { MaterialType };

export function CourseMaterialsPanel({
  role, schoolId, courses, displayName,
}: {
  role: "teacher" | "student";
  schoolId: string;
  courses: CourseOpt[];
  displayName: string;
}) {
  const { data: session } = useSessionUser();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterCourse, setFilterCourse] = useState("all");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "downloads">("recent");
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewer, setViewer] = useState<MaterialRow | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<MaterialRow | null>(null);

  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [materialType, setMaterialType] = useState<MaterialType>("notes");
  const [tags, setTags] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [imagesToPdf, setImagesToPdf] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const canUpload = role === "teacher" || role === "student";
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
      let { data, error } = await supabase
        .from("course_materials")
        .select("id, course_id, title, description, material_type, file_url, file_name, file_mime, file_size, uploader_role, uploader_name, uploaded_by, created_at, download_count, tags")
        .eq("school_id", schoolId)
        .in("course_id", courseIds)
        .order("created_at", { ascending: false })
        .limit(400);
      if (error) {
        const retry = await supabase
          .from("course_materials")
          .select("id, course_id, title, description, material_type, file_url, file_name, file_mime, file_size, uploader_role, uploader_name, uploaded_by, created_at")
          .eq("school_id", schoolId)
          .in("course_id", courseIds)
          .order("created_at", { ascending: false })
          .limit(400);
        if (retry.error) throw retry.error;
        data = retry.data;
      }
      return (data ?? []) as MaterialRow[];
    },
  });

  const all = listQ.data ?? [];
  const counts = useMemo(() => {
    const c = { notes: 0, assignment: 0, past_question: 0, others: 0 };
    for (const m of all) c[typeMeta(m.material_type).cat] += 1;
    return c;
  }, [all]);

  const filtered = useMemo(() => {
    let rows = [...all];
    if (catFilter) rows = rows.filter((m) => typeMeta(m.material_type).cat === catFilter);
    if (filterType !== "all") rows = rows.filter((m) => m.material_type === filterType);
    if (filterCourse !== "all") rows = rows.filter((m) => m.course_id === filterCourse);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((m) => {
        const course = courseMap.get(m.course_id);
        return [m.title, m.description, m.uploader_name, m.tags, m.file_name, m.material_type, course?.code, course?.name]
          .filter(Boolean).join(" ").toLowerCase().includes(q);
      });
    }
    rows.sort((a, b) => {
      if (sortBy === "oldest") return +new Date(a.created_at) - +new Date(b.created_at);
      if (sortBy === "downloads") return (b.download_count ?? 0) - (a.download_count ?? 0);
      return +new Date(b.created_at) - +new Date(a.created_at);
    });
    return rows;
  }, [all, catFilter, filterType, filterCourse, search, sortBy, courseMap]);

  function onPickFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) { toast.error(`At most ${MAX_FILES} files.`); break; }
      if (f.size > MAX_FILE_MB * 1024 * 1024) { toast.error(`${f.name} exceeds ${MAX_FILE_MB}MB.`); continue; }
      next.push(f);
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function uploadBlob(blob: Blob, fileName: string, mime: string) {
    const safe = fileName.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120);
    const path = `${schoolId}/${courseId || "general"}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
    const { error } = await supabase.storage.from("course-materials").upload(path, blob, {
      cacheControl: "3600", upsert: false, contentType: mime || undefined,
    });
    if (error) return null;
    const { data } = supabase.storage.from("course-materials").getPublicUrl(path);
    return { url: data.publicUrl, name: fileName, mime, size: blob.size };
  }

  async function submitUpload() {
    if (!session?.userId || !schoolId) { toast.error("Sign in required."); return; }
    if (!courseId) { toast.error("Select a subject/course."); return; }
    const baseTitle = title.trim();
    if (!baseTitle && !files.length && !description.trim()) { toast.error("Add a title or file."); return; }
    setBusy(true); setProgress(8);
    try {
      const rows: Record<string, unknown>[] = [];
      const onlyImages = files.length > 0 && files.every(isImageFile);
      if (files.length > 0 && onlyImages && imagesToPdf) {
        setProgress(25);
        const pdfBlob = await imagesToPdfBlob(files, baseTitle || "Notes");
        setProgress(60);
        const pdfName = `${(baseTitle || "notes").replace(/[^\w\- ]+/g, "").trim() || "notes"}.pdf`;
        const up = await uploadBlob(pdfBlob, pdfName, "application/pdf");
        setProgress(85);
        if (!up) throw new Error("Could not upload PDF.");
        rows.push({
          school_id: schoolId, course_id: courseId, uploaded_by: session.userId, uploader_role: role,
          uploader_name: displayName || null, title: baseTitle || pdfName, description: description.trim() || null,
          material_type: materialType, file_url: up.url, file_name: up.name, file_mime: up.mime, file_size: up.size,
          tags: tags.trim() || null, download_count: 0,
        });
      } else if (!files.length) {
        rows.push({
          school_id: schoolId, course_id: courseId, uploaded_by: session.userId, uploader_role: role,
          uploader_name: displayName || null, title: baseTitle || typeMeta(materialType).label,
          description: description.trim() || null, material_type: materialType, tags: tags.trim() || null, download_count: 0,
        });
      } else {
        for (let i = 0; i < files.length; i++) {
          setProgress(15 + Math.round((i / files.length) * 70));
          const file = files[i];
          const up = await uploadBlob(file, file.name, file.type || "application/octet-stream");
          if (!up) { toast.error(`Failed: ${file.name}`); continue; }
          rows.push({
            school_id: schoolId, course_id: courseId, uploaded_by: session.userId, uploader_role: role,
            uploader_name: displayName || null,
            title: files.length === 1 ? baseTitle || file.name : `${baseTitle || typeMeta(materialType).label} (${i + 1}/${files.length})`,
            description: description.trim() || null, material_type: materialType,
            file_url: up.url, file_name: up.name, file_mime: up.mime, file_size: up.size,
            tags: tags.trim() || null, download_count: 0,
          });
        }
      }
      if (!rows.length) throw new Error("Nothing uploaded.");
      setProgress(92);
      const { error } = await supabase.from("course_materials").insert(rows as never);
      if (error) throw error;
      setProgress(100);
      toast.success(rows.length === 1 ? "Material uploaded." : `${rows.length} materials uploaded.`);
      setTitle(""); setDescription(""); setTags(""); setFiles([]); setUploadOpen(false);
      await qc.invalidateQueries({ queryKey: ["course-materials"] });
    } catch (e) {
      toast.error((e as Error).message || "Upload failed");
    } finally {
      setBusy(false); setProgress(0);
    }
  }

  async function saveEdit() {
    if (!editItem || !session?.userId) return;
    const { error } = await supabase.from("course_materials").update({
      title: title.trim() || editItem.title, description: description.trim() || null,
      material_type: materialType, tags: tags.trim() || null, course_id: courseId || editItem.course_id,
    } as never).eq("id", editItem.id).eq("uploaded_by", session.userId);
    if (error) { toast.error(error.message); return; }
    toast.success("Material updated.");
    setEditItem(null); setUploadOpen(false);
    await qc.invalidateQueries({ queryKey: ["course-materials"] });
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this material?")) return;
    const { error } = await supabase.from("course_materials").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    if (viewer?.id === id) setViewer(null);
    setMenuId(null);
    await qc.invalidateQueries({ queryKey: ["course-materials"] });
  }

  async function downloadMaterial(m: MaterialRow) {
    if (!m.file_url) { setViewer(m); return; }
    try {
      const a = document.createElement("a");
      a.href = m.file_url; a.download = m.file_name || m.title || "download"; a.target = "_blank"; a.rel = "noreferrer";
      document.body.appendChild(a); a.click(); a.remove();
      const { data } = await supabase.rpc("increment_material_downloads" as never, { _id: m.id } as never);
      if (data == null) {
        await supabase.from("course_materials").update({ download_count: (m.download_count ?? 0) + 1 } as never).eq("id", m.id);
      }
      await qc.invalidateQueries({ queryKey: ["course-materials"] });
    } catch {
      toast.error("Download failed");
    }
  }

  function openUpload() {
    setEditItem(null); setTitle(""); setDescription(""); setTags(""); setFiles([]);
    setMaterialType("notes"); setCourseId(courses[0]?.id ?? ""); setUploadOpen(true);
  }

  function openEdit(m: MaterialRow) {
    setEditItem(m); setTitle(m.title); setDescription(m.description || ""); setTags(m.tags || "");
    setMaterialType((m.material_type as MaterialType) || "notes"); setCourseId(m.course_id);
    setFiles([]); setUploadOpen(true); setMenuId(null);
  }

  if (!courses.length) {
    return (
      <EmptyState icon={BookOpen} title="No courses yet"
        description={role === "teacher" ? "When courses are assigned, you can upload materials here." : "Materials for your courses will appear here."} />
    );
  }

  const onlyImages = files.length > 0 && files.every(isImageFile);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Learning Materials" description="Access and download study materials" />
        {canUpload && (
          <Button className="shrink-0 gap-1.5 font-semibold" onClick={openUpload}>
            <Upload className="h-4 w-4" /> Upload Material
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search materials..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className={cn("flex flex-wrap gap-2", !showMobileFilters && "max-sm:hidden")}>
          <select className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold" value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)}>
            <option value="all">All Classes</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code || c.name}</option>)}
          </select>
          <select className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="recent">Recent</option>
            <option value="oldest">Oldest</option>
            <option value="downloads">Most Downloaded</option>
          </select>
        </div>
        <Button type="button" size="icon" variant="outline" className="sm:hidden" aria-label="Filters" onClick={() => setShowMobileFilters((v) => !v)}>
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {(Object.keys(CAT_META) as (keyof typeof CAT_META)[]).map((key) => {
          const meta = CAT_META[key];
          const Icon = meta.icon;
          const active = catFilter === key;
          return (
            <button key={key} type="button" onClick={() => setCatFilter((c) => (c === key ? null : key))}
              className={cn("flex items-center gap-3 rounded-2xl border p-3 text-left shadow-sm transition sm:p-4",
                active ? "border-primary/40 ring-2 ring-primary/20" : "border-slate-100 bg-white hover:border-slate-200")}>
              <span className={cn("grid h-10 w-10 place-items-center rounded-xl", meta.wrap)}><Icon className="h-5 w-5" /></span>
              <span>
                <span className="block text-sm font-bold text-slate-900">{meta.label}</span>
                <span className="text-xs text-slate-500">{counts[key]} Materials</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">
          {catFilter ? CAT_META[catFilter as keyof typeof CAT_META].label : "Recent Materials"}
        </h2>
        {catFilter && (
          <button type="button" className="text-xs font-semibold text-primary" onClick={() => setCatFilter(null)}>View All</button>
        )}
      </div>

      {listQ.isLoading ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading materials…</p>
      ) : listQ.isError ? (
        <p className="py-8 text-center text-sm text-red-600">{(listQ.error as Error)?.message || "Could not load materials."}</p>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText}
          title={search || filterType !== "all" || filterCourse !== "all" ? "No matching materials" : "No materials yet"}
          description={canUpload ? "Upload notes, assignments, past questions and more." : "When teachers share materials, they appear here."} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => {
            const meta = typeMeta(m.material_type);
            const Icon = meta.icon;
            const course = courseMap.get(m.course_id);
            const mine = m.uploaded_by === session?.userId;
            return (
              <div key={m.id} className="relative rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-slate-200 hover:shadow-md">
                <div className="mb-3 flex items-start justify-between">
                  <button type="button" className={cn("grid h-11 w-11 place-items-center rounded-xl", meta.wrap)} onClick={() => setViewer(m)} aria-label="Preview">
                    <Icon className="h-5 w-5" />
                  </button>
                  <div className="relative">
                    <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50" onClick={() => setMenuId((id) => (id === m.id ? null : m.id))} aria-label="More">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {menuId === m.id && (
                      <div className="absolute right-0 z-20 mt-1 min-w-[9rem] rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
                        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50" onClick={() => { setViewer(m); setMenuId(null); }}>
                          <Eye className="h-3.5 w-3.5" /> Preview
                        </button>
                        {m.file_url && (
                          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50" onClick={() => { void downloadMaterial(m); setMenuId(null); }}>
                            <Download className="h-3.5 w-3.5" /> Download
                          </button>
                        )}
                        {mine && (
                          <>
                            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50" onClick={() => openEdit(m)}>
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </button>
                            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50" onClick={() => void remove(m.id)}>
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <button type="button" className="w-full text-left" onClick={() => setViewer(m)}>
                  <p className="line-clamp-2 text-sm font-bold text-slate-900">{m.title}</p>
                  <span className={cn("mt-1.5 inline-block rounded-md px-2 py-0.5 text-[10px] font-bold", meta.badge)}>{meta.label}</span>
                  <p className="mt-2 text-xs text-slate-500">
                    {[course?.code || course?.name, m.uploader_name || (m.uploader_role === "teacher" ? "Teacher" : "Student")].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(m.created_at)}</span>
                    <span className="inline-flex items-center gap-1"><Download className="h-3 w-3" /> {m.download_count ?? 0}</span>
                    {m.file_size ? <span>{formatBytes(m.file_size)}</span> : null}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {canUpload && filtered.length > 0 && (
        <div className="mt-8 flex flex-col items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-slate-900">Organize and share knowledge easily</p>
            <p className="mt-1 text-sm text-slate-600">Upload notes, assignments, past questions and more to help students learn better.</p>
          </div>
          <Button className="gap-1.5 font-semibold" onClick={openUpload}><Upload className="h-4 w-4" /> Upload Material</Button>
        </div>
      )}

      {uploadOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog">
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="text-base font-bold">{editItem ? "Edit material" : "Upload Material"}</h3>
              <button type="button" className="rounded-lg p-1.5 hover:bg-slate-50" onClick={() => setUploadOpen(false)}><X className="h-5 w-5 text-slate-500" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {!editItem && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); onPickFiles(e.dataTransfer.files); }}
                  className={cn("flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-4 py-8 text-center",
                    dragOver ? "border-primary bg-primary/5" : "border-slate-200 bg-slate-50")}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="mb-2 h-8 w-8 text-primary" />
                  <p className="text-sm font-semibold">Drag & drop your file here</p>
                  <p className="mt-1 text-xs text-slate-500">or choose files · max {MAX_FILE_MB}MB · up to {MAX_FILES}</p>
                  <Button type="button" size="sm" variant="outline" className="mt-3 font-semibold" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>Choose File</Button>
                  <input ref={fileRef} type="file" className="hidden" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.ppt,.pptx,.txt,image/*" onChange={(e) => onPickFiles(e.target.files)} />
                </div>
              )}
              {files.length > 0 && (
                <ul className="space-y-1 rounded-xl border border-slate-100 p-2 text-xs">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex justify-between gap-2">
                      <span className="truncate font-medium">{f.name} · {formatBytes(f.size)}</span>
                      <button type="button" className="text-red-600" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>Remove</button>
                    </li>
                  ))}
                </ul>
              )}
              {busy && progress > 0 && (
                <div>
                  <div className="mb-1 flex justify-between text-[11px] font-semibold"><span>Uploading…</span><span>{progress}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
                </div>
              )}
              {onlyImages && !editItem && (
                <label className="flex items-start gap-2 text-xs">
                  <input type="checkbox" className="mt-0.5" checked={imagesToPdf} onChange={(e) => setImagesToPdf(e.target.checked)} />
                  <span><FileImage className="mr-1 inline h-3.5 w-3.5" />Convert images to one PDF</span>
                </label>
              )}
              <label className="block text-xs font-semibold">Title *<Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Material title" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold">Type
                  <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={materialType} onChange={(e) => setMaterialType(e.target.value as MaterialType)}>
                    {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-semibold">Subject / Class
                  <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                    {courses.map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code} — ${c.name}` : c.name}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-xs font-semibold">Description<Textarea className="mt-1" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
              <label className="block text-xs font-semibold">Tags<Input className="mt-1" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. week3, formulas" /></label>
            </div>
            <div className="flex gap-2 border-t border-slate-100 p-4">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setUploadOpen(false)}>Cancel</Button>
              <Button type="button" className="flex-1 gap-1.5 font-semibold" disabled={busy} onClick={() => void (editItem ? saveEdit() : submitUpload())}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {editItem ? "Save changes" : "Upload Material"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {viewer && (
        <MaterialViewer item={viewer} siblings={filtered} onClose={() => setViewer(null)} onNavigate={(m) => setViewer(m as MaterialRow)} />
      )}
    </>
  );
}
