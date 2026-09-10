create extension if not exists vector with schema extensions;

set search_path = public, extensions;

create table if not exists public.semantic_index_items (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  source_kind text not null,
  source_id uuid not null,
  chunk_key text not null default '',
  content_text text not null,
  embedding vector(1536),
  embedding_model text,
  status text not null default 'active',
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, source_kind, source_id, chunk_key)
);

create index if not exists idx_semantic_index_items_teacher_kind
  on public.semantic_index_items (teacher_id, source_kind, status, updated_at desc);

create index if not exists idx_semantic_index_items_teacher_source
  on public.semantic_index_items (teacher_id, source_id, source_kind);

create index if not exists idx_semantic_index_items_embedding_hnsw
  on public.semantic_index_items
  using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create trigger semantic_index_items_set_updated_at
  before update on public.semantic_index_items
  for each row execute function public.set_updated_at();

alter table public.semantic_index_items enable row level security;

create policy "semantic_index_items_manage_own"
  on public.semantic_index_items
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create or replace function public.match_semantic_index_items(
  p_teacher_id uuid,
  query_embedding vector(1536),
  p_source_kinds text[] default null,
  match_count integer default 8,
  match_threshold double precision default 0.35,
  p_status text default 'active',
  p_subject text default null,
  p_unit text default null
)
returns table (
  id uuid,
  teacher_id uuid,
  source_kind text,
  source_id uuid,
  chunk_key text,
  content_text text,
  metadata jsonb,
  embedding_model text,
  status text,
  expires_at timestamptz,
  similarity double precision
)
language sql
stable
as $$
  select
    s.id,
    s.teacher_id,
    s.source_kind,
    s.source_id,
    s.chunk_key,
    s.content_text,
    s.metadata,
    s.embedding_model,
    s.status,
    s.expires_at,
    1 - (s.embedding <=> query_embedding) as similarity
  from public.semantic_index_items s
  where s.teacher_id = p_teacher_id
    and s.embedding is not null
    and (p_source_kinds is null or cardinality(p_source_kinds) = 0 or s.source_kind = any(p_source_kinds))
    and (p_status is null or s.status = p_status)
    and (s.expires_at is null or s.expires_at > now())
    and (p_subject is null or coalesce(s.metadata->>'subject', '') = p_subject)
    and (p_unit is null or coalesce(s.metadata->>'unit', '') = p_unit)
    and 1 - (s.embedding <=> query_embedding) >= match_threshold
  order by s.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
