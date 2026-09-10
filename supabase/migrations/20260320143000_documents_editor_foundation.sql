-- 统一文档编辑器基础表：当前服务 Notion-like HTML 编辑器，
-- 同时预留 document_model/source 字段，避免未来和通用文档引擎冲突。

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  title text not null default '',
  html_content text not null default '',
  properties jsonb not null default '[]'::jsonb check (jsonb_typeof(properties) = 'array'),
  document_kind text not null default 'notes',
  editor_kind text not null default 'html' check (editor_kind in ('html', 'block')),
  document_model jsonb,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  source_type text not null default 'standalone' check (
    source_type in ('artifact', 'content_library', 'standalone')
  ),
  source_id uuid,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_document_model_object
    check (document_model is null or jsonb_typeof(document_model) = 'object')
);

create index if not exists idx_documents_teacher_updated
  on public.documents(teacher_id, updated_at desc);

create index if not exists idx_documents_teacher_kind
  on public.documents(teacher_id, document_kind, updated_at desc);

create unique index if not exists idx_documents_teacher_source
  on public.documents(teacher_id, source_type, source_id)
  where source_id is not null;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

alter table public.documents enable row level security;

drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own"
  on public.documents
  for select
  using (teacher_id = auth.uid());

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own"
  on public.documents
  for insert
  with check (teacher_id = auth.uid());

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own"
  on public.documents
  for update
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own"
  on public.documents
  for delete
  using (teacher_id = auth.uid());

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  title text not null default '',
  html_content text not null default '',
  properties jsonb not null default '[]'::jsonb check (jsonb_typeof(properties) = 'array'),
  document_kind text not null default 'notes',
  editor_kind text not null default 'html' check (editor_kind in ('html', 'block')),
  document_model jsonb,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  version integer not null check (version >= 1),
  created_at timestamptz not null default now(),
  constraint document_versions_document_version_unique unique(document_id, version),
  constraint document_versions_document_model_object
    check (document_model is null or jsonb_typeof(document_model) = 'object')
);

create index if not exists idx_document_versions_document_version
  on public.document_versions(document_id, version desc);

create index if not exists idx_document_versions_teacher_created
  on public.document_versions(teacher_id, created_at desc);

alter table public.document_versions enable row level security;

drop policy if exists "document_versions_select_own" on public.document_versions;
create policy "document_versions_select_own"
  on public.document_versions
  for select
  using (teacher_id = auth.uid());

drop policy if exists "document_versions_insert_own" on public.document_versions;
create policy "document_versions_insert_own"
  on public.document_versions
  for insert
  with check (teacher_id = auth.uid());

drop policy if exists "document_versions_delete_own" on public.document_versions;
create policy "document_versions_delete_own"
  on public.document_versions
  for delete
  using (teacher_id = auth.uid());

create or replace function public.autosave_document(
  p_document_id uuid,
  p_teacher_id uuid,
  p_title text,
  p_html_content text,
  p_properties jsonb,
  p_expected_version integer
)
returns table(saved_at timestamptz, version integer, changed boolean)
language plpgsql
set search_path = public
as $$
declare
  v_document public.documents%rowtype;
  v_saved public.documents%rowtype;
  v_title text := coalesce(p_title, '');
  v_html_content text := coalesce(p_html_content, '');
  v_properties jsonb := case
    when jsonb_typeof(coalesce(p_properties, '[]'::jsonb)) = 'array' then coalesce(p_properties, '[]'::jsonb)
    else '[]'::jsonb
  end;
