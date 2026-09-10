alter table public.exercises
  add column if not exists knowledge_subskill_key text,
  add column if not exists knowledge_subskill_label text,
  add column if not exists subskill_confidence integer not null default 0
    check (subskill_confidence between 0 and 100),
  add column if not exists subskill_match_mode text not null default 'needs_review'
    check (subskill_match_mode in ('matched_existing', 'candidate_new', 'needs_review', 'teacher_confirmed')),
  add column if not exists subskill_reasons text[] not null default '{}';

create index if not exists idx_exercises_knowledge_subskill_key
  on public.exercises (teacher_id, knowledge_subskill_key)
  where knowledge_subskill_key is not null;

create index if not exists idx_exercises_subskill_match_mode
  on public.exercises (teacher_id, subskill_match_mode);
