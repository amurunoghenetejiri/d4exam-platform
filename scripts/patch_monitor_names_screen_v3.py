from pathlib import Path
p = Path("src/routes/officer.live-monitor.tsx")
t = p.read_text()

t = t.replace(
    'dual ? "grid grid-cols-1 sm:grid-cols-2" : "grid grid-cols-1"',
    'dual ? "grid grid-cols-1 sm:grid-cols-[1.35fr_1fr]" : "grid grid-cols-1"',
    1,
)

if "studentNamesQ" not in t:
    insert_at = t.find("  const cards = useMemo(")
    block = '''
  const studentIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const a of attemptsQ.data ?? []) ids.add(String(a.student_id));
    for (const a of recentDoneQ.data ?? []) ids.add(String(a.student_id));
    return Array.from(ids).sort().join(",");
  }, [attemptsQ.data, recentDoneQ.data]);

  const studentNamesQ = useQuery({
    queryKey: ["officer-live-student-names", schoolId, studentIdsKey],
    enabled: Boolean(schoolId && studentIdsKey),
    staleTime: 30_000,
    queryFn: async () => {
      const ids = studentIdsKey.split(",").filter(Boolean);
      if (!ids.length) return {} as Record<string, string>;
      const map: Record<string, string> = {};
      const { data: studs } = await supabase
        .from("students")
        .select("id, full_name, matric_number, profiles(full_name)")
        .eq("school_id", schoolId!)
        .in("id", ids);
      for (const s of studs ?? []) {
        const row = s as {
          id: string;
          full_name?: string | null;
          matric_number?: string | null;
          profiles?: { full_name?: string | null } | { full_name?: string | null }[] | null;
        };
        const matric = String(row.matric_number || "").trim();
        let name = String(row.full_name || "").trim();
        const prof = row.profiles;
        const pName = Array.isArray(prof)
          ? String(prof[0]?.full_name || "").trim()
          : String((prof as { full_name?: string | null } | null)?.full_name || "").trim();
        if (!name || name.toLowerCase() === matric.toLowerCase()) name = pName || name;
        if (name && name.toLowerCase() !== matric.toLowerCase()) map[row.id] = name;
      }
      return map;
    },
  });

'''
    if insert_at < 0:
        raise SystemExit("cards missing")
    t = t[:insert_at] + block + t[insert_at:]
    print("namesQ")

if "studentNamesQ.data" not in t:
    t = t.replace(
        "const name = studentDisplayName(a);",
        """const resolved = studentNamesQ.data?.[String(a.student_id)];
        const name = (resolved && resolved.trim()) || studentDisplayName(a);""",
        1,
    )
    t = t.replace(
        "}, [attemptsQ.data, recentDoneQ.data, now, frames, screenFrames, feedMode]);",
        "}, [attemptsQ.data, recentDoneQ.data, now, frames, screenFrames, feedMode, studentNamesQ.data]);",
        1,
    )
    print("name use")

p.write_text(t)
print("ok", p.stat().st_size)
