-- PBL v2 redesign
-- 1. pbl_project_plans.request_id becomes nullable
-- 2. promote original_prompt / primary_subject / grade / curriculum_system
-- 3. pbl_generation_logs support plan-based steps

ALTER TABLE public.pbl_project_plans
  DROP CONSTRAINT IF EXISTS pbl_project_plans_request_id_fkey;

ALTER TABLE public.pbl_project_plans
  ALTER COLUMN request_id DROP NOT NULL;

ALTER TABLE public.pbl_project_plans
  ADD CONSTRAINT pbl_project_plans_request_id_fkey
  FOREIGN KEY (request_id) REFERENCES public.pbl_generation_requests(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pbl_project_plans.request_id IS
  'v1 legacy generation request id; v2 plans may store NULL here';

ALTER TABLE public.pbl_project_plans
  ADD COLUMN IF NOT EXISTS original_prompt text;

ALTER TABLE public.pbl_project_plans
  ADD COLUMN IF NOT EXISTS primary_subject text;

ALTER TABLE public.pbl_project_plans
  ADD COLUMN IF NOT EXISTS grade text;

ALTER TABLE public.pbl_project_plans
  ADD COLUMN IF NOT EXISTS curriculum_system text;

COMMENT ON COLUMN public.pbl_project_plans.original_prompt IS 'Teacher original prompt for v2 PBL generation';
COMMENT ON COLUMN public.pbl_project_plans.primary_subject IS 'Primary subject promoted from payload';
COMMENT ON COLUMN public.pbl_project_plans.grade IS 'Grade promoted from payload';
COMMENT ON COLUMN public.pbl_project_plans.curriculum_system IS 'Curriculum system promoted from payload';

UPDATE public.pbl_project_plans
SET
  original_prompt = COALESCE(original_prompt, payload->>'originalPrompt', ''),
  primary_subject = COALESCE(primary_subject, payload->>'primarySubject', payload->'inferredParams'->>'primarySubject', '未知'),
  grade = COALESCE(grade, payload->>'grade', payload->'inferredParams'->>'grade', '未知'),
  curriculum_system = COALESCE(curriculum_system, payload->>'curriculumSystem', payload->'inferredParams'->>'curriculumSystem', 'CN')
WHERE original_prompt IS NULL
   OR primary_subject IS NULL
   OR grade IS NULL
   OR curriculum_system IS NULL;

ALTER TABLE public.pbl_generation_logs
  DROP CONSTRAINT IF EXISTS pbl_generation_logs_step_check;

ALTER TABLE public.pbl_generation_logs
  ADD CONSTRAINT pbl_generation_logs_step_check
  CHECK (step IN (
    'parse_input',
    'search_materials',
    'generate_overview',
    'expand_plan',
    'quality_check',
    'format_output',
    'search',
    'generate',
    'extract_metadata',
    'chat_iterate'
  ));

ALTER TABLE public.pbl_generation_logs
  DROP CONSTRAINT IF EXISTS pbl_generation_logs_request_id_fkey;

ALTER TABLE public.pbl_generation_logs
  ALTER COLUMN request_id DROP NOT NULL;

ALTER TABLE public.pbl_generation_logs
  ADD CONSTRAINT pbl_generation_logs_request_id_fkey
  FOREIGN KEY (request_id) REFERENCES public.pbl_generation_requests(id) ON DELETE SET NULL;

ALTER TABLE public.pbl_generation_logs
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.pbl_project_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pbl_generation_logs_plan
  ON public.pbl_generation_logs(plan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pbl_project_plans_subject
  ON public.pbl_project_plans(primary_subject);

CREATE INDEX IF NOT EXISTS idx_pbl_project_plans_curriculum
  ON public.pbl_project_plans(curriculum_system);
