-- 题库列表查询性能优化索引
-- 注意：不使用 CONCURRENTLY，因为 Supabase 迁移在事务中执行

-- 复合索引覆盖最常用的列表排序（teacher + updated_at DESC）
create index if not exists idx_exercises_teacher_updated_at
  on public.exercises (teacher_id, updated_at desc);

-- 按题型筛选
create index if not exists idx_exercises_teacher_type
  on public.exercises (teacher_id, exercise_type);

-- 按知识领域筛选
create index if not exists idx_exercises_teacher_cluster
  on public.exercises (teacher_id, knowledge_cluster);

-- 按来源类型筛选
create index if not exists idx_exercises_teacher_source_kind
  on public.exercises (teacher_id, source_kind);

-- 相似题查询加速（loadSimilarityCounts）
create index if not exists idx_exercises_teacher_fingerprint
  on public.exercises (teacher_id, similarity_fingerprint)
  where similarity_fingerprint is not null;

-- question_text 三字母索引（加速 ILIKE 关键字搜索）
create index if not exists idx_exercises_question_text_trgm
  on public.exercises using gin (question_text public.gin_trgm_ops);

-- 内容库 teacher + updated_at 复合索引
create index if not exists idx_content_library_items_teacher_updated
  on public.content_library_items (teacher_id, updated_at desc);
