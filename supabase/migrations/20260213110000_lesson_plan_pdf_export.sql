-- Extend PDF metadata for lesson plan exports

do $$
declare
  doc_type_check_name text;
begin
  select c.conname
    into doc_type_check_name
  from pg_constraint c
  join pg_attribute a
    on a.attrelid = c.conrelid
   and a.attnum = any (c.conkey)
  where c.conrelid = 'public.pdf_documents'::regclass
    and c.contype = 'c'
    and a.attname = 'document_type'
  limit 1;

  if doc_type_check_name is not null then
    execute format(
      'alter table public.pdf_documents drop constraint %I',
      doc_type_check_name
    );
  end if;
end $$;

alter table public.pdf_documents
  add constraint pdf_documents_document_type_check
  check (document_type in ('exam', 'rubric', 'worksheet', 'lesson_plan'));

alter table public.pdf_documents
  add column if not exists lesson_plan_id uuid references public.lesson_plans(id) on delete set null;

create index if not exists pdf_documents_lesson_plan_idx
  on public.pdf_documents (lesson_plan_id);

alter table public.lesson_plans
  add column if not exists pdf_path text,
  add column if not exists pdf_generated_at timestamptz;
