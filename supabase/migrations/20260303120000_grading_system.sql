-- AI 判卷系统

create table if not exists public.grading_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  course_id text,
  unit_id text,
  topic_id text,
  answer_key_source text not null default 'manual' check (answer_key_source in ('exercise', 'manual', 'rubric')),
  answer_key jsonb not null default '[]'::jsonb,
  rubric_id uuid,
  status text not null default 'draft' check (status in ('draft', 'processing', 'completed', 'failed')),
  student_count integer not null default 0,
  question_count integer not null default 0,
  stats jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grading_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.grading_sessions(id) on delete cascade,
  student_name text not null default '',
  file_url text,
  storage_path text,
  page_count integer not null default 0,
  ocr_result jsonb,
  status text not null default 'pending' check (status in ('pending', 'ocr_done', 'grading', 'completed', 'failed')),
  total_score numeric,
  max_score numeric,
  graded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.grading_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.grading_submissions(id) on delete cascade,
  question_number integer not null,
  student_answer text not null default '',
  correct_answer text not null default '',
  score numeric not null default 0,
  max_score numeric not null default 0,
  ai_feedback text not null default '',
  confidence numeric not null default 0,
  question_type text not null default 'FR' check (question_type in ('MC', 'FR', 'essay', 'calculation')),
  scoring_breakdown jsonb,
  needs_review boolean not null default false,
  teacher_override_score numeric,
  teacher_override_feedback text,
  created_at timestamptz not null default now()
);

alter table public.grading_sessions enable row level security;
alter table public.grading_submissions enable row level security;
alter table public.grading_answers enable row level security;

create policy "Teachers manage own grading sessions"
  on public.grading_sessions
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "Teachers manage submissions via session"
  on public.grading_submissions
  for all
  using (
    session_id in (
      select id from public.grading_sessions where teacher_id = auth.uid()
    )
  )
  with check (
    session_id in (
      select id from public.grading_sessions where teacher_id = auth.uid()
    )
  );

create policy "Teachers manage answers via submission"
  on public.grading_answers
  for all
  using (
    submission_id in (
      select gs.id
      from public.grading_submissions gs
      join public.grading_sessions s on s.id = gs.session_id
      where s.teacher_id = auth.uid()
    )
  )
  with check (
    submission_id in (
      select gs.id
      from public.grading_submissions gs
      join public.grading_sessions s on s.id = gs.session_id
      where s.teacher_id = auth.uid()
    )
  );

create index if not exists idx_grading_sessions_teacher
  on public.grading_sessions(teacher_id);

create index if not exists idx_grading_submissions_session
  on public.grading_submissions(session_id);

create index if not exists idx_grading_answers_submission
  on public.grading_answers(submission_id);

create trigger grading_sessions_set_updated_at
  before update on public.grading_sessions
  for each row execute function public.set_updated_at();
