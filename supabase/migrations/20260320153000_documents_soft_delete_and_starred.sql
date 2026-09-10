alter table public.documents
  add column if not exists deleted_at timestamptz,
  add column if not exists starred boolean not null default false;

create index if not exists idx_documents_teacher_active_updated
  on public.documents(teacher_id, updated_at desc)
  where deleted_at is null;

create index if not exists idx_documents_teacher_starred_updated
  on public.documents(teacher_id, starred, updated_at desc)
  where deleted_at is null;

drop index if exists public.idx_documents_teacher_source;
create unique index if not exists idx_documents_teacher_source
  on public.documents(teacher_id, source_type, source_id)
  where source_id is not null and deleted_at is null;

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
    and deleted_at is null
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
    and deleted_at is null
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
