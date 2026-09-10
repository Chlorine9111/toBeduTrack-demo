create table if not exists public.question_taxonomy_nodes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  parent_node_id uuid references public.question_taxonomy_nodes(id) on delete set null,
  merged_into_node_id uuid references public.question_taxonomy_nodes(id) on delete set null,
  node_type text not null check (node_type in ('cluster', 'subskill')),
  canonical_key text not null,
  canonical_label text not null,
  normalized_label text not null,
  status text not null default 'candidate'
    check (status in ('active', 'candidate', 'merged', 'rejected')),
  created_by text not null default 'system'
    check (created_by in ('system', 'teacher')),
  source_count integer not null default 0,
  review_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  last_suggested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (node_type = 'cluster' and parent_node_id is null)
    or (node_type = 'subskill' and parent_node_id is not null)
  )
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'question_taxonomy_nodes'
      and column_name = 'cluster_key'
  ) then
    execute 'alter table public.question_taxonomy_nodes alter column cluster_key drop not null';
  end if;
end;
$$;

alter table public.question_taxonomy_nodes
  add column if not exists parent_node_id uuid references public.question_taxonomy_nodes(id) on delete set null,
  add column if not exists merged_into_node_id uuid references public.question_taxonomy_nodes(id) on delete set null,
  add column if not exists normalized_label text,
  add column if not exists created_by text default 'system',
  add column if not exists last_suggested_at timestamptz default now();

update public.question_taxonomy_nodes
set normalized_label = lower(trim(canonical_label))
where normalized_label is null;

update public.question_taxonomy_nodes
set created_by = coalesce(created_by, 'system')
where created_by is null;

update public.question_taxonomy_nodes
set last_suggested_at = coalesce(last_suggested_at, updated_at, created_at, now())
where last_suggested_at is null;

alter table public.question_taxonomy_nodes
  alter column normalized_label set not null,
  alter column created_by set not null,
  alter column created_by set default 'system',
  alter column last_suggested_at set not null,
  alter column last_suggested_at set default now();

alter table public.question_taxonomy_nodes
  drop constraint if exists question_taxonomy_nodes_node_type_check;

alter table public.question_taxonomy_nodes
  add constraint question_taxonomy_nodes_node_type_check
    check (node_type in ('cluster', 'subskill'));

create unique index if not exists question_taxonomy_nodes_unique_idx
  on public.question_taxonomy_nodes (
    teacher_id,
    node_type,
    coalesce(parent_node_id, '00000000-0000-0000-0000-000000000000'::uuid),
    canonical_key
  );

create index if not exists question_taxonomy_nodes_lookup_idx
  on public.question_taxonomy_nodes (
    teacher_id,
    node_type,
    parent_node_id,
    status,
    normalized_label
  );

create table if not exists public.question_taxonomy_aliases (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  node_id uuid not null references public.question_taxonomy_nodes(id) on delete cascade,
  alias_label text not null,
  normalized_label text not null,
  created_at timestamptz not null default now(),
  unique (node_id, normalized_label)
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'question_taxonomy_aliases'
      and column_name = 'node_type'
  ) then
    execute 'alter table public.question_taxonomy_aliases alter column node_type drop default';
    execute 'alter table public.question_taxonomy_aliases alter column node_type drop not null';
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'question_taxonomy_aliases'
      and column_name = 'cluster_key'
  ) then
    execute 'alter table public.question_taxonomy_aliases alter column cluster_key drop not null';
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'question_taxonomy_aliases'
      and column_name = 'alias_key'
  ) then
    execute 'alter table public.question_taxonomy_aliases alter column alias_key drop not null';
  end if;
end;
$$;

alter table public.question_taxonomy_aliases
  add column if not exists normalized_label text;

update public.question_taxonomy_aliases
set normalized_label = lower(trim(alias_label))
where normalized_label is null;

alter table public.question_taxonomy_aliases
  alter column normalized_label set not null;

create unique index if not exists question_taxonomy_aliases_unique_idx
  on public.question_taxonomy_aliases (node_id, normalized_label);

create index if not exists question_taxonomy_aliases_lookup_idx
  on public.question_taxonomy_aliases (teacher_id, normalized_label);

create table if not exists public.exercise_taxonomy_links (
  exercise_id uuid primary key references public.exercises(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  cluster_node_id uuid references public.question_taxonomy_nodes(id) on delete set null,
  subskill_node_id uuid references public.question_taxonomy_nodes(id) on delete set null,
  match_mode text not null default 'needs_review'
    check (match_mode in ('matched_existing', 'candidate_new', 'needs_review')),
  confidence numeric(4,3),
  reasons text[] not null default '{}',
  raw_cluster_label text,
  raw_subskill_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.exercise_taxonomy_links
  add column if not exists cluster_node_id uuid references public.question_taxonomy_nodes(id) on delete set null,
  add column if not exists raw_cluster_label text,
  add column if not exists raw_subskill_label text;

update public.exercise_taxonomy_links
set raw_cluster_label = coalesce(raw_cluster_label, cluster_key)
where raw_cluster_label is null;

update public.exercise_taxonomy_links
set match_mode = 'matched_existing'
where match_mode = 'teacher_confirmed';

alter table public.exercise_taxonomy_links
  drop constraint if exists exercise_taxonomy_links_match_mode_check,
  drop constraint if exists exercise_taxonomy_links_confidence_check;

alter table public.exercise_taxonomy_links
  alter column confidence drop not null,
  alter column confidence drop default,
  alter column confidence type numeric(4,3)
    using case
      when confidence is null then null
      when confidence > 1 then round(confidence::numeric / 100, 3)
      else round(confidence::numeric, 3)
    end;

alter table public.exercise_taxonomy_links
  add constraint exercise_taxonomy_links_match_mode_check
    check (match_mode in ('matched_existing', 'candidate_new', 'needs_review')),
  add constraint exercise_taxonomy_links_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1));

