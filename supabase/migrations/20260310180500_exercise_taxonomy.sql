alter table public.exercises
  add column if not exists knowledge_cluster text,
  add column if not exists knowledge_tags text[] not null default '{}'::text[],
  add column if not exists assessment_style text,
  add column if not exists assessment_tags text[] not null default '{}'::text[],
  add column if not exists classification_confidence integer not null default 0,
  add column if not exists classification_status text not null default 'unreviewed'
    check (classification_status in ('auto_confirmed', 'needs_review', 'teacher_confirmed', 'unreviewed')),
  add column if not exists classification_reasons text[] not null default '{}'::text[];

create index if not exists idx_exercises_knowledge_cluster
  on public.exercises (teacher_id, knowledge_cluster)
  where knowledge_cluster is not null;

create index if not exists idx_exercises_assessment_style
  on public.exercises (teacher_id, assessment_style)
  where assessment_style is not null;

create index if not exists idx_exercises_classification_status
  on public.exercises (teacher_id, classification_status);
