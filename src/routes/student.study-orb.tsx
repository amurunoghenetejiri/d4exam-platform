import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Flame,
  GraduationCap,
  Loader2,
  Plus,
  Search,
  Users,
  Sparkles,
} from "lucide-react";
import { PageHeader, EmptyState, SectionCard } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStudentContext } from "@/lib/student";
import { useSessionUser } from "@/lib/session";
import {
  createStudyGroup,
  joinPublicGroup,
  useDiscoverStudyGroups,
  useMyStudyGroups,
  type StudyGroup,
} from "@/lib/study-orb";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/student/study-orb")({
  head: () => ({
    meta: [
      { title: "Study Orb — D4EXAM" },
      { name: "description", content: "Academic study groups inside D4EXAM" },
    ],
  }),
  component: StudyOrbHome,
});

function StudyOrbHome() {
  const { data: student, isLoading } = useStudentContext();
  const { data: session } = useSessionUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const myQ = useMyStudyGroups();
  const discoverQ = useDiscoverStudyGroups();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");

  const myGroups = myQ.data ?? [];
  const discover = (discoverQ.data ?? []).filter((g) => !myGroups.some((m) => m.id === g.id));

  const filteredMy = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return myGroups;
    return myGroups.filter((g) =>
      [g.name, g.description, g.courses?.code, g.departments?.name].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [myGroups, search]);

  const filteredDiscover = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return discover;
    return discover.filter((g) =>
      [g.name, g.description, g.courses?.code, g.departments?.name].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [discover, search]);

  const activeNow = useMemo(() => {
    const cutoff = Date.now() - 1000 * 60 * 60 * 24;
    return myGroups
      .filter((g) => g.last_message_at && +new Date(g.last_message_at) > cutoff)
      .slice(0, 8);
  }, [myGroups]);

  async function onCreate() {
    if (!student?.schoolId || !session?.profileId) return;
    if (!name.trim()) return toast.error("Enter a group name");
    setBusy(true);
    try {
      const res = await createStudyGroup({
        schoolId: student.schoolId,
        profileId: session.profileId,
        name: name.trim(),
        description,
        visibility,
        departmentId: student.departmentId,
        levelId: student.levelId,
      });
      if (!res.ok) throw new Error(res.error);
      toast.success("Study group created");
      setCreateOpen(false);
      setName("");
      setDescription("");
      await qc.invalidateQueries({ queryKey: ["study-orb-my-groups"] });
      void navigate({ to: "/student/study-orb/$groupId", params: { groupId: res.id } });
    } catch (e) {
      toast.error((e as Error).message || "Could not create group");
    } finally {
      setBusy(false);
    }
  }

  async function onJoin(g: StudyGroup) {
    if (!session?.profileId) return;
    setBusy(true);
    try {
      await joinPublicGroup(g.id, session.profileId);
      toast.success(`Joined ${g.name}`);
      await qc.invalidateQueries({ queryKey: ["study-orb-my-groups"] });
      await qc.invalidateQueries({ queryKey: ["study-orb-discover"] });
      void navigate({ to: "/student/study-orb/$groupId", params: { groupId: g.id } });
    } catch (e) {
      toast.error((e as Error).message || "Could not join");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <p className="text-sm text-slate-500">Loading Study Orb…</p>;
  if (!student) {
    return (
      <EmptyState
        title="Student profile required"
        description="Study Orb uses your D4EXAM student record. Ask School Admin to link your account."
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-8">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/student"
            className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
          </Link>
          <PageHeader
            title="Study Orb"
            description="Learn together. Grow together — your academic community inside D4EXAM."
          />
        </div>
        <Button size="sm" className="shrink-0 gap-1.5 font-semibold" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Create
        </Button>
      </div>

      <div className="mb-4 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Search study groups…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <QuickStat icon={Users} label="My groups" value={myGroups.length} color="bg-primary/10 text-primary" />
        <QuickStat icon={Flame} label="Active" value={activeNow.length} color="bg-orange-50 text-orange-600" />
        <QuickStat icon={GraduationCap} label="Department" value={student.departmentName || "—"} color="bg-violet-50 text-violet-600" small />
        <QuickStat icon={BookOpen} label="Courses" value={student.courses?.length ?? 0} color="bg-emerald-50 text-emerald-600" />
      </div>

      {activeNow.length > 0 && (
        <SectionCard title="Active now" className="mb-4">
          <div className="space-y-2">
            {activeNow.map((g) => (
              <GroupRow key={g.id} group={g} onOpen={() => void navigate({ to: "/student/study-orb/$groupId", params: { groupId: g.id } })} />
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard
        title={`My groups (${filteredMy.length})`}
        className="mb-4"
        action={
          <Button variant="ghost" size="sm" className="text-primary font-semibold" onClick={() => setCreateOpen(true)}>
            + New
          </Button>
        }
      >
        {myQ.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : filteredMy.length === 0 ? (
          <EmptyState
            title="No study groups yet"
            description="Create a group for your course or discover public groups in your department."
            icon={Sparkles}
          />
        ) : (
          <div className="space-y-2">
            {filteredMy.map((g) => (
              <GroupRow key={g.id} group={g} onOpen={() => void navigate({ to: "/student/study-orb/$groupId", params: { groupId: g.id } })} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title={`Discover (${filteredDiscover.length})`} description="Public groups for your school and department">
        {discoverQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading groups…</p>
        ) : filteredDiscover.length === 0 ? (
          <EmptyState title="Nothing to discover yet" description="Be the first to create a public study group for your department." />
        ) : (
          <div className="space-y-2">
            {filteredDiscover.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{g.name}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {[g.courses?.code, g.departments?.name, g.levels?.name, `${g.member_count} members`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void onJoin(g)}>
                  Join
                </Button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {createOpen && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="text-base font-bold">Create study group</h3>
              <button type="button" className="text-slate-400" onClick={() => setCreateOpen(false)}>
                ✕
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div>
                <label className="text-xs font-semibold text-slate-600">Group name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CHM101 Warriors" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Description</label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What will you study?" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Visibility</label>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold",
                      visibility === "public" ? "border-primary bg-primary/5 text-primary" : "border-slate-200",
                    )}
                    onClick={() => setVisibility("public")}
                  >
                    Public
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold",
                      visibility === "private" ? "border-primary bg-primary/5 text-primary" : "border-slate-200",
                    )}
                    onClick={() => setVisibility("private")}
                  >
                    Private
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Scoped to {student.departmentName || "your department"}
                {student.levelName ? ` · ${student.levelName}` : ""}. You become group admin.
              </p>
            </div>
            <div className="flex gap-2 border-t border-slate-100 p-4">
              <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button className="flex-1 font-semibold" disabled={busy} onClick={() => void onCreate()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create group"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickStat({
  icon: Icon,
  label,
  value,
  color,
  small,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  color: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm">
      <div className={cn("mb-1 grid h-8 w-8 place-items-center rounded-lg", color)}>
        <Icon className="h-4 w-4" />
      </div>
      <p className={cn("font-extrabold text-slate-900", small ? "truncate text-xs" : "text-lg tabular-nums")}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function GroupRow({ group, onOpen }: { group: StudyGroup; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-primary/30 hover:shadow-md"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
        {group.name.slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-bold text-slate-900">{group.name}</p>
          {(group.unread ?? 0) > 0 && (
            <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {group.unread}
            </span>
          )}
        </div>
        <p className="truncate text-[11px] text-slate-500">
          {[group.courses?.code, group.departments?.name, `${group.member_count} members`].filter(Boolean).join(" · ")}
        </p>
        {group.last_message_preview && (
          <p className="mt-0.5 truncate text-[11px] text-slate-400">{group.last_message_preview}</p>
        )}
      </div>
      <Bell className="h-4 w-4 shrink-0 text-slate-300" />
    </button>
  );
}
