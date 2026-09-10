alter table public.content_library_items
  add column if not exists document_id uuid references public.documents(id) on delete set null;

update public.content_library_items as item
set document_id = doc.id
from public.documents as doc
where item.document_id is null
  and doc.teacher_id = item.teacher_id
  and doc.source_type = 'content_library'
  and doc.source_id = item.id
  and doc.deleted_at is null;

create index if not exists idx_content_library_items_teacher_document
  on public.content_library_items (teacher_id, document_id)
  where document_id is not null;

create unique index if not exists idx_content_library_items_teacher_document_unique
  on public.content_library_items (teacher_id, document_id)
  where document_id is not null;
