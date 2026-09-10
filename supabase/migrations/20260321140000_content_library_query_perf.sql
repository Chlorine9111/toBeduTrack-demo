create extension if not exists pg_trgm with schema public;

create index if not exists idx_content_library_items_search_text_trgm
  on public.content_library_items using gin (search_text gin_trgm_ops);

create index if not exists idx_exercise_taxonomy_links_teacher_cluster_node
  on public.exercise_taxonomy_links (teacher_id, cluster_node_id)
  where cluster_node_id is not null;

create index if not exists idx_exercise_taxonomy_links_teacher_subskill_node
  on public.exercise_taxonomy_links (teacher_id, subskill_node_id)
  where subskill_node_id is not null;

create index if not exists idx_exercises_teacher_course_unit_difficulty_style
  on public.exercises (teacher_id, course_id, unit_id, difficulty, assessment_style);
