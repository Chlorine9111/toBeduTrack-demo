-- Teacher long-term memory for behavior/preferences/history

create table if not exists public.teacher_usage_memory (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null,
  teacher_id uuid references public.teachers(id) on delete set null,
  scope text not null default 'wechat_editor',
  preferences jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  history jsonb not null default '[]'::jsonb,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_key, scope)
);

create table if not exists public.teacher_usage_events (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.teacher_usage_memory(id) on delete cascade,
  profile_key text not null,
  teacher_id uuid references public.teachers(id) on delete set null,
  scope text not null default 'wechat_editor',
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists teacher_usage_memory_profile_idx
  on public.teacher_usage_memory (profile_key, scope);

create index if not exists teacher_usage_memory_teacher_idx
  on public.teacher_usage_memory (teacher_id);

create index if not exists teacher_usage_events_profile_created_idx
  on public.teacher_usage_events (profile_key, created_at desc);

create index if not exists teacher_usage_events_memory_created_idx
  on public.teacher_usage_events (memory_id, created_at desc);

create trigger teacher_usage_memory_set_updated_at
  before update on public.teacher_usage_memory
  for each row execute function public.set_updated_at();

alter table public.teacher_usage_memory enable row level security;
alter table public.teacher_usage_events enable row level security;

create policy "teacher_usage_memory_select_own" on public.teacher_usage_memory
  for select using (teacher_id = auth.uid());

create policy "teacher_usage_memory_insert_own" on public.teacher_usage_memory
  for insert with check (teacher_id is null or teacher_id = auth.uid());

create policy "teacher_usage_memory_update_own" on public.teacher_usage_memory
  for update using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "teacher_usage_events_select_own" on public.teacher_usage_events
  for select using (teacher_id = auth.uid());

create policy "teacher_usage_events_insert_own" on public.teacher_usage_events
  for insert with check (teacher_id is null or teacher_id = auth.uid());
