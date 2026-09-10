-- 题库质量审查结果表
-- 记录每道题的审查详情（verdict、AI推理、图片检查等），供废题恢复参考

CREATE TABLE public.question_audit_results (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id        UUID NOT NULL REFERENCES public.questions(id),
  run_id             TEXT NOT NULL,
  phase              TEXT NOT NULL,
  verdict            TEXT NOT NULL,
  ai_answer          TEXT,
  correct_answer     TEXT,
  confidence         REAL,
  reasoning          TEXT,
  issues             TEXT[] DEFAULT '{}',
  image_urls_checked JSONB DEFAULT '[]',
  model_id           TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT question_audit_results_phase_check
    CHECK (phase IN ('precheck', 'gemini_screen', 'sonnet_review')),

  CONSTRAINT question_audit_results_verdict_check
    CHECK (verdict IN (
      'valid',
      'missing_image',
      'broken_image',
      'image_text_mismatch',
      'unsolvable',
      'ambiguous',
      'wrong_answer',
      'precheck_fail'
    ))
);

CREATE INDEX idx_qar_question_id ON public.question_audit_results (question_id);
CREATE INDEX idx_qar_run_id      ON public.question_audit_results (run_id);
CREATE INDEX idx_qar_verdict     ON public.question_audit_results (verdict);

ALTER TABLE public.question_audit_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages audit results"
  ON public.question_audit_results
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role');

CREATE POLICY "Anyone can read audit results"
  ON public.question_audit_results
  FOR SELECT
  USING (true);
