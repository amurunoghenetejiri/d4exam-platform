-- D4EXAM: ensure every role can read/write OWN notifications + insert for others
-- Run once in Supabase SQL Editor (safe to re-run)

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS action_url text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type text DEFAULT 'info';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS message text DEFAULT '';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS school_id uuid;

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.notifications ALTER COLUMN entity_id TYPE text USING entity_id::text;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_id text;
  END;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON public.notifications (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications (recipient_user_id)
  WHERE read_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

DROP POLICY IF EXISTS "notifications_own_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_own_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_own_delete" ON public.notifications;
DROP POLICY IF EXISTS "notifications_authenticated_insert" ON public.notifications;
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
DROP POLICY IF EXISTS notifications_insert_self ON public.notifications;
DROP POLICY IF EXISTS "notifications_admin_write" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;

CREATE POLICY "notifications_own_select"
  ON public.notifications FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

CREATE POLICY "notifications_own_update"
  ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

CREATE POLICY "notifications_own_delete"
  ON public.notifications FOR DELETE TO authenticated
  USING (recipient_user_id = auth.uid());

CREATE POLICY "notifications_authenticated_insert"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND recipient_user_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.insert_notification(
  _recipient uuid,
  _title text,
  _message text,
  _type text DEFAULT 'info',
  _school_id uuid DEFAULT NULL,
  _link text DEFAULT NULL,
  _entity_type text DEFAULT NULL,
  _entity_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _recipient IS NULL THEN
    RAISE EXCEPTION 'recipient required';
  END IF;

  INSERT INTO public.notifications (
    recipient_user_id, school_id, title, message, type, link, action_url, entity_type, entity_id
  ) VALUES (
    _recipient,
    _school_id,
    coalesce(nullif(trim(_title), ''), 'Notification'),
    coalesce(_message, ''),
    coalesce(nullif(trim(_type), ''), 'info'),
    _link,
    _link,
    _entity_type,
    nullif(trim(coalesce(_entity_id, '')), '')
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_notification(uuid, text, text, text, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_notification(uuid, text, text, text, uuid, text, text, text) TO service_role;

-- push_devices: every role can manage own tokens
CREATE TABLE IF NOT EXISTS public.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  role text,
  user_agent text,
  enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token)
);

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_devices TO authenticated;
GRANT ALL ON public.push_devices TO service_role;

DROP POLICY IF EXISTS push_devices_own_select ON public.push_devices;
DROP POLICY IF EXISTS push_devices_own_insert ON public.push_devices;
DROP POLICY IF EXISTS push_devices_own_update ON public.push_devices;
DROP POLICY IF EXISTS push_devices_own_delete ON public.push_devices;

CREATE POLICY push_devices_own_select ON public.push_devices
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY push_devices_own_insert ON public.push_devices
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY push_devices_own_update ON public.push_devices
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY push_devices_own_delete ON public.push_devices
  FOR DELETE TO authenticated USING (user_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
