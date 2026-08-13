import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader, SectionCard } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSchoolUser, importStudents } from "@/lib/auth.functions";
import { useSessionUser } from "@/lib/session";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

export const Route = createFileRoute("/admin/student-import")({
  head: () => ({
    meta: [{ title: "Student Import — D4EXAM" }],
  }),
  component: Page,
});

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
  const schoolCode = user?.schoolCode ?? "";
  const createOne = useServerFn(createSchoolUser);
  const importMany = useServerFn(importStudents);
  const qc = useQueryClient();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [preview, setPreview] = useState<ReturnType<typeof parseCsv>>([]);

  async function addStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId) { toast.error("Not linked to a school"); return; }
    setBusy(true);
    try {
      await createOne({
        data: {
          role: "student",
          firstName: firstName.trim(),
          lastName: lastName.trim() || "Student",
          email: email.trim().toLowerCase(),
          identifier: identifier.trim(),
          matricNumber: identifier.trim(),
        },
      });
      toast.success(
        `Student created. They log in with school code + matric (${identifier.trim()}) as password.`,
      );
      setFirstName("");
      setLastName("");
      setEmail("");
      setIdentifier("");
      await qc.invalidateQueries({ queryKey: ["rows"] });
      await qc.invalidateQueries({ queryKey: ["count"] });
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
      const rows = parseCsv(String(reader.result ?? ""));
      setPreview(rows);
      if (!rows.length) toast.error("No valid rows. Check CSV headers.");
      else toast.message(`${rows.length} students ready`);
    };
    reader.readAsText(file);
  }

  async function runImport() {
    if (!preview.length) return;
    setImportBusy(true);
    try {
      const result = await importMany({ data: { rows: preview } });
      toast.success(
        `Imported ${(result as { created?: number }).created ?? 0} students. Password for each is their matric / student ID.`,
      );
      const fails = (result as { failures?: unknown[] }).failures ?? [];
      if (fails.length) toast.error(`${fails.length} rows failed (often duplicate email)`);
      setPreview([]);
      await qc.invalidateQueries({ queryKey: ["rows"] });
      await qc.invalidateQueries({ queryKey: ["count"] });
    } catch (err) {
      toast.error((err as Error).message || "Import failed");
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Student Import"
        description="Add or bulk-import students. No password list to copy — each student logs in with their matric / student ID as password."
        actions={
          <Button variant="outline" asChild>
            <Link to="/admin/students">View student list</Link>
          </Button>
        }
      />

      <SectionCard title="How students log in">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>
            School code: <strong>{schoolCode || "(your school code)"}</strong>
          </li>
          <li>Username: their email OR matric / student ID</li>
          <li>
            Password: <strong>exactly their matric / student ID</strong> (same number they already know)
          </li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          Tell the class once: "Password is your matric number." No need to message 200 different passwords.
        </p>
      </SectionCard>

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
              <Label>Matric / Student ID (also their password)</Label>
              <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            </div>
            <Button type="submit" disabled={busy || !schoolId} className="font-semibold">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create student
            </Button>
          </form>
        </SectionCard>

        <SectionCard title="Import CSV from Excel">
          <p className="text-sm text-slate-600">Save Excel as CSV. Required header:</p>
          <code className="mt-2 block rounded-lg bg-slate-100 px-3 py-2 text-xs">
            first_name,last_name,email,student_id,matric_number
          </code>
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
            disabled={importBusy || !preview.length || !schoolId}
            onClick={() => void runImport()}
          >
            {importBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import students
          </Button>
        </SectionCard>
      </div>
    </>
  );
}
