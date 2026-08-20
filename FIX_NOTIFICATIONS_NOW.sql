-- Notifications: RLS, insert RPC, realtime, super-admin application trigger
-- Paste into Supabase SQL Editor and Run

alter table public.notifications enable row level security;
alter table public.notifications replica identity full;

drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_delete_own on public.notifications;
drop policy if exists notifications_authenticated_insert on public.notifications;
drop policy if exists "notifications_own_select" on public.notifications;
drop policy if exists "notifications_own_update" on public.notifications;
drop policy if exists "notifications_own_delete" on public.notifications;
drop policy if exists "notifications_authenticated_insert" on public.notifications;

create policy notifications_select_own
  on public.notifications for select to authenticated
  using (recipient_user_id = auth.uid());

create policy notifications_update_own
  on public.notifications for update to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

create policy notifications_delete_own
  on public.notifications for delete to authenticated
  using (recipient_user_id = auth.uid());

create policy notifications_authenticated_insert
  on public.notifications for insert to authenticated
  with check (recipient_user_id is not null and auth.uid() is not null);

grant select, insert, update, delete on public.notifications to authenticated;

create or replace function public.insert_notification(
  _recipient uuid,
  _title text,
  _message text default '',
  _type text default 'info',
  _school_id uuid default null,
  _link text default null,
  _entity_type text default null,
  _entity_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  new_id uuid;
begin
  if _recipient is null then
    raise exception 'recipient required';
  end if;
  insert into public.notifications (
    recipient_user_id, school_id, title, message, type, link, entity_type, entity_id
  ) values (
    _recipient,
    _school_id,
    coalesce(nullif(trim(_title), ''), 'Notification'),
    coalesce(_message, ''),
    coalesce(nullif(trim(_type), ''), 'info'),
    nullif(trim(coalesce(_link, '')), ''),
    nullif(trim(coalesce(_entity_type, '')), ''),
    nullif(trim(coalesce(_entity_id, '')), '')
  )
  returning id into new_id;
  return new_id;
end;
$fn$;

grant execute on function public.insert_notification(uuid, text, text, text, uuid, text, text, text) to authenticated;
grant execute on function public.insert_notification(uuid, text, text, text, uuid, text, text, text) to service_role;

create or replace function public.notify_super_admins_new_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
  v_msg text;
begin
  v_msg := coalesce(NEW.school_name, 'A school')
    || ' submitted an application'
    || case when NEW.tracking_code is not null and length(trim(NEW.tracking_code)) > 0
         then ' (ref ' || trim(NEW.tracking_code) || ')'
         else '' end
    || '. Open Applications to review.';
  for r in
    select distinct ur.user_id
    from public.user_roles ur
    where ur.role = 'super_admin' and ur.user_id is not null
  loop
    insert into public.notifications (
      recipient_user_id, title, message, type, link, entity_type, entity_id
    ) values (
      r.user_id,
      'New school application',
      v_msg,
      'info',
      '/super-admin/applications',
      'school_application',
      NEW.id::text
    );
  end loop;
  return NEW;
exception when others then
  raise warning 'notify_super_admins_new_application: %', SQLERRM;
  return NEW;
end;
$fn$;

drop trigger if exists trg_notify_super_admins_new_application on public.school_applications;
create trigger trg_notify_super_admins_new_application
  after insert on public.school_applications
  for each row execute function public.notify_super_admins_new_application();

do $fn$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when others then null;
  end;
end;
$fn$;
