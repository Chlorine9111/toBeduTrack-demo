create table if not exists public.exercise_import_batches (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  source_kind text not null default 'manual'
    check (source_kind in ('pdf_scan', 'knowledge_document', 'agent_generated', 'manual')),
  label text not null,
  status text not null default 'completed'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  source_document_id uuid references public.knowledge_documents(id) on delete set null,
  source_upload_id uuid references public.pdf_scan_uploads(id) on delete set null,
  total_detected integer not null default 0,
  total_saved integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_exercise_import_batches_teacher_created
  on public.exercise_import_batches (teacher_id, created_at desc);

create index if not exists idx_exercise_import_batches_source_document
  on public.exercise_import_batches (source_document_id)
  where source_document_id is not null;

create index if not exists idx_exercise_import_batches_source_upload
  on public.exercise_import_batches (source_upload_id)
  where source_upload_id is not null;

drop trigger if exists exercise_import_batches_set_updated_at on public.exercise_import_batches;
create trigger exercise_import_batches_set_updated_at
  before update on public.exercise_import_batches
  for each row execute function public.set_updated_at();

alter table public.exercise_import_batches enable row level security;

drop policy if exists "exercise_import_batches_manage_own" on public.exercise_import_batches;
create policy "exercise_import_batches_manage_own"
  on public.exercise_import_batches
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

alter table public.exercises
  add column if not exists import_batch_id uuid references public.exercise_import_batches(id) on delete set null,
  add column if not exists source_kind text not null default 'manual'
    check (source_kind in ('pdf_scan', 'knowledge_document', 'agent_generated', 'manual')),
  add column if not exists source_document_id uuid references public.knowledge_documents(id) on delete set null,
  add column if not exists source_upload_id uuid references public.pdf_scan_uploads(id) on delete set null,
  add column if not exists source_file_name text,
  add column if not exists source_page_start integer,
  add column if not exists source_page_end integer,
  add column if not exists source_confidence integer,
  add column if not exists source_review_status text not null default 'unreviewed'
    check (source_review_status in ('ready', 'review', 'critical', 'unreviewed')),
  add column if not exists similarity_fingerprint text;

create index if not exists idx_exercises_import_batch
  on public.exercises (import_batch_id)
  where import_batch_id is not null;

create index if not exists idx_exercises_source_document
  on public.exercises (source_document_id)
  where source_document_id is not null;

create index if not exists idx_exercises_source_upload
  on public.exercises (source_upload_id)
  where source_upload_id is not null;

create index if not exists idx_exercises_source_kind
  on public.exercises (teacher_id, source_kind, updated_at desc);

create index if not exists idx_exercises_similarity_fingerprint
  on public.exercises (teacher_id, similarity_fingerprint)
  where similarity_fingerprint is not null;
