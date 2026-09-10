create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata jsonb;
begin
  metadata := new.raw_user_meta_data;

  insert into public.teachers (
    id,
    full_name,
    display_name,
    avatar_url,
    school_name
  )
  values (
    new.id,
    nullif(coalesce(metadata->>'full_name', metadata->>'name', ''), ''),
    nullif(coalesce(metadata->>'display_name', metadata->>'preferred_name', metadata->>'name', ''), ''),
    nullif(coalesce(metadata->>'avatar_url', metadata->>'picture', ''), ''),
    nullif(coalesce(metadata->>'school_name', ''), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
