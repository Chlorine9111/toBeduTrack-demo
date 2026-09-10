set search_path = public, extensions;

create or replace function public.match_content_asset_chunks(
  p_teacher_id uuid,
  query_embedding vector(1536),
  p_asset_ids uuid[] default null,
  match_count integer default 8,
  match_threshold double precision default 0.35
)
returns table (
  id uuid,
  asset_id uuid,
  chunk_index integer,
  title text,
  content text,
  token_count integer,
  page_start integer,
  page_end integer,
  similarity double precision
)
language sql
stable
as $$
  select
    c.id,
    c.asset_id,
    c.chunk_index,
    c.title,
    c.content,
    c.token_count,
    c.page_start,
    c.page_end,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.content_asset_chunks c
  where c.teacher_id = p_teacher_id
    and c.embedding is not null
    and (
      p_asset_ids is null
      or cardinality(p_asset_ids) = 0
      or c.asset_id = any(p_asset_ids)
    )
    and 1 - (c.embedding <=> query_embedding) >= match_threshold
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
