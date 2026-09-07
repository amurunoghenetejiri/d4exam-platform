import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/lib/session";
import { useStudentContext } from "@/lib/student";

export type StudyGroup = {
  id: string;
  school_id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  visibility: "public" | "private";
  department_id: string | null;
  course_id: string | null;
  level_id: string | null;
  max_members: number;
  created_by: string;
  member_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  departments?: { name?: string } | null;
  courses?: { code?: string; name?: string } | null;
  levels?: { name?: string } | null;
  unread?: number;
  my_role?: "admin" | "member" | null;
};

export type StudyMessage = {
  id: string;
  group_id: string;
  sender_profile_id: string;
  message_type: string;
  body: string | null;
  reply_to_id: string | null;
  material_id: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  duration_ms: number | null;
  is_pinned: boolean;
  is_question: boolean;
  answered_at: string | null;
  deleted_at: string | null;
  created_at: string;
  profiles?: { full_name?: string | null } | null;
};

export function useMyStudyGroups() {
  const { data: student } = useStudentContext();
  const { data: session } = useSessionUser();
  const profileId = session?.profileId;

  return useQuery({
    queryKey: ["study-orb-my-groups", profileId, student?.schoolId],
    enabled: Boolean(profileId && student?.schoolId),
    staleTime: 8_000,
    queryFn: async (): Promise<StudyGroup[]> => {
      const { data: memberships, error: mErr } = await supabase
        .from("study_group_members")
        .select("group_id, role, last_read_at")
        .eq("profile_id", profileId!)
        .is("left_at", null);
      if (mErr) {
        console.warn("[study-orb] my memberships", mErr.message);
        return [];
      }
      const ids = (memberships ?? []).map((m) => m.group_id as string);
      if (!ids.length) return [];

      const { data, error } = await supabase
        .from("study_groups")
        .select(
          "id, school_id, name, description, avatar_url, visibility, department_id, course_id, level_id, max_members, created_by, member_count, last_message_at, last_message_preview, created_at, departments(name), courses(code, name), levels(name)",
        )
        .in("id", ids)
        .is("archived_at", null)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) {
        console.warn("[study-orb] my groups", error.message);
        return [];
      }

      const roleMap = new Map(
        (memberships ?? []).map((m) => [String(m.group_id), String(m.role) as "admin" | "member"]),
      );
      const readMap = new Map(
        (memberships ?? []).map((m) => [String(m.group_id), m.last_read_at as string | null]),
      );

      const rows = (data ?? []) as StudyGroup[];
      for (const g of rows) {
        g.my_role = roleMap.get(g.id) ?? null;
        const since = readMap.get(g.id);
        try {
          let q = supabase
            .from("study_group_messages")
            .select("id", { count: "exact", head: true })
            .eq("group_id", g.id)
            .is("deleted_at", null);
          if (since) q = q.gt("created_at", since);
          const { count } = await q;
          g.unread = count ?? 0;
        } catch {
          g.unread = 0;
        }
      }
      return rows;
    },
  });
}

export function useDiscoverStudyGroups() {
  const { data: student } = useStudentContext();

  return useQuery({
    queryKey: [
      "study-orb-discover",
      student?.schoolId,
      student?.departmentId,
      student?.levelId,
    ],
    enabled: Boolean(student?.schoolId),
    staleTime: 15_000,
    queryFn: async (): Promise<StudyGroup[]> => {
      let q = supabase
        .from("study_groups")
        .select(
          "id, school_id, name, description, avatar_url, visibility, department_id, course_id, level_id, max_members, created_by, member_count, last_message_at, last_message_preview, created_at, departments(name), courses(code, name), levels(name)",
        )
        .eq("school_id", student!.schoolId)
        .eq("visibility", "public")
        .is("archived_at", null)
        .order("member_count", { ascending: false })
        .limit(80);
      if (student?.departmentId) {
        q = q.or(`department_id.eq.${student.departmentId},department_id.is.null`);
      }
      const { data, error } = await q;
      if (error) {
        console.warn("[study-orb] discover", error.message);
        return [];
      }
      return (data ?? []) as StudyGroup[];
    },
  });
}

export async function createStudyGroup(input: {
  schoolId: string;
  profileId: string;
  name: string;
  description?: string;
  visibility: "public" | "private";
  departmentId?: string | null;
  courseId?: string | null;
  levelId?: string | null;
  maxMembers?: number;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data: group, error } = await supabase
    .from("study_groups")
    .insert({
      school_id: input.schoolId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      visibility: input.visibility,
      department_id: input.departmentId || null,
      course_id: input.courseId || null,
      level_id: input.levelId || null,
      max_members: input.maxMembers ?? 100,
      created_by: input.profileId,
      member_count: 1,
    } as never)
    .select("id")
    .single();
  if (error || !group?.id) return { ok: false, error: error?.message || "Could not create group" };

  const { error: memErr } = await supabase.from("study_group_members").insert({
    group_id: group.id,
    profile_id: input.profileId,
    role: "admin",
  } as never);
  if (memErr) {
    console.warn("[study-orb] creator membership", memErr.message);
  }
  return { ok: true, id: String(group.id) };
}