begin
  select *
  into v_document
  from public.documents
  where id = p_document_id
    and teacher_id = p_teacher_id
  for update;

  if not found then
    raise exception 'document_not_found';
  end if;

  if v_document.version <> p_expected_version then
    raise exception 'document_version_conflict';
  end if;

  if v_document.title = v_title
    and v_document.html_content = v_html_content
    and coalesce(v_document.properties, '[]'::jsonb) = v_properties then
    return query select v_document.updated_at, v_document.version, false;
    return;
  end if;

  update public.documents
  set
    title = v_title,
    html_content = v_html_content,
    properties = v_properties,
    version = v_document.version + 1,
    updated_at = now()
  where id = v_document.id
  returning *
  into v_saved;

  insert into public.document_versions (
    document_id,
    teacher_id,
    title,
    html_content,
    properties,
    document_kind,
    editor_kind,
    document_model,
    metadata,
    version,
    created_at
  )
  values (
    v_saved.id,
    v_saved.teacher_id,
    v_saved.title,
    v_saved.html_content,
    v_saved.properties,
    v_saved.document_kind,
    v_saved.editor_kind,
    v_saved.document_model,
    v_saved.metadata,
    v_saved.version,
    now()
  );

  delete from public.document_versions as dv
  where dv.document_id = v_saved.id
    and dv.version <= v_saved.version - 50;

  return query select v_saved.updated_at, v_saved.version, true;
end;
$$;

create or replace function public.restore_document_version(
  p_document_id uuid,
  p_version_id uuid,
  p_teacher_id uuid,
  p_expected_version integer default null
)
returns table(saved_at timestamptz, version integer, changed boolean)
language plpgsql
set search_path = public
as $$
declare
  v_document public.documents%rowtype;
  v_target public.document_versions%rowtype;
  v_saved public.documents%rowtype;
begin
  select *
  into v_document
  from public.documents
  where id = p_document_id
    and teacher_id = p_teacher_id
  for update;

  if not found then
    raise exception 'document_not_found';
  end if;

  if p_expected_version is not null and v_document.version <> p_expected_version then
    raise exception 'document_version_conflict';
  end if;

  select *
  into v_target
  from public.document_versions
  where id = p_version_id
    and document_id = p_document_id
    and teacher_id = p_teacher_id;

  if not found then
    raise exception 'document_version_not_found';
  end if;

  if v_document.title = v_target.title
    and v_document.html_content = v_target.html_content
    and coalesce(v_document.properties, '[]'::jsonb) = coalesce(v_target.properties, '[]'::jsonb)
    and v_document.document_kind = v_target.document_kind
    and v_document.editor_kind = v_target.editor_kind
    and coalesce(v_document.document_model, 'null'::jsonb) = coalesce(v_target.document_model, 'null'::jsonb)
    and coalesce(v_document.metadata, '{}'::jsonb) = coalesce(v_target.metadata, '{}'::jsonb) then
    return query select v_document.updated_at, v_document.version, false;
    return;
  end if;

  update public.documents
  set
    title = v_target.title,
    html_content = v_target.html_content,
    properties = v_target.properties,
    document_kind = v_target.document_kind,
    editor_kind = v_target.editor_kind,
    document_model = v_target.document_model,
    metadata = v_target.metadata,
    version = v_document.version + 1,
    updated_at = now()
  where id = v_document.id
  returning *
  into v_saved;

  insert into public.document_versions (
    document_id,
    teacher_id,
    title,
    html_content,
    properties,
    document_kind,
    editor_kind,
    document_model,
    metadata,
    version,
    created_at
  )
  values (
    v_saved.id,
    v_saved.teacher_id,
    v_saved.title,
    v_saved.html_content,
    v_saved.properties,
    v_saved.document_kind,
    v_saved.editor_kind,
    v_saved.document_model,
    v_saved.metadata,
    v_saved.version,
    now()
  );

  delete from public.document_versions as dv
  where dv.document_id = v_saved.id
    and dv.version <= v_saved.version - 50;

  return query select v_saved.updated_at, v_saved.version, true;
end;
$$;

grant execute on function public.autosave_document(uuid, uuid, text, text, jsonb, integer)
  to authenticated, service_role;

grant execute on function public.restore_document_version(uuid, uuid, uuid, integer)
  to authenticated, service_role;
