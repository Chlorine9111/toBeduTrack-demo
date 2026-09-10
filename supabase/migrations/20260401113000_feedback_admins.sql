create table if not exists public.feedback_admins (
  teacher_id uuid primary key references public.teachers(id) on delete cascade,
  granted_by uuid null references public.teachers(id) on delete set null,
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_admins_created_at
  on public.feedback_admins (created_at desc);

alter table public.feedback_admins enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_admins'
      and policyname = 'feedback_admins_select_self'
  ) then
    create policy "feedback_admins_select_self"
      on public.feedback_admins
      for select
      to authenticated
      using (teacher_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_admins'
      and policyname = 'feedback_admins_service_role_full_access'
  ) then
    create policy "feedback_admins_service_role_full_access"
      on public.feedback_admins
      for all
      to public
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end
$$;
