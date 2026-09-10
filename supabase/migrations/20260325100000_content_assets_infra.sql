-- ============================================
-- Content Assets Infrastructure
-- 4 tables: content_folders, content_assets,
--           content_asset_chunks, background_jobs
-- + RPC: match_content_asset_chunks
-- + Storage bucket: content-assets
-- ============================================

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm;

set search_path = public, extensions;

-- ============================================
-- 1. content_folders（文件夹树）
-- ============================================
create table if not exists public.content_folders (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  parent_id uuid references public.content_folders(id) on delete cascade,
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  is_system boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_content_folders_unique_slug
  on public.content_folders (teacher_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);

create index if not exists idx_content_folders_teacher_parent_sort
  on public.content_folders (teacher_id, parent_id, sort_order);

create trigger content_folders_set_updated_at
  before update on public.content_folders
  for each row execute function public.set_updated_at();

alter table public.content_folders enable row level security;

create policy "content_folders_select"
  on public.content_folders for select
  using (teacher_id = auth.uid());

create policy "content_folders_insert"
  on public.content_folders for insert
  with check (teacher_id = auth.uid());

create policy "content_folders_update"
  on public.content_folders for update
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "content_folders_delete"
  on public.content_folders for delete
  using (teacher_id = auth.uid());

-- ============================================
-- 2. content_assets（资产主表）
-- ============================================
create table if not exists public.content_assets (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  folder_id uuid references public.content_folders(id) on delete set null,
  asset_source text not null check (asset_source in ('uploaded', 'reference')),
  file_name text,
  file_type text,
  mime_type text,
  file_size_bytes bigint,
  storage_path text,
  storage_bucket text default 'content-assets',
  ref_entity_type text check (ref_entity_type in (
    'rubric', 'lesson_plan', 'exercise', 'pbl_project_plan', 'content_library_item'
  )),
  ref_entity_id uuid,
  content_library_item_id uuid references public.content_library_items(id) on delete set null,
  title text not null,
  raw_text text,
  summary_text text,
  tags text[] default '{}',
  search_text text not null default '',
  course_id uuid references public.courses(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  course_label text,
  unit_label text,
  processing_status text not null default 'pending' check (processing_status in (
    'pending', 'parsing', 'chunking', 'embedding', 'summarizing', 'ready', 'failed'
  )),
  processing_error text,
  chunk_count integer not null default 0,
  page_count integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_assets_teacher_folder_updated
  on public.content_assets (teacher_id, folder_id, updated_at desc);

create index if not exists idx_content_assets_teacher_status
  on public.content_assets (teacher_id, processing_status);

create index if not exists idx_content_assets_teacher_source_updated
  on public.content_assets (teacher_id, asset_source, updated_at desc);

create index if not exists idx_content_assets_ref_entity
  on public.content_assets (ref_entity_type, ref_entity_id);

create index if not exists idx_content_assets_search_text_trgm
  on public.content_assets using gin (search_text gin_trgm_ops);

create trigger content_assets_set_updated_at
  before update on public.content_assets
  for each row execute function public.set_updated_at();

alter table public.content_assets enable row level security;

create policy "content_assets_select"
  on public.content_assets for select
  using (teacher_id = auth.uid());

create policy "content_assets_insert"
  on public.content_assets for insert
  with check (teacher_id = auth.uid());

create policy "content_assets_update"
  on public.content_assets for update
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "content_assets_delete"
  on public.content_assets for delete
  using (teacher_id = auth.uid());

-- ============================================
-- 3. content_asset_chunks（分块 + 向量）
-- ============================================
create table if not exists public.content_asset_chunks (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.content_assets(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  chunk_index integer not null,
  page_start integer,
  page_end integer,
  title text,
  content text not null,
  content_preview text,
  token_count integer not null default 0,
  embedding extensions.vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, chunk_index)
);

create index if not exists idx_content_asset_chunks_asset_index
  on public.content_asset_chunks (asset_id, chunk_index asc);

create index if not exists idx_content_asset_chunks_teacher_created
  on public.content_asset_chunks (teacher_id, created_at desc);

create index if not exists idx_content_asset_chunks_embedding_hnsw
  on public.content_asset_chunks
  using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create trigger content_asset_chunks_set_updated_at
  before update on public.content_asset_chunks
  for each row execute function public.set_updated_at();

alter table public.content_asset_chunks enable row level security;

create policy "content_asset_chunks_select"
  on public.content_asset_chunks for select
  using (teacher_id = auth.uid());

create policy "content_asset_chunks_insert"
  on public.content_asset_chunks for insert
  with check (teacher_id = auth.uid());

create policy "content_asset_chunks_update"
  on public.content_asset_chunks for update
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "content_asset_chunks_delete"
  on public.content_asset_chunks for delete
  using (teacher_id = auth.uid());

-- ============================================
-- 4. background_jobs（通用后台任务队列）
-- ============================================
create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.teachers(id) on delete cascade,
  job_type text not null,
  job_key text not null unique,
  status text not null default 'pending' check (status in (
    'pending', 'running', 'completed', 'failed', 'dead_letter'
  )),
  priority integer not null default 0,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  available_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_background_jobs_worker_poll
  on public.background_jobs (status, priority desc, available_at asc, created_at asc);

create index if not exists idx_background_jobs_type_status
  on public.background_jobs (job_type, status, created_at desc);

create index if not exists idx_background_jobs_teacher_status
  on public.background_jobs (teacher_id, status, created_at desc);

create trigger background_jobs_set_updated_at
  before update on public.background_jobs
  for each row execute function public.set_updated_at();

alter table public.background_jobs enable row level security;

create policy "background_jobs_select"
  on public.background_jobs for select
  using (teacher_id = auth.uid());

create policy "background_jobs_insert"
  on public.background_jobs for insert
  with check (false);

create policy "background_jobs_update"
  on public.background_jobs for update
  using (false);

create policy "background_jobs_delete"
  on public.background_jobs for delete
  using (false);

-- ============================================
-- 5. match_content_asset_chunks RPC
-- ============================================
create or replace function public.match_content_asset_chunks(
  p_teacher_id uuid,
  query_embedding extensions.vector(1536),
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
    and 1 - (c.embedding <=> query_embedding) >= match_threshold
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- ============================================
-- 6. Storage bucket: content-assets
-- ============================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('content-assets', 'content-assets', false, 52428800)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'content_assets_objects_select_own'
  ) then
    create policy "content_assets_objects_select_own"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'content-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'content_assets_objects_insert_own'
  ) then
    create policy "content_assets_objects_insert_own"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'content-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'content_assets_objects_delete_own'
  ) then
    create policy "content_assets_objects_delete_own"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'content-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end
$$;
