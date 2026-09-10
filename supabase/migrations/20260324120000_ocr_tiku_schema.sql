-- ============================================
-- OCR 题库 Schema 集成
-- 来源: ocr-tiku 项目（7 个 migration 合并）
-- Embedding: gemini-embedding-2-preview (1536 维)
-- ============================================

-- 1. 确保 pgvector 扩展已启用
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ============================================
-- 2. stimuli 表（共享素材）
-- ============================================
CREATE TABLE stimuli (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type    TEXT NOT NULL,
  description     TEXT,
  image_url       TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- content_type 约束（合并所有学科）
ALTER TABLE stimuli
  ADD CONSTRAINT stimuli_content_type_check
  CHECK (content_type IN (
    'diagram', 'data_table', 'passage', 'image', 'map',
    'bar_and_line_graph', 'bar_chart', 'gantt_chart', 'graph',
    'line_graph', 'table', 'text', 'text_data', 'text_passage',
    'boxplot', 'computer_output', 'data_list', 'dotplot',
    'histogram', 'residual_plot', 'scatterplot', 'data_table_and_boxplot',
    'chemical_equation', 'chemical_equation_and_data_table',
    'chemical_equation_and_graph', 'chemical_equation_and_passage',
    'diagram_and_data_table', 'passage_and_diagram', 'passage_and_graph',
    'code', 'code_snippet',
    'chemical_equation_with_data', 'chemical_equation_with_diagram',
    'chemical_equations_with_data', 'data_table_and_diagram',
    'electrolysis_diagram', 'electrolytic_cell_diagram',
    'electrolytic_cell_diagram_with_data', 'electroplating_diagram',
    'energy_diagram', 'galvanic_cell_diagram', 'galvanic_cell_diagram_with_data',
    'galvanic_cell_table', 'half_reaction_table', 'half_reaction_with_data',
    'particle_diagram', 'particle_diagram_with_equation',
    'structural_formula_with_data',
    'diagram_and_graph', 'graph_choices', 'graph_set'
  ));

COMMENT ON TABLE stimuli IS '题目关联的共享素材（图表、数据表、文段等）';

-- ============================================
-- 3. questions 表（核心表）
-- ============================================
CREATE TABLE questions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 来源元数据
  course                  TEXT NOT NULL,
  unit                    INT NOT NULL,
  source_type             TEXT NOT NULL,
  source_assessment       TEXT NOT NULL,
  question_number         INT,

  -- 内容分类（LLM 打标）
  topic_code              TEXT,
  secondary_topics        TEXT[] DEFAULT '{}',
  big_idea                TEXT,
  enduring_understanding  TEXT,
  science_practice        INT,
  skill_code              TEXT,
  difficulty              TEXT,
  cognitive_task          TEXT,
  transfer_distance       TEXT,

  -- 题目内容
  stimulus_id             UUID REFERENCES stimuli(id),
  position_in_set         INT,
  stem                    TEXT NOT NULL,
  choices                 JSONB NOT NULL,
  correct_answer          TEXT NOT NULL,
  explanation             TEXT,
  key_concepts            TEXT[] DEFAULT '{}',

  -- 可用性标记
  stimulus_dependent      BOOLEAN DEFAULT false,
  standalone_usable       BOOLEAN DEFAULT true,
  requires_calculation    BOOLEAN DEFAULT false,
  negative_stem           BOOLEAN DEFAULT false,

  -- 语义向量（gemini-embedding-2-preview, 1536 维）
  embedding_content       extensions.vector(1536),
  embedding_diagnostic    extensions.vector(1536),

  -- 全文搜索
  fts                     tsvector GENERATED ALWAYS AS (
                            to_tsvector('english', stem || ' ' || COALESCE(explanation, ''))
                          ) STORED,

  -- 时间戳
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 4. 约束（最终状态，合并所有学科扩展）
-- ============================================
ALTER TABLE questions
  ADD CONSTRAINT questions_course_check
  CHECK (course IN (
    'APES', 'AP_CSA', 'AP_MICRO', 'AP_CHEM', 'AP_CSP',
    'AP_STATS', 'AP_PHYSICS_EM', 'AP_PHYSICS_1', 'AP_PHYSICS_2',
    'AP_CALC_AB', 'AP_CALC_BC', 'AP_MACRO', 'AP_BIO',
    'AP_PRECALC', 'AP_PHYSICS_CM',
    'AP_PHYSICS_C_MECH', 'AP_PHYSICS_C_EM'
  ));

ALTER TABLE questions
  ADD CONSTRAINT questions_source_type_check
  CHECK (source_type IN ('progress_check_mcq', 'progress_check_frq', 'practice_exam', 'question_bank'));

ALTER TABLE questions
  ADD CONSTRAINT questions_difficulty_check
  CHECK (difficulty IN ('easy', 'medium', 'hard'));

-- cognitive_task: 不设约束（各学科差异太大）

ALTER TABLE questions
  ADD CONSTRAINT questions_transfer_check
  CHECK (transfer_distance IN ('near', 'far'));

ALTER TABLE questions
  ADD CONSTRAINT questions_answer_check
  CHECK (correct_answer IN ('A', 'B', 'C', 'D', 'E'));

-- ============================================
-- 5. 索引
-- ============================================

-- 结构化查询索引
CREATE INDEX idx_questions_course_unit ON questions (course, unit);
CREATE INDEX idx_questions_topic ON questions (topic_code);
CREATE INDEX idx_questions_difficulty ON questions (difficulty);
CREATE INDEX idx_questions_cognitive_task ON questions (cognitive_task);
CREATE INDEX idx_questions_stimulus ON questions (stimulus_id);

-- 向量搜索索引（HNSW）
CREATE INDEX idx_questions_embedding_content ON questions
  USING hnsw (embedding_content extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_questions_embedding_diagnostic ON questions
  USING hnsw (embedding_diagnostic extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 全文搜索索引
CREATE INDEX idx_questions_fts ON questions USING gin(fts);

-- 数组搜索索引
CREATE INDEX idx_questions_concepts ON questions USING gin(key_concepts);

-- ============================================
-- 6. updated_at 自动更新触发器
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_questions_updated_at
  BEFORE UPDATE ON questions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 7. Storage Bucket
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-assets', 'question-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read question-assets" ON storage.objects
  FOR SELECT USING (bucket_id = 'question-assets');

CREATE POLICY "Service role upload question-assets" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'question-assets'
    AND (select auth.role()) = 'authenticated'
  );

-- ============================================
-- 8. RLS
-- ============================================
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stimuli ENABLE ROW LEVEL SECURITY;

-- 所有人可读（公共题库）
CREATE POLICY "Anyone can read questions" ON questions
  FOR SELECT USING (true);

CREATE POLICY "Anyone can read stimuli" ON stimuli
  FOR SELECT USING (true);

-- 只有 service_role 可写
CREATE POLICY "Service role can insert questions" ON questions
  FOR INSERT WITH CHECK ((select auth.role()) = 'service_role');

CREATE POLICY "Service role can update questions" ON questions
  FOR UPDATE USING ((select auth.role()) = 'service_role');

CREATE POLICY "Service role can insert stimuli" ON stimuli
  FOR INSERT WITH CHECK ((select auth.role()) = 'service_role');

CREATE POLICY "Service role can update stimuli" ON stimuli
  FOR UPDATE USING ((select auth.role()) = 'service_role');

-- ============================================
-- 9. 混合检索 RPC（含 stimulus 字段）
-- ============================================
CREATE OR REPLACE FUNCTION search_questions(
  query_embedding extensions.vector(1536),
  search_mode TEXT DEFAULT 'content',
  filter_course TEXT DEFAULT NULL,
  filter_unit INT DEFAULT NULL,
  filter_topic TEXT DEFAULT NULL,
  filter_difficulty TEXT DEFAULT NULL,
  filter_cognitive_task TEXT DEFAULT NULL,
  match_count INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  course TEXT,
  unit INT,
  topic_code TEXT,
  difficulty TEXT,
  cognitive_task TEXT,
  transfer_distance TEXT,
  stem TEXT,
  choices JSONB,
  correct_answer TEXT,
  explanation TEXT,
  key_concepts TEXT[],
  stimulus_id UUID,
  standalone_usable BOOLEAN,
  similarity FLOAT,
  stimulus_content_type TEXT,
  stimulus_description TEXT,
  stimulus_image_url TEXT
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
      s.image_url AS stimulus_image_url
    FROM questions q
    LEFT JOIN stimuli s ON q.stimulus_id = s.id
    WHERE
      (filter_course IS NULL OR q.course = filter_course)
      AND (filter_unit IS NULL OR q.unit = filter_unit)
      AND (filter_topic IS NULL OR q.topic_code = filter_topic)
      AND (filter_difficulty IS NULL OR q.difficulty = filter_difficulty)
      AND (filter_cognitive_task IS NULL OR q.cognitive_task = filter_cognitive_task)
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
      s.image_url AS stimulus_image_url
    FROM questions q
    LEFT JOIN stimuli s ON q.stimulus_id = s.id
    WHERE
      (filter_course IS NULL OR q.course = filter_course)
      AND (filter_unit IS NULL OR q.unit = filter_unit)
      AND (filter_topic IS NULL OR q.topic_code = filter_topic)
      AND (filter_difficulty IS NULL OR q.difficulty = filter_difficulty)
      AND (filter_cognitive_task IS NULL OR q.cognitive_task = filter_cognitive_task)
    ORDER BY q.embedding_content <=> query_embedding
    LIMIT match_count;
  END IF;
END;
$$;

-- ============================================
-- 10. View（题目 + stimulus 联合查询）
-- ============================================
CREATE VIEW questions_with_stimuli AS
SELECT
  q.*,
  s.content_type AS stimulus_content_type,
  s.description AS stimulus_description,
  s.image_url AS stimulus_image_url
FROM questions q
LEFT JOIN stimuli s ON q.stimulus_id = s.id;
