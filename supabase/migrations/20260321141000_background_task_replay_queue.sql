alter table public.background_task_failures
  add column if not exists replay_status text not null default 'pending',
  add column if not exists replay_attempts integer not null default 0,
  add column if not exists replay_max_attempts integer not null default 3,
  add column if not exists replay_available_at timestamptz not null default now(),
  add column if not exists replay_started_at timestamptz,
  add column if not exists replay_resolved_at timestamptz,
  add column if not exists replay_last_error text,
  add column if not exists replay_handler text;

alter table public.background_task_failures
  drop constraint if exists background_task_failures_replay_status_check;

alter table public.background_task_failures
  add constraint background_task_failures_replay_status_check
    check (replay_status in ('pending', 'running', 'resolved', 'dead_letter', 'unsupported'));

update public.background_task_failures
set replay_handler = case
    when task_type = 'agent.memory_formation' then 'teacher_memory_job'
    when task_type in ('grading.infer_answer_key', 'grading.auto_grade_submission', 'grading.auto_grade_batch') then 'grading_job'
    else replay_handler
  end,
  replay_status = case
    when task_type = 'agent.memory_formation' then 'pending'
    when task_type in ('grading.infer_answer_key', 'grading.auto_grade_submission', 'grading.auto_grade_batch') then 'pending'
    else 'unsupported'
  end
where replay_handler is null
   or replay_status not in ('pending', 'running', 'resolved', 'dead_letter', 'unsupported');

create index if not exists background_task_failures_replay_status_available_idx
  on public.background_task_failures (replay_status, replay_available_at asc, created_at asc);

create index if not exists background_task_failures_handler_status_idx
  on public.background_task_failures (replay_handler, replay_status, created_at desc);
