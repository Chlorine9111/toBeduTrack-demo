-- 统一 exercises 表的 difficulty 字段：从 integer (1-4) 改为 text (easy/medium/hard)
-- 与 questions 表的 difficulty 字段保持一致

-- 1. 删除旧的 CHECK 约束
ALTER TABLE public.exercises
  DROP CONSTRAINT IF EXISTS exercises_difficulty_check;

-- 2. 将 integer 值转换为 text
ALTER TABLE public.exercises
  ALTER COLUMN difficulty TYPE text
  USING CASE
    WHEN difficulty = 1 THEN 'easy'
    WHEN difficulty = 2 THEN 'medium'
    WHEN difficulty = 3 THEN 'hard'
    WHEN difficulty = 4 THEN 'hard'
    ELSE 'medium'
  END;

-- 3. 添加新的 CHECK 约束
ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_difficulty_check
  CHECK (difficulty IN ('easy', 'medium', 'hard'));

-- 4. 同步更新 exercise_examples 表（如果存在）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exercise_examples'
      AND column_name = 'difficulty'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE public.exercise_examples
      DROP CONSTRAINT IF EXISTS exercise_examples_difficulty_check;

    ALTER TABLE public.exercise_examples
      ALTER COLUMN difficulty TYPE text
      USING CASE
        WHEN difficulty = 1 THEN 'easy'
        WHEN difficulty = 2 THEN 'medium'
        WHEN difficulty = 3 THEN 'hard'
        WHEN difficulty = 4 THEN 'hard'
        ELSE 'medium'
      END;

    ALTER TABLE public.exercise_examples
      ADD CONSTRAINT exercise_examples_difficulty_check
      CHECK (difficulty IN ('easy', 'medium', 'hard'));
  END IF;
END $$;

-- 5. 同步更新 agent_temp_question_pools 表（如果存在且使用 integer）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agent_temp_question_pools'
      AND column_name = 'difficulty'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE public.agent_temp_question_pools
      ALTER COLUMN difficulty TYPE text
      USING CASE
        WHEN difficulty = 1 THEN 'easy'
        WHEN difficulty = 2 THEN 'medium'
        WHEN difficulty = 3 THEN 'hard'
        WHEN difficulty = 4 THEN 'hard'
        ELSE 'medium'
      END;
  END IF;
END $$;

-- 6. 更新 semantic_index_items 中 metadata 里的 difficulty 值
UPDATE public.semantic_index_items
SET metadata = jsonb_set(
  metadata,
  '{difficulty}',
  CASE
    WHEN (metadata->>'difficulty') = '1' THEN '"easy"'::jsonb
    WHEN (metadata->>'difficulty') = '2' THEN '"medium"'::jsonb
    WHEN (metadata->>'difficulty') = '3' THEN '"hard"'::jsonb
    WHEN (metadata->>'difficulty') = '4' THEN '"hard"'::jsonb
    ELSE metadata->'difficulty'
  END
)
WHERE metadata ? 'difficulty'
  AND (metadata->>'difficulty') IN ('1', '2', '3', '4');
