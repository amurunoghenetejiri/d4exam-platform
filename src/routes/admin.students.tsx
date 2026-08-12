import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSchoolUser, importStudents } from "@/lib/auth.functions";
import { useSessionUser } from "@/lib/session";
import { useRows } from "@/lib/queries";
import { toast } from "sonner";
import { Copy, Loader2, Upload } from "lucide-react";

export const Route = createFileRoute("/admin/students")({
  head: () => ({
    meta: [{ title: "Students — D4EXAM" }],
  }),
  component: Page,
});

type StudentRow = {
  id: string;
  student_id: string;
  matric_number: string | null;
  status: string;
  profiles: { full_name: string; email?: string } | null;
};

type Cred = {
  fullName: string;
  identifier: string;
  email: string;
  password: string;
};

function parseCsv(text: string) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        q = !q;
        continue;
      }
      if ((c === "," || c === "\t") && !q) {
        out.push(cur.trim());
        cur = "";
        continue;
      }
      cur += c;
    }
    out.push(cur.trim());
    return out;
  };

  const headers = split(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const idx = (names: string[]) => headers.findIndex((h) => names.includes(h));

  const iFirst = idx(["first_name", "firstname", "first"]);
  const iLast = idx(["last_name", "lastname", "last", "surname"]);
  const iEmail = idx(["email", "e-mail"]);
  const iId = idx(["student_id", "matric", "matric_number", "admission_number", "id"]);
  const iMatric = idx(["matric_number", "matric"]);

  const rows = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = split(lines[r]);
    const firstName = (iFirst >= 0 ? cols[iFirst] : cols[0]) || "";
    const lastName = (iLast >= 0 ? cols[iLast] : cols[1]) || "";
    const email = (iEmail >= 0 ? cols[iEmail] : cols[2]) || "";
    const identifier = (iId >= 0 ? cols[iId] : cols[3]) || "";
    const matricNumber = iMatric >= 0 ? cols[iMatric] : identifier;
    if (!firstName || !email || !identifier) continue;
    rows.push({
      firstName: firstName.trim(),
      lastName: (lastName || "Student").trim(),
      email: email.trim().toLowerCase(),
      identifier: identifier.trim(),
      matricNumber: (matricNumber || identifier).trim(),
    });
  }
  return rows;
}

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const createOne = useServerFn(createSchoolUser);
  const importMany = useServerFn(importStudents);
  const qc = useQueryClient();

  const list = useRows<StudentRow>({
    table: "students",
    select: "id, student_id, matric_number, status, profiles(full_name, email)",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "created_at", ascending: false },
    limit: 200,
    enabled: Boolean(schoolId),
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [lastCreds, setLastCreds] = useState<Cred[] | null>(null);
  const [preview, setPreview] = useState<ReturnType<typeof parseCsv>>([]);

  const schoolCode = user?.schoolCode ?? "";

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["rows"] });
    await qc.invalidateQueries({ queryKey: ["count"] });
    await list.refetch();
  }

  async function addStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId) {
      toast.error("Your account is not linked to a school.");
      return;
    }
    setBusy(true);
    try {
      const result = await createOne({
        data: {
          role: "student",
          firstName: firstName.trim(),
          lastName: lastName.trim() || "Student",
          email: email.trim().toLowerCase(),
          identifier: identifier.trim(),
          matricNumber: identifier.trim(),
        },
      });
      setLastCreds([
        {
          fullName: `${firstName} ${lastName}`.trim(),
          identifier: identifier.trim(),
          email: email.trim().toLowerCase(),
          password: (result as { password?: string }).password ?? "(see server)",
        },
      ]);
      toast.success("Student created. Copy the login details below.");
      setFirstName("");
      setLastName("");
      setEmail("");
      setIdentifier("");
      await refresh();
    } catch (err) {
      toast.error((err as Error).message || "Could not create student");
    } finally {
      setBusy(false);
    }
  }

  function onFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const rows = parseCsv(text);
      setPreview(rows);
      if (rows.length === 0) toast.error("No valid rows found. Use the CSV template columns.");
      else toast.message(`${rows.length} students ready to import`);
    };
    reader.readAsText(file);
  }

  async function runImport() {
    if (preview.length === 0) return;
    setImportBusy(true);
    try {
      const result = await importMany({ data: { rows: preview } });
      const creds = (result as { credentials?: Cred[] }).credentials ?? [];
      if (creds.length) setLastCreds(creds);
      toast.success(`Imported ${(result as { created?: number }).created ?? 0} students`);
      const fails = (result as { failures?: { identifier: string; reason: string }[] }).failures ?? [];
      if (fails.length) toast.error(`${fails.length} failed — check emails are unique`);
      setPreview([]);
      await refresh();
    } catch (err) {
      toast.error((err as Error).message || "Import failed");
    } finally {
      setImportBusy(false);
    }
  }

  function copyCreds() {
    if (!lastCreds?.length) return;
    const text = lastCreds
      .map(
        (c) =>
          `${c.fullName}\nSchool code: ${schoolCode}\nMatric/ID: ${c.identifier}\nEmail: ${c.email}\nPassword: ${c.password}\nLogin: /login`,
      )
      .join("\n\n");
    void navigator.clipboard.writeText(text);
    toast.success("Credentials copied");
  }

  const templateHint = useMemo(
    () => "first_name,last_name,email,student_id,matric_number",
    [],
  );

  return (
    <>
      <PageHeader
        title="Students"
        description="Add one student or import a list from Excel (save as CSV). Each student gets a password you can copy and share."
      />

      {!schoolId && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your account is not linked to a school yet.
        </p>
      )}

      {lastCreds && lastCreds.length > 0 && (
        <SectionCard title="Login details (copy and share with students)">
          <div className="max-h-56 overflow-auto rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 font-mono text-xs">
            {lastCreds.map((c) => (
              <div key={c.email + c.identifier} className="border-b border-emerald-100 py-2 last:border-0">
                <p className="font-sans font-semibold text-slate-800">{c.fullName}</p>
                <p>School code: {schoolCode || "(your school code)"}</p>
                <p>ID: {c.identifier}</p>
                <p>Email: {c.email}</p>
                <p>Password: {c.password}</p>
              </div>
            ))}
          </div>
          <Button type="button" size="sm" className="mt-3 gap-2 font-semibold" onClick={copyCreds}>
            <Copy className="h-3.5 w-3.5" />
            Copy all
          </Button>
        </SectionCard>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard title="Add one student">
          <form className="space-y-3" onSubmit={addStudent}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Matric / Student ID</Label>
              <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            </div>
            <Button type="submit" disabled={busy || !schoolId} className="font-semibold">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create student
            </Button>
          </form>
        </SectionCard>

        <SectionCard title="Import from Excel / CSV">
          <p className="text-sm text-slate-600">
            In Excel: File → Save As → CSV. Columns must include:
          </p>
          <code className="mt-2 block rounded-lg bg-slate-100 px-3 py-2 text-xs">{templateHint}</code>
          <div className="mt-4">
            <Label htmlFor="csv">Upload CSV</Label>
            <Input
              id="csv"
              type="file"
              accept=".csv,text/csv,.txt"
              className="mt-1.5"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {preview.length > 0 && (
            <p className="mt-2 text-sm text-slate-700">{preview.length} rows ready</p>
          )}
          <Button
            type="button"
            className="mt-4 gap-2 font-semibold"
            disabled={importBusy || preview.length === 0 || !schoolId}
            onClick={() => void runImport()}
          >
            {importBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import students
          </Button>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Student list">
          {(list.data ?? []).length === 0 ? (
            <EmptyState title="No students yet" description="Add or import students to see them here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {(list.data ?? []).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-semibold text-slate-900">{s.profiles?.full_name ?? "—"}</p>
                    <p className="text-xs text-slate-500">
                      {s.matric_number ?? s.student_id}
                      {s.profiles?.email ? ` · ${s.profiles.email}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
