-- Idle timeout, enforced in the database (issue #4).
-- Every API request extends its session's deadline by the configured idle time.
-- Once a deadline passes the session stays dead: a refreshed token keeps the same
-- session_id, so it can't revive it. Upsert-with-condition is atomic, so
-- concurrent requests on the same session agree on whether it's alive.
-- ponytail: rows of ended sessions are never pruned; add a cleanup job if the table grows.
create table private.session_activity (
  session_id uuid primary key,
  expires_at timestamptz not null
);
revoke all on private.session_activity from public, anon, authenticated;

create function private.touch_session(idle interval)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  with t as (
    insert into private.session_activity as s (session_id, expires_at)
    select (auth.jwt() ->> 'session_id')::uuid, now() + idle
    where auth.jwt() ->> 'session_id' is not null
    on conflict (session_id) do update set expires_at = excluded.expires_at
      where s.expires_at > now()
    returning 1
  )
  select exists (select 1 from t);
$$;

create function private.session_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.session_activity
    where session_id = (auth.jwt() ->> 'session_id')::uuid and expires_at > now()
  );
$$;

revoke execute on function private.touch_session(interval), private.session_active() from public, anon;
grant execute on function private.touch_session(interval), private.session_active() to authenticated;
