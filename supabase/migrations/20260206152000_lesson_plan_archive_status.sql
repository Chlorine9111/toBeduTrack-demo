alter table public.lesson_plans
  drop constraint if exists lesson_plans_status_check;

alter table public.lesson_plans
  add constraint lesson_plans_status_check
  check (status in ('draft', 'published', 'archived'));

create index if not exists lesson_plans_teacher_status_updated_idx
  on public.lesson_plans (teacher_id, status, updated_at desc);
