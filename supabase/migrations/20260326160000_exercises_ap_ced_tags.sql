-- exercises 表添加 AP CED 结构化标签列
-- 作为 jiaohu 功能并入 jiaohu-tya 的前向追加迁移

alter table public.exercises
  add column if not exists ap_ced_course text default null,
  add column if not exists ap_ced_unit int default null,
  add column if not exists ap_ced_topic_code text default null,
  add column if not exists ap_ced_secondary_topics text[] default '{}',
  add column if not exists ap_ced_big_idea text default null,
  add column if not exists ap_ced_science_practice int default null,
  add column if not exists ap_ced_cognitive_task text default null,
  add column if not exists ap_ced_transfer_distance text default null,
  add column if not exists ap_ced_explanation text default null,
  add column if not exists ap_ced_key_concepts text[] default '{}',
  add column if not exists ap_ced_negative_stem boolean default false,
  add column if not exists ap_ced_stimulus_dependent boolean default false,
  add column if not exists ap_ced_standalone_usable boolean default true,
  add column if not exists ap_ced_choices_misconceptions jsonb default null;

create index if not exists idx_exercises_ap_ced_course_unit
  on public.exercises (ap_ced_course, ap_ced_unit)
  where ap_ced_course is not null;

create index if not exists idx_exercises_ap_ced_topic_code
  on public.exercises (ap_ced_topic_code)
  where ap_ced_topic_code is not null;

create index if not exists idx_exercises_ap_ced_cognitive_task
  on public.exercises (ap_ced_cognitive_task)
  where ap_ced_cognitive_task is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'exercises_ap_ced_transfer_check'
      and conrelid = 'public.exercises'::regclass
  ) then
    alter table public.exercises
      add constraint exercises_ap_ced_transfer_check
      check (
        ap_ced_transfer_distance is null
        or ap_ced_transfer_distance in ('near', 'far')
      );
  end if;
end $$;

comment on column public.exercises.ap_ced_topic_code is 'AP CED knowledge point code, for example 1.3 or 6.8';
comment on column public.exercises.ap_ced_cognitive_task is 'Cognitive task type such as recall, diagram_reading, calculation';
comment on column public.exercises.ap_ced_explanation is 'Short explanation for the answer';
comment on column public.exercises.ap_ced_choices_misconceptions is 'JSONB map from wrong choice to likely misconception';