create index if not exists exercise_taxonomy_links_teacher_idx
  on public.exercise_taxonomy_links (teacher_id);

create index if not exists exercise_taxonomy_links_cluster_idx
  on public.exercise_taxonomy_links (cluster_node_id);

create index if not exists exercise_taxonomy_links_subskill_idx
  on public.exercise_taxonomy_links (subskill_node_id);

alter table public.exercises
  add column if not exists knowledge_cluster text,
  add column if not exists knowledge_cluster_node_id uuid references public.question_taxonomy_nodes(id) on delete set null,
  add column if not exists knowledge_subskill_key text,
  add column if not exists knowledge_subskill_label text,
  add column if not exists knowledge_subskill_node_id uuid references public.question_taxonomy_nodes(id) on delete set null,
  add column if not exists subskill_match_mode text not null default 'needs_review'
    check (subskill_match_mode in ('matched_existing', 'candidate_new', 'needs_review')),
  add column if not exists subskill_confidence numeric(4,3),
  add column if not exists subskill_reasons text[] not null default '{}',
  add column if not exists classification_updated_by_teacher boolean not null default false;

update public.exercises
set
  classification_updated_by_teacher = true,
  subskill_match_mode = 'matched_existing'
where subskill_match_mode = 'teacher_confirmed';

update public.exercises
set classification_updated_by_teacher = true
where classification_status = 'teacher_confirmed';

alter table public.exercises
  alter column subskill_confidence type numeric(4,3)
  using case
    when subskill_confidence is null then null
    when subskill_confidence > 1 then round(subskill_confidence::numeric / 100, 3)
    else round(subskill_confidence::numeric, 3)
  end;

update public.content_library_items as item
set
  origin_entity_type = 'exercise',
  origin_entity_id = (item.snapshot #>> '{exercise,id}')::uuid,
  origin_key = format('exercise:%s', item.snapshot #>> '{exercise,id}')
where item.content_type = 'question'
  and item.renderer_type = 'exercise'
  and item.origin_entity_type = 'assistant_message'
  and item.origin_entity_id is null
  and coalesce(item.snapshot ->> 'kind', '') = 'exercise'
  and nullif(item.snapshot #>> '{exercise,id}', '') is not null
  and not exists (
    select 1
    from public.content_library_items existing
    where existing.id <> item.id
      and existing.teacher_id = item.teacher_id
      and existing.origin_key = format('exercise:%s', item.snapshot #>> '{exercise,id}')
  );

create index if not exists exercises_cluster_node_idx
  on public.exercises (knowledge_cluster_node_id);

create index if not exists exercises_subskill_node_idx
  on public.exercises (knowledge_subskill_node_id);

drop trigger if exists question_taxonomy_nodes_set_updated_at on public.question_taxonomy_nodes;
create trigger question_taxonomy_nodes_set_updated_at
  before update on public.question_taxonomy_nodes
  for each row execute function public.set_updated_at();

drop trigger if exists exercise_taxonomy_links_set_updated_at on public.exercise_taxonomy_links;
create trigger exercise_taxonomy_links_set_updated_at
  before update on public.exercise_taxonomy_links
  for each row execute function public.set_updated_at();

alter table public.question_taxonomy_nodes enable row level security;
alter table public.question_taxonomy_aliases enable row level security;
alter table public.exercise_taxonomy_links enable row level security;

create policy "question_taxonomy_nodes_select_own" on public.question_taxonomy_nodes
  for select using (teacher_id = auth.uid());

create policy "question_taxonomy_nodes_insert_own" on public.question_taxonomy_nodes
  for insert with check (teacher_id = auth.uid());

create policy "question_taxonomy_nodes_update_own" on public.question_taxonomy_nodes
  for update using (teacher_id = auth.uid());

create policy "question_taxonomy_nodes_delete_own" on public.question_taxonomy_nodes
  for delete using (teacher_id = auth.uid());

create policy "question_taxonomy_aliases_select_own" on public.question_taxonomy_aliases
  for select using (teacher_id = auth.uid());

create policy "question_taxonomy_aliases_insert_own" on public.question_taxonomy_aliases
  for insert with check (teacher_id = auth.uid());

create policy "question_taxonomy_aliases_update_own" on public.question_taxonomy_aliases
  for update using (teacher_id = auth.uid());

create policy "question_taxonomy_aliases_delete_own" on public.question_taxonomy_aliases
  for delete using (teacher_id = auth.uid());

create policy "exercise_taxonomy_links_select_own" on public.exercise_taxonomy_links
  for select using (teacher_id = auth.uid());

create policy "exercise_taxonomy_links_insert_own" on public.exercise_taxonomy_links
  for insert with check (teacher_id = auth.uid());

create policy "exercise_taxonomy_links_update_own" on public.exercise_taxonomy_links
  for update using (teacher_id = auth.uid());

create policy "exercise_taxonomy_links_delete_own" on public.exercise_taxonomy_links
  for delete using (teacher_id = auth.uid());
