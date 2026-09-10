-- PBL domain tables (v1)

create extension if not exists vector;

create table if not exists public.pbl_materials (
  id uuid primary key default gen_random_uuid(),
  display_code text,
  title text not null,
  type text not null check (type in ('competition', 'pbl_case', 'driving_question', 'curriculum_map')),
  source text not null,
  year int,
  difficulty text check (difficulty in ('competition_level', 'college_prep', 'advanced_hs', 'standard_hs')),
  original_content text,
  driving_question text,
  downgrade_suggestion text,
  url text,
  visibility text not null check (visibility in ('public', 'private')),
  owner_id uuid references public.teachers(id) on delete cascade,
  quality_score int check (quality_score between 1 and 5),
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pbl_material_owner_visibility_ck check (
    (visibility = 'public' and owner_id is null) or
    (visibility = 'private' and owner_id is not null)
  )
);

create index if not exists idx_pbl_materials_visibility on public.pbl_materials(visibility);
create index if not exists idx_pbl_materials_owner_id on public.pbl_materials(owner_id);
create index if not exists idx_pbl_materials_type on public.pbl_materials(type);

create table if not exists public.pbl_tags (
  id uuid primary key default gen_random_uuid(),
  dimension text not null check (dimension in ('A', 'B', 'C', 'D')),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (dimension, name)
);

create table if not exists public.pbl_material_tags (
  material_id uuid not null references public.pbl_materials(id) on delete cascade,
  tag_id uuid not null references public.pbl_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (material_id, tag_id)
);

create table if not exists public.pbl_knowledge_points (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  curriculum_system text not null check (curriculum_system in ('AP', 'IB', 'CN')),
  subject text not null,
  subject_abbr text,
  level text,
  parent_id uuid references public.pbl_knowledge_points(id) on delete cascade,
  depth int not null default 0,
  hierarchy_label text not null,
  name text not null,
  description text,
  project_potential text check (project_potential in ('high', 'medium', 'low')),
  created_at timestamptz not null default now()
);

create index if not exists idx_pbl_knowledge_points_subject on public.pbl_knowledge_points(curriculum_system, subject);
create index if not exists idx_pbl_knowledge_points_parent on public.pbl_knowledge_points(parent_id);

create table if not exists public.pbl_generation_requests (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  curriculum_system text not null check (curriculum_system in ('AP', 'IB', 'CN')),
  primary_subject text not null,
  grade text not null,
  duration text not null,
  difficulty text not null check (difficulty in ('basic', 'advanced', 'challenge')),
  payload jsonb not null,
  status text not null default 'confirmed' check (status in ('draft', 'confirmed', 'generating', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pbl_generation_requests_teacher on public.pbl_generation_requests(teacher_id, created_at desc);

create table if not exists public.pbl_project_plans (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.pbl_generation_requests(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'archived')),
  version int not null default 1,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pbl_project_plans_teacher on public.pbl_project_plans(teacher_id, updated_at desc);
create index if not exists idx_pbl_project_plans_request on public.pbl_project_plans(request_id);

create table if not exists public.pbl_generation_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.pbl_generation_requests(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  step text not null check (step in ('parse_input', 'search_materials', 'generate_overview', 'expand_plan', 'quality_check', 'format_output')),
  model_used text not null,
  duration_ms int,
  status text not null check (status in ('success', 'error', 'retry')),
  message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pbl_generation_logs_request on public.pbl_generation_logs(request_id, created_at desc);

alter table public.pbl_materials enable row level security;
alter table public.pbl_material_tags enable row level security;
alter table public.pbl_tags enable row level security;
alter table public.pbl_knowledge_points enable row level security;
alter table public.pbl_generation_requests enable row level security;
alter table public.pbl_project_plans enable row level security;
alter table public.pbl_generation_logs enable row level security;

-- public materials and private owner scope

drop policy if exists pbl_materials_select_policy on public.pbl_materials;
create policy pbl_materials_select_policy on public.pbl_materials
for select using (
  visibility = 'public' or owner_id = auth.uid()
);

drop policy if exists pbl_materials_insert_policy on public.pbl_materials;
create policy pbl_materials_insert_policy on public.pbl_materials
for insert with check (
  visibility = 'public' and owner_id is null or owner_id = auth.uid()
);

drop policy if exists pbl_materials_update_policy on public.pbl_materials;
create policy pbl_materials_update_policy on public.pbl_materials
for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists pbl_materials_delete_policy on public.pbl_materials;
create policy pbl_materials_delete_policy on public.pbl_materials
for delete using (owner_id = auth.uid());

drop policy if exists pbl_material_tags_select_policy on public.pbl_material_tags;
create policy pbl_material_tags_select_policy on public.pbl_material_tags
for select using (
  exists (
    select 1 from public.pbl_materials m
    where m.id = pbl_material_tags.material_id
      and (m.visibility = 'public' or m.owner_id = auth.uid())
  )
);

drop policy if exists pbl_tags_select_policy on public.pbl_tags;
create policy pbl_tags_select_policy on public.pbl_tags
for select using (true);

drop policy if exists pbl_knowledge_points_select_policy on public.pbl_knowledge_points;
create policy pbl_knowledge_points_select_policy on public.pbl_knowledge_points
for select using (true);

drop policy if exists pbl_generation_requests_owner_policy on public.pbl_generation_requests;
create policy pbl_generation_requests_owner_policy on public.pbl_generation_requests
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists pbl_project_plans_owner_policy on public.pbl_project_plans;
create policy pbl_project_plans_owner_policy on public.pbl_project_plans
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists pbl_generation_logs_owner_policy on public.pbl_generation_logs;
create policy pbl_generation_logs_owner_policy on public.pbl_generation_logs
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
