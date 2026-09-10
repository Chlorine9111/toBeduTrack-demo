create table if not exists public.question_taxonomy_nodes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  node_type text not null default 'subskill'
    check (node_type in ('subskill')),
  cluster_key text not null,
  canonical_key text not null,
  canonical_label text not null,
  description text,
  status text not null default 'active'
    check (status in ('active', 'candidate', 'merged', 'rejected')),
  alias_of_node_id uuid references public.question_taxonomy_nodes(id) on delete set null,
  source_count integer not null default 0,
  review_count integer not null default 0,
  embedding_model text,
  embedding jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, node_type, cluster_key, canonical_key)
);

create index if not exists idx_question_taxonomy_nodes_teacher_cluster_status
  on public.question_taxonomy_nodes (teacher_id, cluster_key, status, canonical_label);

create index if not exists idx_question_taxonomy_nodes_teacher_alias
  on public.question_taxonomy_nodes (teacher_id, alias_of_node_id)
  where alias_of_node_id is not null;

drop trigger if exists question_taxonomy_nodes_set_updated_at on public.question_taxonomy_nodes;
create trigger question_taxonomy_nodes_set_updated_at
  before update on public.question_taxonomy_nodes
  for each row execute function public.set_updated_at();

alter table public.question_taxonomy_nodes enable row level security;

drop policy if exists "question_taxonomy_nodes_manage_own" on public.question_taxonomy_nodes;
create policy "question_taxonomy_nodes_manage_own"
  on public.question_taxonomy_nodes
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create table if not exists public.question_taxonomy_aliases (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  node_id uuid not null references public.question_taxonomy_nodes(id) on delete cascade,
  node_type text not null default 'subskill'
    check (node_type in ('subskill')),
  cluster_key text not null,
  alias_key text not null,
  alias_label text not null,
  embedding_model text,
  embedding jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (teacher_id, node_type, cluster_key, alias_key)
);

create index if not exists idx_question_taxonomy_aliases_node
  on public.question_taxonomy_aliases (node_id, alias_label);

alter table public.question_taxonomy_aliases enable row level security;

drop policy if exists "question_taxonomy_aliases_manage_own" on public.question_taxonomy_aliases;
create policy "question_taxonomy_aliases_manage_own"
  on public.question_taxonomy_aliases
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create table if not exists public.exercise_taxonomy_links (
  exercise_id uuid primary key references public.exercises(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  cluster_key text,
  assessment_style text,
  subskill_node_id uuid references public.question_taxonomy_nodes(id) on delete set null,
  match_mode text not null default 'needs_review'
    check (match_mode in ('matched_existing', 'candidate_new', 'needs_review', 'teacher_confirmed')),
  confidence integer not null default 0
    check (confidence between 0 and 100),
  reasons text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_exercise_taxonomy_links_teacher_subskill
  on public.exercise_taxonomy_links (teacher_id, subskill_node_id)
  where subskill_node_id is not null;

create index if not exists idx_exercise_taxonomy_links_teacher_cluster
  on public.exercise_taxonomy_links (teacher_id, cluster_key);

drop trigger if exists exercise_taxonomy_links_set_updated_at on public.exercise_taxonomy_links;
create trigger exercise_taxonomy_links_set_updated_at
  before update on public.exercise_taxonomy_links
  for each row execute function public.set_updated_at();

alter table public.exercise_taxonomy_links enable row level security;

drop policy if exists "exercise_taxonomy_links_manage_own" on public.exercise_taxonomy_links;
create policy "exercise_taxonomy_links_manage_own"
  on public.exercise_taxonomy_links
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

alter table public.exercises
  add column if not exists knowledge_subskill_node_id uuid references public.question_taxonomy_nodes(id) on delete set null,
  add column if not exists classification_updated_by_teacher boolean not null default false;

create index if not exists idx_exercises_subskill_node
  on public.exercises (teacher_id, knowledge_subskill_node_id)
  where knowledge_subskill_node_id is not null;

insert into public.exercise_taxonomy_links (
  exercise_id,
  teacher_id,
  cluster_key,
  assessment_style,
  subskill_node_id,
  match_mode,
  confidence,
  reasons
)
select
  id,
  teacher_id,
  knowledge_cluster,
  assessment_style,
  knowledge_subskill_node_id,
  coalesce(subskill_match_mode, 'needs_review'),
  coalesce(subskill_confidence, 0),
  coalesce(subskill_reasons, '{}')
from public.exercises
on conflict (exercise_id) do nothing;
