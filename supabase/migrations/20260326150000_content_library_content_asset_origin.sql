alter table public.content_library_items
  drop constraint if exists content_library_items_origin_entity_type_check;

alter table public.content_library_items
  add constraint content_library_items_origin_entity_type_check
  check (
    origin_entity_type in (
      'rubric',
      'lesson_plan',
      'exercise',
      'pbl_project_plan',
      'assistant_message',
      'content_asset'
    )
  );
