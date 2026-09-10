create extension if not exists vector with schema extensions;

set search_path = public, extensions;

create table if not exists public.knowledge_document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  chunk_index integer not null,
  page_start integer,
  page_end integer,
  title text,
  content text not null,
  content_preview text,
  token_count integer not null default 0,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists idx_knowledge_document_chunks_teacher_created
  on public.knowledge_document_chunks(teacher_id, created_at desc);

create index if not exists idx_knowledge_document_chunks_document
  on public.knowledge_document_chunks(document_id, chunk_index asc);

create index if not exists idx_knowledge_document_chunks_search
  on public.knowledge_document_chunks
  using gin(search_vector);

create index if not exists idx_knowledge_document_chunks_embedding_hnsw
  on public.knowledge_document_chunks
  using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create trigger knowledge_document_chunks_set_updated_at
  before update on public.knowledge_document_chunks
  for each row execute function public.set_updated_at();

alter table public.knowledge_document_chunks enable row level security;

create policy "knowledge_document_chunks_manage_own"
  on public.knowledge_document_chunks
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create or replace function public.match_knowledge_document_chunks(
  p_teacher_id uuid,
  query_embedding vector(1536),
  match_count integer default 8,
  match_threshold double precision default 0.45,
  p_subject text default null,
  p_unit text default null
)
returns table (
  id uuid,
  document_id uuid,
  teacher_id uuid,
  filename text,
  subject text,
  unit text,
  chunk_index integer,
  page_start integer,
  page_end integer,
  title text,
  content text,
  content_preview text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
as $$
  select
    c.id,
    c.document_id,
    c.teacher_id,
    d.filename,
    d.subject,
    d.unit,
    c.chunk_index,
    c.page_start,
    c.page_end,
    c.title,
    c.content,
    c.content_preview,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.knowledge_document_chunks c
  join public.knowledge_documents d
    on d.id = c.document_id
  where c.teacher_id = p_teacher_id
    and c.embedding is not null
    and (p_subject is null or d.subject = p_subject)
    and (p_unit is null or d.unit = p_unit)
    and 1 - (c.embedding <=> query_embedding) >= match_threshold
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

create or replace function public.keyword_search_knowledge_document_chunks(
  p_teacher_id uuid,
  search_query text,
  match_count integer default 8,
  p_subject text default null,
  p_unit text default null
)
returns table (
  id uuid,
  document_id uuid,
  teacher_id uuid,
  filename text,
  subject text,
  unit text,
  chunk_index integer,
  page_start integer,
  page_end integer,
  title text,
  content text,
  content_preview text,
  metadata jsonb,
  rank double precision
)
language sql
stable
as $$
  with query_input as (
    select nullif(trim(search_query), '') as q
  )
  select
    c.id,
    c.document_id,
    c.teacher_id,
    d.filename,
    d.subject,
    d.unit,
    c.chunk_index,
    c.page_start,
    c.page_end,
    c.title,
    c.content,
    c.content_preview,
    c.metadata,
    ts_rank_cd(c.search_vector, websearch_to_tsquery('simple', query_input.q))::double precision as rank
  from public.knowledge_document_chunks c
  join public.knowledge_documents d
    on d.id = c.document_id
  cross join query_input
  where query_input.q is not null
    and c.teacher_id = p_teacher_id
    and (p_subject is null or d.subject = p_subject)
    and (p_unit is null or d.unit = p_unit)
    and c.search_vector @@ websearch_to_tsquery('simple', query_input.q)
  order by rank desc, c.chunk_index asc
  limit greatest(match_count, 1);
$$;
