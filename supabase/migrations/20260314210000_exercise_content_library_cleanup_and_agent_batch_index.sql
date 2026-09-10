create index if not exists idx_exercise_import_batches_teacher_source_kind_created
  on public.exercise_import_batches (teacher_id, source_kind, created_at desc);

delete from public.semantic_index_items as s
using public.content_library_items as c
where c.origin_entity_type = 'exercise'
  and s.source_kind = 'content_library_item'
  and s.source_id = c.id;

delete from public.content_library_items
where origin_entity_type = 'exercise';
