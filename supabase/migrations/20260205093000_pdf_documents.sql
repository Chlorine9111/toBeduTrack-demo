-- PDF documents storage metadata

create table if not exists public.pdf_documents (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  document_type text not null check (document_type in ('exam', 'rubric', 'worksheet')),
  title text not null,
  file_path text not null,
  file_size integer not null,
  config jsonb not null default '{}'::jsonb,
  worksheet_id uuid references public.worksheets(id) on delete set null,
  rubric_id uuid references public.rubrics(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pdf_documents_teacher_idx
  on public.pdf_documents (teacher_id);

create index if not exists pdf_documents_type_idx
  on public.pdf_documents (document_type);

create index if not exists pdf_documents_created_idx
  on public.pdf_documents (created_at);

alter table public.pdf_documents enable row level security;

create policy "pdf_documents_select_own" on public.pdf_documents
  for select using (teacher_id = auth.uid());

create policy "pdf_documents_insert_own" on public.pdf_documents
  for insert with check (teacher_id = auth.uid());

create policy "pdf_documents_update_own" on public.pdf_documents
  for update using (teacher_id = auth.uid());

create policy "pdf_documents_delete_own" on public.pdf_documents
  for delete using (teacher_id = auth.uid());

create trigger pdf_documents_set_updated_at
  before update on public.pdf_documents
  for each row execute function public.set_updated_at();

alter table public.worksheets
  add column if not exists pdf_path text,
  add column if not exists pdf_generated_at timestamptz;

alter table public.rubrics
  add column if not exists pdf_path text,
  add column if not exists pdf_generated_at timestamptz;
