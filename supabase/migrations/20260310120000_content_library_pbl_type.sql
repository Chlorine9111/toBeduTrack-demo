-- 内容库：添加 PBL 项目类型支持

-- 扩展 content_type 枚举
alter table public.content_library_items drop constraint if exists content_library_items_content_type_check;
alter table public.content_library_items add constraint content_library_items_content_type_check
  check (content_type in ('rubric', 'lesson_plan', 'question', 'pbl', 'other'));

-- 扩展 renderer_type 枚举
alter table public.content_library_items drop constraint if exists content_library_items_renderer_type_check;
alter table public.content_library_items add constraint content_library_items_renderer_type_check
  check (renderer_type in ('rubric', 'lesson_plan_document', 'lesson_plan_markdown', 'exercise', 'pbl_project_plan', 'markdown'));

-- 扩展 origin_entity_type 枚举
alter table public.content_library_items drop constraint if exists content_library_items_origin_entity_type_check;
alter table public.content_library_items add constraint content_library_items_origin_entity_type_check
  check (origin_entity_type in ('rubric', 'lesson_plan', 'exercise', 'pbl_project_plan', 'assistant_message'));
