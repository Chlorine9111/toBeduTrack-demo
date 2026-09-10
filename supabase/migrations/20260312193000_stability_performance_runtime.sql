create table if not exists public.app_feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_feature_flags enable row level security;

create policy "app_feature_flags_select_authenticated"
  on public.app_feature_flags
  for select
  to authenticated
  using (true);

create trigger app_feature_flags_set_updated_at
  before update on public.app_feature_flags
  for each row execute function public.set_updated_at();

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow text not null,
  request_id text,
  teacher_id uuid references auth.users(id) on delete set null,
  conversation_id uuid,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists workflow_runs_workflow_created_idx
  on public.workflow_runs (workflow, created_at desc);

create index if not exists workflow_runs_teacher_created_idx
  on public.workflow_runs (teacher_id, created_at desc);

create trigger workflow_runs_set_updated_at
  before update on public.workflow_runs
  for each row execute function public.set_updated_at();

alter table public.workflow_runs enable row level security;

create policy "workflow_runs_select_own"
  on public.workflow_runs
  for select
  using (teacher_id = auth.uid() or teacher_id is null);

create table if not exists public.workflow_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.workflow_runs(id) on delete set null,
  workflow text not null,
  step text not null,
  status text not null check (status in ('running', 'completed', 'failed')),
  provider text,
  model text,
  duration_ms integer,
  ttft_ms integer,
  input_tokens integer,
  output_tokens integer,
  cache_hit boolean not null default false,
  fallback_triggered boolean not null default false,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workflow_run_steps_run_created_idx
  on public.workflow_run_steps (run_id, created_at desc);

create index if not exists workflow_run_steps_workflow_created_idx
  on public.workflow_run_steps (workflow, created_at desc);

alter table public.workflow_run_steps enable row level security;

create policy "workflow_run_steps_select_own"
  on public.workflow_run_steps
  for select
  using (
    run_id is null
    or exists (
      select 1
      from public.workflow_runs wr
      where wr.id = workflow_run_steps.run_id
        and (wr.teacher_id = auth.uid() or wr.teacher_id is null)
    )
  );

create table if not exists public.background_task_failures (
  id uuid primary key default gen_random_uuid(),
  task_type text not null,
  task_key text not null,
  teacher_id uuid references auth.users(id) on delete set null,
  conversation_id uuid,
  request_id text,
  error_code text not null,
  error_message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists background_task_failures_task_created_idx
  on public.background_task_failures (task_type, created_at desc);

create index if not exists background_task_failures_teacher_created_idx
  on public.background_task_failures (teacher_id, created_at desc);

alter table public.background_task_failures enable row level security;

create policy "background_task_failures_select_own"
  on public.background_task_failures
  for select
  using (teacher_id = auth.uid() or teacher_id is null);

create table if not exists public.grading_jobs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.grading_sessions(id) on delete cascade,
  submission_id uuid references public.grading_submissions(id) on delete cascade,
  kind text not null check (kind in ('infer_answer_key', 'auto_grade_submission', 'auto_grade_batch')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_code text,
  error_message text,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  available_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grading_jobs_status_available_idx
  on public.grading_jobs (status, available_at asc, created_at asc);

create index if not exists grading_jobs_teacher_created_idx
  on public.grading_jobs (teacher_id, created_at desc);

create index if not exists grading_jobs_session_created_idx
  on public.grading_jobs (session_id, created_at desc);

create trigger grading_jobs_set_updated_at
  before update on public.grading_jobs
  for each row execute function public.set_updated_at();

alter table public.grading_jobs enable row level security;

create policy "grading_jobs_select_own"
  on public.grading_jobs
  for select
  using (teacher_id = auth.uid());

create policy "grading_jobs_insert_own"
  on public.grading_jobs
  for insert
  with check (teacher_id = auth.uid());

create policy "grading_jobs_update_own"
  on public.grading_jobs
  for update
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());
