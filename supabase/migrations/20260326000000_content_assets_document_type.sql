-- 扩展 content_assets.ref_entity_type 约束，增加 'document' 类型
alter table public.content_assets
  drop constraint if exists content_assets_ref_entity_type_check;
alter table public.content_assets
  add constraint content_assets_ref_entity_type_check
  check (ref_entity_type in (
    'rubric', 'lesson_plan', 'exercise', 'pbl_project_plan', 'content_library_item', 'flashcard_set', 'document'
  ));
