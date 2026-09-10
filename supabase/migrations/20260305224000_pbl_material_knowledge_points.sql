-- PBL: material <-> knowledge-point mapping + embedding dimension alignment

create table if not exists public.pbl_material_knowledge_points (
  material_id uuid not null references public.pbl_materials(id) on delete cascade,
  knowledge_point_id uuid not null references public.pbl_knowledge_points(id) on delete cascade,
  relevance text not null default 'primary' check (relevance in ('primary', 'supporting')),
  created_at timestamptz not null default now(),
  primary key (material_id, knowledge_point_id)
);

create index if not exists idx_pbl_mkp_knowledge_point
  on public.pbl_material_knowledge_points(knowledge_point_id);

create index if not exists idx_pbl_mkp_material
  on public.pbl_material_knowledge_points(material_id);

alter table public.pbl_material_knowledge_points enable row level security;

drop policy if exists pbl_mkp_public_select on public.pbl_material_knowledge_points;
create policy pbl_mkp_public_select on public.pbl_material_knowledge_points
for select using (
  exists (
    select 1
    from public.pbl_materials m
    where m.id = pbl_material_knowledge_points.material_id
      and m.visibility = 'public'
  )
);

drop policy if exists pbl_mkp_private_owner_select on public.pbl_material_knowledge_points;
create policy pbl_mkp_private_owner_select on public.pbl_material_knowledge_points
for select using (
  exists (
    select 1
    from public.pbl_materials m
    where m.id = pbl_material_knowledge_points.material_id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists pbl_mkp_service_role_all on public.pbl_material_knowledge_points;
create policy pbl_mkp_service_role_all on public.pbl_material_knowledge_points
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- material_chunks may exist from earlier OCR/knowledge pipelines.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'material_chunks'
      and column_name = 'embedding'
  ) then
    execute 'alter table public.material_chunks alter column embedding type vector(1536)';
  end if;
end;
$$;

-- Prepare semantic search index (effective after embedding backfill).
create index if not exists idx_pbl_materials_embedding_hnsw
  on public.pbl_materials
  using hnsw (embedding vector_cosine_ops)
  where embedding is not null;
