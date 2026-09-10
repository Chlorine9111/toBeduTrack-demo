-- 废题隔离：为 questions 和 stimuli 添加 status 字段
-- 默认 'active'，废题标记为 'deprecated' 后前端不再显示

-- 1. questions 表添加 status
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.questions
  ADD CONSTRAINT questions_status_check
  CHECK (status IN ('active', 'deprecated'));

CREATE INDEX IF NOT EXISTS idx_questions_status
  ON public.questions (status);

-- 2. stimuli 表添加 status
ALTER TABLE public.stimuli
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.stimuli
  ADD CONSTRAINT stimuli_status_check
  CHECK (status IN ('active', 'deprecated'));

CREATE INDEX IF NOT EXISTS idx_stimuli_status
  ON public.stimuli (status);

-- 3. 更新 search_questions RPC：只返回 active 题目
DROP FUNCTION IF EXISTS public.search_questions(
  extensions.vector(1536), text, text, int, text, text, text, text, int
);

CREATE OR REPLACE FUNCTION public.search_questions(
  query_embedding extensions.vector(1536),
  search_mode text DEFAULT 'content',
  filter_course text DEFAULT NULL,
  filter_unit int DEFAULT NULL,
  filter_topic text DEFAULT NULL,
  filter_difficulty text DEFAULT NULL,
  filter_cognitive_task text DEFAULT NULL,
  filter_question_type text DEFAULT NULL,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  course text,
  unit int,
  topic_code text,
  difficulty text,
  cognitive_task text,
  transfer_distance text,
  stem text,
  choices jsonb,
  correct_answer text,
  explanation text,
  key_concepts text[],
  stimulus_id uuid,
  standalone_usable boolean,
  similarity float,
  stimulus_content_type text,
  stimulus_description text,
  stimulus_image_url text,
  question_type text,
  parts jsonb,
  source_assessment text,
  question_number int
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF search_mode = 'diagnostic' THEN
    RETURN QUERY
    SELECT
      q.id, q.course, q.unit, q.topic_code,
      q.difficulty, q.cognitive_task, q.transfer_distance,
      q.stem, q.choices, q.correct_answer,
      q.explanation, q.key_concepts, q.stimulus_id,
      q.standalone_usable,
      1 - (q.embedding_diagnostic <=> query_embedding) AS similarity,
      s.content_type AS stimulus_content_type,
      s.description AS stimulus_description,
      s.image_url AS stimulus_image_url,
      q.question_type, q.parts,
      q.source_assessment, q.question_number
    FROM public.questions q
    LEFT JOIN public.stimuli s ON q.stimulus_id = s.id
    WHERE
      q.status = 'active'
      AND (filter_course IS NULL OR q.course = filter_course)
      AND (filter_unit IS NULL OR q.unit = filter_unit)
      AND (filter_topic IS NULL OR q.topic_code = filter_topic)
      AND (filter_difficulty IS NULL OR q.difficulty = filter_difficulty)
      AND (filter_cognitive_task IS NULL OR q.cognitive_task = filter_cognitive_task)
      AND (filter_question_type IS NULL OR q.question_type = filter_question_type)
    ORDER BY q.embedding_diagnostic <=> query_embedding
    LIMIT match_count;
  ELSE
    RETURN QUERY
    SELECT
      q.id, q.course, q.unit, q.topic_code,
      q.difficulty, q.cognitive_task, q.transfer_distance,
      q.stem, q.choices, q.correct_answer,
      q.explanation, q.key_concepts, q.stimulus_id,
      q.standalone_usable,
      1 - (q.embedding_content <=> query_embedding) AS similarity,
      s.content_type AS stimulus_content_type,
      s.description AS stimulus_description,
      s.image_url AS stimulus_image_url,
      q.question_type, q.parts,
      q.source_assessment, q.question_number
    FROM public.questions q
    LEFT JOIN public.stimuli s ON q.stimulus_id = s.id
    WHERE
      q.status = 'active'
      AND (filter_course IS NULL OR q.course = filter_course)
      AND (filter_unit IS NULL OR q.unit = filter_unit)
      AND (filter_topic IS NULL OR q.topic_code = filter_topic)
      AND (filter_difficulty IS NULL OR q.difficulty = filter_difficulty)
      AND (filter_cognitive_task IS NULL OR q.cognitive_task = filter_cognitive_task)
      AND (filter_question_type IS NULL OR q.question_type = filter_question_type)
    ORDER BY q.embedding_content <=> query_embedding
    LIMIT match_count;
  END IF;
END;
$$;

-- 4. 更新 view：只展示 active 题目
DROP VIEW IF EXISTS public.questions_with_stimuli;
CREATE OR REPLACE VIEW public.questions_with_stimuli AS
SELECT
  q.*,
  s.content_type AS stimulus_content_type,
  s.description AS stimulus_description,
  s.image_url AS stimulus_image_url
FROM public.questions q
LEFT JOIN public.stimuli s ON q.stimulus_id = s.id
WHERE q.status = 'active';