export async function joinPublicGroup(groupId: string, profileId: string) {
  const { error } = await supabase.from("study_group_members").insert({
    group_id: groupId,
    profile_id: profileId,
    role: "member",
  } as never);
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  try {
    const { data } = await supabase.from("study_groups").select("member_count").eq("id", groupId).maybeSingle();
    const n = Number((data as { member_count?: number } | null)?.member_count ?? 0) + 1;
    await supabase.from("study_groups").update({ member_count: n } as never).eq("id", groupId);
  } catch {
    /* ignore */
  }
}

export async function leaveGroup(groupId: string, profileId: string) {
  await supabase
    .from("study_group_members")
    .update({ left_at: new Date().toISOString() } as never)
    .eq("group_id", groupId)
    .eq("profile_id", profileId);
}

export async function sendTextMessage(input: {
  groupId: string;
  profileId: string;
  body: string;
  replyToId?: string | null;
  isQuestion?: boolean;
  isAnnouncement?: boolean;
}) {
  const type = input.isAnnouncement ? "announcement" : input.isQuestion ? "question" : "text";
  const { data, error } = await supabase
    .from("study_group_messages")
    .insert({
      group_id: input.groupId,
      sender_profile_id: input.profileId,
      message_type: type,
      body: input.body.trim(),
      reply_to_id: input.replyToId || null,
      is_question: Boolean(input.isQuestion),
    } as never)
    .select("id, created_at")
    .single();
  if (error) throw new Error(error.message);
  const preview = input.body.trim().slice(0, 120);
  await supabase
    .from("study_groups")
    .update({
      last_message_at: data?.created_at || new Date().toISOString(),
      last_message_preview: preview,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", input.groupId);
  return data;
}

export async function markGroupRead(groupId: string, profileId: string) {
  await supabase
    .from("study_group_members")
    .update({ last_read_at: new Date().toISOString() } as never)
    .eq("group_id", groupId)
    .eq("profile_id", profileId)
    .is("left_at", null);
}

export function useGroupMessages(groupId: string | undefined) {
  const qc = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const q = useQuery({
    queryKey: ["study-orb-messages", groupId],
    enabled: Boolean(groupId),
    staleTime: 3_000,
    queryFn: async (): Promise<StudyMessage[]> => {
      const { data, error } = await supabase
        .from("study_group_messages")
        .select(
          "id, group_id, sender_profile_id, message_type, body, reply_to_id, material_id, attachment_url, attachment_name, attachment_mime, attachment_size, duration_ms, is_pinned, is_question, answered_at, deleted_at, created_at, profiles(full_name)",
        )
        .eq("group_id", groupId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) {
        console.warn("[study-orb] messages", error.message);
        return [];
      }
      return (data ?? []) as StudyMessage[];
    },
  });

  useEffect(() => {
    if (!groupId) return;
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    const ch = supabase
      .channel(`study-orb-msg-${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "study_group_messages", filter: `group_id=eq.${groupId}` },
        () => {
          void qc.invalidateQueries({ queryKey: ["study-orb-messages", groupId] });
          void qc.invalidateQueries({ queryKey: ["study-orb-my-groups"] });
        },
      )
      .subscribe();
    channelRef.current = ch;
    return () => {
      void supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [groupId, qc]);

  return q;
}

export async function uploadStudyOrbFile(
  schoolId: string,
  groupId: string,
  file: File,
): Promise<{ url: string; name: string; mime: string; size: number } | null> {
  const safe = file.name.replace(/[^\w.\-+() ]+/g, "_").slice(0, 100);
  const path = `${schoolId}/${groupId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
  const { error } = await supabase.storage.from("study-orb").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) {
    const fb = await supabase.storage.from("course-materials").upload(`study-orb/${path}`, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (fb.error) {
      console.warn("[study-orb] upload", error.message, fb.error.message);
      return null;
    }
    const { data } = supabase.storage.from("course-materials").getPublicUrl(`study-orb/${path}`);
    return { url: data.publicUrl, name: file.name, mime: file.type, size: file.size };
  }
  const { data } = supabase.storage.from("study-orb").getPublicUrl(path);
  return { url: data.publicUrl, name: file.name, mime: file.type, size: file.size };
}
