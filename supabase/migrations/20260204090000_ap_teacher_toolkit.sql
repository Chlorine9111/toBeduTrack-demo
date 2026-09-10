-- AP Teacher Toolkit schema

create extension if not exists "pgcrypto";

-- Timestamp trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Teachers (extends auth.users)
create table if not exists public.teachers (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  display_name text,
  avatar_url text,
  school_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Curriculum tables
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  framework text not null check (framework in ('AP', 'IB', 'A_LEVEL')),
  name text not null,
  code text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  unit_number text not null,
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, unit_number)
);

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  topic_number text not null,
  title text not null,
  learning_objectives jsonb not null default '[]'::jsonb,
  essential_knowledge jsonb not null default '[]'::jsonb,
  math_practices text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, topic_number)
);

-- Rubric examples
create table if not exists public.rubric_examples (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  rubric_json jsonb not null,
  quality_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exercise examples
create table if not exists public.exercise_examples (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  exercise_type text not null check (exercise_type in ('MC', 'FR', 'fill_in')),
  difficulty integer not null check (difficulty between 1 and 4),
  exercise_json jsonb not null,
  quality_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exercise_examples_lookup_idx
  on public.exercise_examples (course_id, exercise_type, difficulty);

-- Rubrics
create table if not exists public.rubrics (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  unit_id uuid references public.units(id) on delete set null,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  teacher_prompt text,
  is_ai_generated boolean not null default true,
  teacher_modified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rubric_dimensions (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null references public.rubrics(id) on delete cascade,
  name text not null,
  description text,
  weight numeric not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rubric_levels (
  id uuid primary key default gen_random_uuid(),
  dimension_id uuid not null references public.rubric_dimensions(id) on delete cascade,
  level text not null check (level in ('excellent', 'good', 'passing', 'failing')),
  score integer not null check (score in (1, 2, 3, 4)),
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dimension_id, level)
);

-- Exercises
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  unit_id uuid references public.units(id) on delete set null,
  topic_id uuid references public.topics(id) on delete set null,
  rubric_id uuid references public.rubrics(id) on delete set null,
  exercise_type text not null check (exercise_type in ('MC', 'FR', 'fill_in')),
  difficulty integer not null check (difficulty between 1 and 4),
  question_text text not null,
  options jsonb,
  correct_answer text not null,
  solution_steps text not null,
  common_mistakes text[] not null default '{}',
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'failed', 'manual_review')),
  verification_attempts integer not null default 0,
  is_ai_generated boolean not null default true,
  teacher_modified boolean not null default false,
  teacher_prompt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exercises_teacher_idx
  on public.exercises (teacher_id);
create index if not exists exercises_filter_idx
  on public.exercises (course_id, unit_id, exercise_type, difficulty);
create index if not exists exercises_verification_idx
  on public.exercises (verification_status);

-- Worksheets
create table if not exists public.worksheets (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  unit_id uuid references public.units(id) on delete set null,
  title text not null,
  description text,
  layout_config jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  pdf_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.worksheet_exercises (
  id uuid primary key default gen_random_uuid(),
  worksheet_id uuid not null references public.worksheets(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  sort_order integer not null,
  points numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worksheet_id, exercise_id)
);

-- updated_at triggers
create trigger teachers_set_updated_at
  before update on public.teachers
  for each row execute function public.set_updated_at();

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

create trigger units_set_updated_at
  before update on public.units
  for each row execute function public.set_updated_at();

create trigger topics_set_updated_at
  before update on public.topics
  for each row execute function public.set_updated_at();

create trigger rubric_examples_set_updated_at
  before update on public.rubric_examples
  for each row execute function public.set_updated_at();

create trigger exercise_examples_set_updated_at
  before update on public.exercise_examples
  for each row execute function public.set_updated_at();

create trigger rubrics_set_updated_at
  before update on public.rubrics
  for each row execute function public.set_updated_at();

create trigger rubric_dimensions_set_updated_at
  before update on public.rubric_dimensions
  for each row execute function public.set_updated_at();

create trigger rubric_levels_set_updated_at
  before update on public.rubric_levels
  for each row execute function public.set_updated_at();

create trigger exercises_set_updated_at
  before update on public.exercises
  for each row execute function public.set_updated_at();

create trigger worksheets_set_updated_at
  before update on public.worksheets
  for each row execute function public.set_updated_at();

create trigger worksheet_exercises_set_updated_at
  before update on public.worksheet_exercises
  for each row execute function public.set_updated_at();

-- Row Level Security
alter table public.teachers enable row level security;
alter table public.courses enable row level security;
alter table public.units enable row level security;
alter table public.topics enable row level security;
alter table public.rubric_examples enable row level security;
alter table public.exercise_examples enable row level security;
alter table public.rubrics enable row level security;
alter table public.rubric_dimensions enable row level security;
alter table public.rubric_levels enable row level security;
alter table public.exercises enable row level security;
alter table public.worksheets enable row level security;
alter table public.worksheet_exercises enable row level security;

-- Teacher policies
create policy "teachers_select_own" on public.teachers
  for select using (auth.uid() = id);

create policy "teachers_insert_own" on public.teachers
  for insert with check (auth.uid() = id);

create policy "teachers_update_own" on public.teachers
  for update using (auth.uid() = id);

create policy "teachers_delete_own" on public.teachers
  for delete using (auth.uid() = id);

-- Curriculum read policies (global shared data)
create policy "courses_read_all" on public.courses
  for select using (true);

create policy "units_read_all" on public.units
  for select using (true);

create policy "topics_read_all" on public.topics
  for select using (true);

create policy "rubric_examples_read_all" on public.rubric_examples
  for select using (true);

create policy "exercise_examples_read_all" on public.exercise_examples
  for select using (true);

-- Rubric policies
create policy "rubrics_select_own" on public.rubrics
  for select using (teacher_id = auth.uid());

create policy "rubrics_insert_own" on public.rubrics
  for insert with check (teacher_id = auth.uid());

create policy "rubrics_update_own" on public.rubrics
  for update using (teacher_id = auth.uid());

create policy "rubrics_delete_own" on public.rubrics
  for delete using (teacher_id = auth.uid());

create policy "rubric_dimensions_select_own" on public.rubric_dimensions
  for select using (
    exists (
      select 1 from public.rubrics r
      where r.id = rubric_dimensions.rubric_id
        and r.teacher_id = auth.uid()
    )
  );

create policy "rubric_dimensions_insert_own" on public.rubric_dimensions
  for insert with check (
    exists (
      select 1 from public.rubrics r
      where r.id = rubric_dimensions.rubric_id
        and r.teacher_id = auth.uid()
    )
  );

create policy "rubric_dimensions_update_own" on public.rubric_dimensions
  for update using (
    exists (
      select 1 from public.rubrics r
      where r.id = rubric_dimensions.rubric_id
        and r.teacher_id = auth.uid()
    )
  );

create policy "rubric_dimensions_delete_own" on public.rubric_dimensions
  for delete using (
    exists (
      select 1 from public.rubrics r
      where r.id = rubric_dimensions.rubric_id
        and r.teacher_id = auth.uid()
    )
  );

create policy "rubric_levels_select_own" on public.rubric_levels
  for select using (
    exists (
      select 1
      from public.rubric_dimensions d
      join public.rubrics r on r.id = d.rubric_id
      where d.id = rubric_levels.dimension_id
        and r.teacher_id = auth.uid()
    )
  );

create policy "rubric_levels_insert_own" on public.rubric_levels
  for insert with check (
    exists (
      select 1
      from public.rubric_dimensions d
      join public.rubrics r on r.id = d.rubric_id
      where d.id = rubric_levels.dimension_id
        and r.teacher_id = auth.uid()
    )
  );

create policy "rubric_levels_update_own" on public.rubric_levels
  for update using (
    exists (
      select 1
      from public.rubric_dimensions d
      join public.rubrics r on r.id = d.rubric_id
      where d.id = rubric_levels.dimension_id
        and r.teacher_id = auth.uid()
    )
  );

create policy "rubric_levels_delete_own" on public.rubric_levels
  for delete using (
    exists (
      select 1
      from public.rubric_dimensions d
      join public.rubrics r on r.id = d.rubric_id
      where d.id = rubric_levels.dimension_id
        and r.teacher_id = auth.uid()
    )
  );

-- Exercise policies
create policy "exercises_select_own" on public.exercises
  for select using (teacher_id = auth.uid());

create policy "exercises_insert_own" on public.exercises
  for insert with check (teacher_id = auth.uid());

create policy "exercises_update_own" on public.exercises
  for update using (teacher_id = auth.uid());

create policy "exercises_delete_own" on public.exercises
  for delete using (teacher_id = auth.uid());

-- Worksheet policies
create policy "worksheets_select_own" on public.worksheets
  for select using (teacher_id = auth.uid());

create policy "worksheets_insert_own" on public.worksheets
  for insert with check (teacher_id = auth.uid());

create policy "worksheets_update_own" on public.worksheets
  for update using (teacher_id = auth.uid());

create policy "worksheets_delete_own" on public.worksheets
  for delete using (teacher_id = auth.uid());

create policy "worksheet_exercises_select_own" on public.worksheet_exercises
  for select using (
    exists (
      select 1 from public.worksheets w
      where w.id = worksheet_exercises.worksheet_id
        and w.teacher_id = auth.uid()
    )
  );

create policy "worksheet_exercises_insert_own" on public.worksheet_exercises
  for insert with check (
    exists (
      select 1 from public.worksheets w
      where w.id = worksheet_exercises.worksheet_id
        and w.teacher_id = auth.uid()
    )
  );

create policy "worksheet_exercises_update_own" on public.worksheet_exercises
  for update using (
    exists (
      select 1 from public.worksheets w
      where w.id = worksheet_exercises.worksheet_id
        and w.teacher_id = auth.uid()
    )
  );

create policy "worksheet_exercises_delete_own" on public.worksheet_exercises
  for delete using (
    exists (
      select 1 from public.worksheets w
      where w.id = worksheet_exercises.worksheet_id
        and w.teacher_id = auth.uid()
    )
  );
