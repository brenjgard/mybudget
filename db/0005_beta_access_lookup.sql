-- Optional alternative to SUPABASE_SERVICE_ROLE_KEY for signup-time approval checks.
-- This avoids granting direct anonymous SELECT access to approved_beta_users.
create or replace function public.is_approved_beta_email(candidate_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.approved_beta_users
    where lower(trim(email)) = lower(trim(candidate_email))
  );
$$;

grant execute on function public.is_approved_beta_email(text) to anon, authenticated;
