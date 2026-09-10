set search_path = public, extensions;

create index if not exists idx_semantic_index_items_metadata_gin
  on public.semantic_index_items using gin (metadata);

create or replace function public.match_semantic_index_items(
  p_teacher_id uuid,
  query_embedding vector(1536),
  p_source_kinds text[] default null,
  match_count integer default 8,
  match_threshold double precision default 0.35,
  p_status text default 'active',
  p_subject text default null,
  p_unit text default null,
  p_content_types text[] default null,
  p_origin_entity_types text[] default null,
  p_course_ids text[] default null,
  p_unit_ids text[] default null,
  p_item_types text[] default null,
  p_source_values text[] default null,
  p_cluster_node_ids text[] default null,
  p_subskill_node_ids text[] default null,
  p_knowledge_clusters text[] default null,
  p_assessment_styles text[] default null,
  p_difficulties text[] default null,
  p_chunk_keys text[] default null,
  p_has_figure boolean default null
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
    and (p_content_types is null or cardinality(p_content_types) = 0 or coalesce(s.metadata->>'contentType', '') = any(p_content_types))
    and (p_origin_entity_types is null or cardinality(p_origin_entity_types) = 0 or coalesce(s.metadata->>'originEntityType', '') = any(p_origin_entity_types))
    and (p_course_ids is null or cardinality(p_course_ids) = 0 or coalesce(s.metadata->>'courseId', '') = any(p_course_ids))
    and (p_unit_ids is null or cardinality(p_unit_ids) = 0 or coalesce(s.metadata->>'unitId', '') = any(p_unit_ids))
    and (p_item_types is null or cardinality(p_item_types) = 0 or coalesce(s.metadata->>'type', '') = any(p_item_types))
    and (p_source_values is null or cardinality(p_source_values) = 0 or coalesce(s.metadata->>'sourceKind', '') = any(p_source_values))
    and (p_cluster_node_ids is null or cardinality(p_cluster_node_ids) = 0 or coalesce(s.metadata->>'clusterNodeId', '') = any(p_cluster_node_ids))
    and (p_subskill_node_ids is null or cardinality(p_subskill_node_ids) = 0 or coalesce(s.metadata->>'subskillNodeId', '') = any(p_subskill_node_ids))
    and (p_knowledge_clusters is null or cardinality(p_knowledge_clusters) = 0 or coalesce(s.metadata->>'knowledgeCluster', '') = any(p_knowledge_clusters))
    and (p_assessment_styles is null or cardinality(p_assessment_styles) = 0 or coalesce(s.metadata->>'assessmentStyle', '') = any(p_assessment_styles))
    and (p_difficulties is null or cardinality(p_difficulties) = 0 or coalesce(s.metadata->>'difficulty', '') = any(p_difficulties))
    and (p_chunk_keys is null or cardinality(p_chunk_keys) = 0 or s.chunk_key = any(p_chunk_keys))
    and (
      p_has_figure is null or
      coalesce(nullif(s.metadata->>'hasFigure', '')::boolean, false) = p_has_figure
    )
    and 1 - (s.embedding <=> query_embedding) >= match_threshold
  order by s.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
