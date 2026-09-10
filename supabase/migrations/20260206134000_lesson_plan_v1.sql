-- Lesson plan generator v1 schema

create table if not exists public.teacher_lesson_preferences (
  teacher_id uuid primary key references public.teachers(id) on delete cascade,
  duration_minutes integer not null default 45 check (duration_minutes between 15 and 180),
  student_level text not null default 'medium' check (student_level in ('basic', 'medium', 'advanced')),
  language_pref text not null default 'follow' check (language_pref in ('follow', 'en', 'zh', 'bilingual')),
  template_kind text not null default 'concept' check (template_kind in ('concept', 'example', 'sprint', 'inquiry')),
  quiz_density text not null default 'medium' check (quiz_density in ('low', 'medium', 'high')),
  explanation_depth text not null default 'standard' check (explanation_depth in ('concise', 'standard', 'detailed')),
  include_extension boolean not null default false,
  show_ced_codes boolean not null default true,
  include_teacher_notes boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  title text not null,
  source_prompt text not null,
  subject_label text not null,
  course_id uuid references public.courses(id) on delete restrict,
  unit_id uuid references public.units(id) on delete set null,
  topic_ids uuid[] not null default '{}',
  learning_objective_codes text[] not null default '{}',
  essential_knowledge jsonb not null default '[]'::jsonb,
  template_kind text not null default 'concept' check (template_kind in ('concept', 'example', 'sprint', 'inquiry')),
  duration_minutes integer not null default 45 check (duration_minutes between 15 and 180),
  student_level text not null default 'medium' check (student_level in ('basic', 'medium', 'advanced')),
  language_pref text not null default 'follow' check (language_pref in ('follow', 'en', 'zh', 'bilingual')),
  quiz_density text not null default 'medium' check (quiz_density in ('low', 'medium', 'high')),
  explanation_depth text not null default 'standard' check (explanation_depth in ('concise', 'standard', 'detailed')),
  include_extension boolean not null default false,
  show_ced_codes boolean not null default true,
  include_teacher_notes boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_slug text unique,
  published_at timestamptz,
  first_section_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_plan_sections (
  id uuid primary key default gen_random_uuid(),
  lesson_plan_id uuid not null references public.lesson_plans(id) on delete cascade,
  title text not null,
  summary text,
  duration_minutes integer check (duration_minutes between 1 and 180),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_plan_blocks (
  id uuid primary key default gen_random_uuid(),
  lesson_plan_id uuid not null references public.lesson_plans(id) on delete cascade,
  section_id uuid not null references public.lesson_plan_sections(id) on delete cascade,
  block_type text not null check (
    block_type in (
      'heading',
      'paragraph',
      'math',
      'image',
      'callout',
      'divider',
      'definition',
      'example',
      'steps',
      'quiz',
      'poll'
    )
  ),
  block_subtype text check (
    block_subtype is null or block_subtype in ('warning', 'think', 'misconception', 'connection')
  ),
  sort_order integer not null default 0,
  content jsonb not null default '{}'::jsonb,
  ced_codes text[] not null default '{}',
  teacher_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lesson_plans_teacher_idx on public.lesson_plans (teacher_id, updated_at desc);
create index if not exists lesson_plans_publish_idx on public.lesson_plans (status, published_slug);
create index if not exists lesson_plan_sections_plan_idx on public.lesson_plan_sections (lesson_plan_id, sort_order);
create index if not exists lesson_plan_blocks_section_idx on public.lesson_plan_blocks (section_id, sort_order);

create trigger teacher_lesson_preferences_set_updated_at
  before update on public.teacher_lesson_preferences
  for each row execute function public.set_updated_at();

create trigger lesson_plans_set_updated_at
  before update on public.lesson_plans
  for each row execute function public.set_updated_at();

create trigger lesson_plan_sections_set_updated_at
  before update on public.lesson_plan_sections
  for each row execute function public.set_updated_at();

create trigger lesson_plan_blocks_set_updated_at
  before update on public.lesson_plan_blocks
  for each row execute function public.set_updated_at();

alter table public.teacher_lesson_preferences enable row level security;
alter table public.lesson_plans enable row level security;
alter table public.lesson_plan_sections enable row level security;
alter table public.lesson_plan_blocks enable row level security;

create policy "teacher_lesson_preferences_select_own" on public.teacher_lesson_preferences
  for select using (teacher_id = auth.uid());

create policy "teacher_lesson_preferences_upsert_own" on public.teacher_lesson_preferences
  for insert with check (teacher_id = auth.uid());

create policy "teacher_lesson_preferences_update_own" on public.teacher_lesson_preferences
  for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "lesson_plans_select_owner_or_published" on public.lesson_plans
  for select using (teacher_id = auth.uid() or status = 'published');

create policy "lesson_plans_insert_own" on public.lesson_plans
  for insert with check (teacher_id = auth.uid());

create policy "lesson_plans_update_own" on public.lesson_plans
  for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "lesson_plans_delete_own" on public.lesson_plans
  for delete using (teacher_id = auth.uid());

create policy "lesson_plan_sections_select_owner_or_published" on public.lesson_plan_sections
  for select using (
    exists (
      select 1
      from public.lesson_plans lp
      where lp.id = lesson_plan_sections.lesson_plan_id
        and (lp.teacher_id = auth.uid() or lp.status = 'published')
    )
  );

create policy "lesson_plan_sections_insert_own" on public.lesson_plan_sections
  for insert with check (
    exists (
      select 1
      from public.lesson_plans lp
      where lp.id = lesson_plan_sections.lesson_plan_id
        and lp.teacher_id = auth.uid()
    )
  );

create policy "lesson_plan_sections_update_own" on public.lesson_plan_sections
  for update using (
    exists (
      select 1
      from public.lesson_plans lp
      where lp.id = lesson_plan_sections.lesson_plan_id
        and lp.teacher_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from public.lesson_plans lp
      where lp.id = lesson_plan_sections.lesson_plan_id
        and lp.teacher_id = auth.uid()
    )
  );

create policy "lesson_plan_sections_delete_own" on public.lesson_plan_sections
  for delete using (
    exists (
      select 1
      from public.lesson_plans lp
      where lp.id = lesson_plan_sections.lesson_plan_id
        and lp.teacher_id = auth.uid()
    )
  );

create policy "lesson_plan_blocks_select_owner_or_published" on public.lesson_plan_blocks
  for select using (
    exists (
      select 1
      from public.lesson_plans lp
      where lp.id = lesson_plan_blocks.lesson_plan_id
        and (lp.teacher_id = auth.uid() or lp.status = 'published')
    )
  );

create policy "lesson_plan_blocks_insert_own" on public.lesson_plan_blocks
  for insert with check (
    exists (
      select 1
      from public.lesson_plans lp
      where lp.id = lesson_plan_blocks.lesson_plan_id
        and lp.teacher_id = auth.uid()
    )
  );

create policy "lesson_plan_blocks_update_own" on public.lesson_plan_blocks
  for update using (
    exists (
      select 1
      from public.lesson_plans lp
      where lp.id = lesson_plan_blocks.lesson_plan_id
        and lp.teacher_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from public.lesson_plans lp
      where lp.id = lesson_plan_blocks.lesson_plan_id
        and lp.teacher_id = auth.uid()
    )
  );

create policy "lesson_plan_blocks_delete_own" on public.lesson_plan_blocks
  for delete using (
    exists (
      select 1
      from public.lesson_plans lp
      where lp.id = lesson_plan_blocks.lesson_plan_id
        and lp.teacher_id = auth.uid()
    )
  );
