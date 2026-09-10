create table if not exists public.teacher_memory_jobs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.teachers(id) on delete cascade,
  memory_id uuid references public.teacher_usage_memory(id) on delete set null,
  profile_key text not null,
  scope text not null,
  conversation_id uuid,
  turn_key text not null unique,
  job_type text not null default 'formation',
  status text not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teacher_memory_jobs_status_idx
  on public.teacher_memory_jobs (status, available_at asc, created_at asc);

create index if not exists teacher_memory_jobs_teacher_scope_idx
  on public.teacher_memory_jobs (teacher_id, scope, created_at desc);

create trigger teacher_memory_jobs_set_updated_at
  before update on public.teacher_memory_jobs
  for each row execute function public.set_updated_at();

alter table public.teacher_memory_jobs enable row level security;

create policy "teacher_memory_jobs_select_own" on public.teacher_memory_jobs
  for select using (teacher_id = auth.uid());

create policy "teacher_memory_jobs_insert_own" on public.teacher_memory_jobs
  for insert with check (teacher_id = auth.uid());

create policy "teacher_memory_jobs_update_own" on public.teacher_memory_jobs
  for update using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create table if not exists public.teacher_memory_mutations (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.teacher_usage_memory(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete cascade,
  profile_key text not null,
  scope text not null,
  turn_key text,
  bucket text not null,
  operation text not null,
  target_key text not null,
  before_value jsonb,
  after_value jsonb,
  reason text,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists teacher_memory_mutations_memory_created_idx
  on public.teacher_memory_mutations (memory_id, created_at desc);

create index if not exists teacher_memory_mutations_teacher_scope_idx
  on public.teacher_memory_mutations (teacher_id, scope, created_at desc);

create index if not exists teacher_memory_mutations_turn_idx
  on public.teacher_memory_mutations (turn_key, created_at desc);

alter table public.teacher_memory_mutations enable row level security;

create policy "teacher_memory_mutations_select_own" on public.teacher_memory_mutations
  for select using (teacher_id = auth.uid());

create policy "teacher_memory_mutations_insert_own" on public.teacher_memory_mutations
  for insert with check (teacher_id = auth.uid());
