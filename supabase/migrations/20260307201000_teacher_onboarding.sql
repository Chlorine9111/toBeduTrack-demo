alter table public.teachers
  add column if not exists role_title text,
  add column if not exists teaching_subjects text[] not null default '{}'::text[],
  add column if not exists onboarding_step integer not null default 0,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.teachers
  drop constraint if exists teachers_onboarding_step_check;

alter table public.teachers
  add constraint teachers_onboarding_step_check
  check (onboarding_step between 0 and 3);
