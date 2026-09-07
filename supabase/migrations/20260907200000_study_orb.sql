-- =============================================================================
-- D4EXAM Study Orb — academic student communities (idempotent)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_study_group_member(_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_group_members m
    WHERE m.group_id = _group_id
      AND m.profile_id = public.current_profile_id()
      AND m.left_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_study_group_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_study_group_admin(_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_group_members m
    WHERE m.group_id = _group_id
      AND m.profile_id = public.current_profile_id()
      AND m.role = 'admin'
      AND m.left_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_study_group_admin(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.study_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  avatar_url text,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  level_id uuid REFERENCES public.levels(id) ON DELETE SET NULL,
  max_members int NOT NULL DEFAULT 100 CHECK (max_members BETWEEN 2 AND 500),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_count int NOT NULL DEFAULT 1,
  last_message_at timestamptz,
  last_message_preview text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_study_groups_school ON public.study_groups (school_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_study_groups_dept ON public.study_groups (school_id, department_id);
CREATE INDEX IF NOT EXISTS idx_study_groups_course ON public.study_groups (course_id);

CREATE TABLE IF NOT EXISTS public.study_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  muted_at timestamptz,
  last_read_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE (group_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_sgm_profile ON public.study_group_members (profile_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sgm_group ON public.study_group_members (group_id) WHERE left_at IS NULL;

CREATE TABLE IF NOT EXISTS public.study_group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  sender_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_type text NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text','image','document','voice','material','question','poll','announcement','system')),
  body text,
  reply_to_id uuid REFERENCES public.study_group_messages(id) ON DELETE SET NULL,
  material_id uuid,
  attachment_url text,
  attachment_name text,
  attachment_mime text,
  attachment_size bigint,
  duration_ms int,
  is_pinned boolean NOT NULL DEFAULT false,
  is_question boolean NOT NULL DEFAULT false,
  answered_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sgmsg_group_created ON public.study_group_messages (group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.study_group_message_reactions (
  message_id uuid NOT NULL REFERENCES public.study_group_messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, profile_id, emoji)
);

CREATE TABLE IF NOT EXISTS public.study_group_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  inviter_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invitee_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, invitee_profile_id)
);

CREATE TABLE IF NOT EXISTS public.study_group_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.study_group_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES public.study_groups(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.study_group_messages(id) ON DELETE SET NULL,
  reporter_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.study_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_group_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_group_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_group_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_group_reports ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_group_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_group_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_group_message_reactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_group_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_group_join_requests TO authenticated;
GRANT SELECT, INSERT ON public.study_group_reports TO authenticated;

DROP POLICY IF EXISTS study_groups_select ON public.study_groups;
CREATE POLICY study_groups_select ON public.study_groups FOR SELECT TO authenticated
USING (
  archived_at IS NULL AND (
    public.is_study_group_member(id)
    OR visibility = 'public'
    OR created_by = public.current_profile_id()
  )
);

DROP POLICY IF EXISTS study_groups_insert ON public.study_groups;
CREATE POLICY study_groups_insert ON public.study_groups FOR INSERT TO authenticated
WITH CHECK (
  created_by = public.current_profile_id()
  AND school_id IS NOT NULL
);

DROP POLICY IF EXISTS study_groups_update ON public.study_groups;
CREATE POLICY study_groups_update ON public.study_groups FOR UPDATE TO authenticated
USING (public.is_study_group_admin(id));

DROP POLICY IF EXISTS study_group_members_select ON public.study_group_members;
CREATE POLICY study_group_members_select ON public.study_group_members FOR SELECT TO authenticated
USING (public.is_study_group_member(group_id) OR profile_id = public.current_profile_id());

DROP POLICY IF EXISTS study_group_members_insert ON public.study_group_members;
CREATE POLICY study_group_members_insert ON public.study_group_members FOR INSERT TO authenticated
WITH CHECK (
  profile_id = public.current_profile_id()
  OR public.is_study_group_admin(group_id)
);

DROP POLICY IF EXISTS study_group_members_update ON public.study_group_members;
CREATE POLICY study_group_members_update ON public.study_group_members FOR UPDATE TO authenticated
USING (
  profile_id = public.current_profile_id()
  OR public.is_study_group_admin(group_id)
);

DROP POLICY IF EXISTS study_group_messages_select ON public.study_group_messages;
CREATE POLICY study_group_messages_select ON public.study_group_messages FOR SELECT TO authenticated
USING (public.is_study_group_member(group_id));

DROP POLICY IF EXISTS study_group_messages_insert ON public.study_group_messages;
CREATE POLICY study_group_messages_insert ON public.study_group_messages FOR INSERT TO authenticated
WITH CHECK (
  public.is_study_group_member(group_id)
  AND sender_profile_id = public.current_profile_id()
);

DROP POLICY IF EXISTS study_group_messages_update ON public.study_group_messages;
CREATE POLICY study_group_messages_update ON public.study_group_messages FOR UPDATE TO authenticated
USING (
  sender_profile_id = public.current_profile_id()
  OR public.is_study_group_admin(group_id)
);

DROP POLICY IF EXISTS study_group_reactions_all ON public.study_group_message_reactions;
CREATE POLICY study_group_reactions_select ON public.study_group_message_reactions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.study_group_messages m
    WHERE m.id = message_id AND public.is_study_group_member(m.group_id)
  )
);
CREATE POLICY study_group_reactions_insert ON public.study_group_message_reactions FOR INSERT TO authenticated
WITH CHECK (profile_id = public.current_profile_id());
CREATE POLICY study_group_reactions_delete ON public.study_group_message_reactions FOR DELETE TO authenticated
USING (profile_id = public.current_profile_id());

DROP POLICY IF EXISTS study_group_invitations_select ON public.study_group_invitations;
CREATE POLICY study_group_invitations_select ON public.study_group_invitations FOR SELECT TO authenticated
USING (
  invitee_profile_id = public.current_profile_id()
  OR inviter_profile_id = public.current_profile_id()
  OR public.is_study_group_admin(group_id)
);
CREATE POLICY study_group_invitations_insert ON public.study_group_invitations FOR INSERT TO authenticated
WITH CHECK (inviter_profile_id = public.current_profile_id() AND public.is_study_group_member(group_id));
CREATE POLICY study_group_invitations_update ON public.study_group_invitations FOR UPDATE TO authenticated
USING (
  invitee_profile_id = public.current_profile_id()
  OR public.is_study_group_admin(group_id)
);

DROP POLICY IF EXISTS study_group_join_requests_select ON public.study_group_join_requests;
CREATE POLICY study_group_join_requests_select ON public.study_group_join_requests FOR SELECT TO authenticated
USING (
  profile_id = public.current_profile_id()
  OR public.is_study_group_admin(group_id)
);
CREATE POLICY study_group_join_requests_insert ON public.study_group_join_requests FOR INSERT TO authenticated
WITH CHECK (profile_id = public.current_profile_id());
CREATE POLICY study_group_join_requests_update ON public.study_group_join_requests FOR UPDATE TO authenticated
USING (public.is_study_group_admin(group_id) OR profile_id = public.current_profile_id());

DROP POLICY IF EXISTS study_group_reports_insert ON public.study_group_reports;
CREATE POLICY study_group_reports_insert ON public.study_group_reports FOR INSERT TO authenticated
WITH CHECK (reporter_profile_id = public.current_profile_id());
CREATE POLICY study_group_reports_select ON public.study_group_reports FOR SELECT TO authenticated
USING (reporter_profile_id = public.current_profile_id() OR public.is_super_admin());

ALTER TABLE public.study_group_messages REPLICA IDENTITY FULL;
ALTER TABLE public.study_group_members REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'study_group_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.study_group_messages;
  END IF;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'study_group_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.study_group_members;
  END IF;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
