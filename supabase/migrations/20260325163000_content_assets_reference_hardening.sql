-- Content assets reference hardening
-- 1. reference rows must never look file-backed
-- 2. canonical content_library_item mappings must be unique and consistent

update public.content_assets
set
  storage_path = null,
  storage_bucket = null
where asset_source = 'reference'
  and (storage_path is not null or storage_bucket is not null);

create unique index if not exists idx_content_assets_teacher_library_item_unique
  on public.content_assets (teacher_id, content_library_item_id)
  where asset_source = 'reference'
    and content_library_item_id is not null;

alter table public.content_assets
  drop constraint if exists content_assets_file_backing_check;

alter table public.content_assets
  add constraint content_assets_file_backing_check
  check (
    (asset_source = 'uploaded' and storage_path is not null and storage_bucket is not null)
    or
    (asset_source = 'reference' and storage_path is null and storage_bucket is null)
  );

alter table public.content_assets
  drop constraint if exists content_assets_content_library_reference_consistency_check;

alter table public.content_assets
  add constraint content_assets_content_library_reference_consistency_check
  check (
    ref_entity_type is distinct from 'content_library_item'
    or (
      content_library_item_id is not null
      and ref_entity_id is not null
      and ref_entity_id = content_library_item_id
    )
  );
