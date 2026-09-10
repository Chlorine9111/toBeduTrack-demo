alter table public.knowledge_documents
  add column if not exists chunk_count integer not null default 0,
  add column if not exists full_text_length integer not null default 0,
  add column if not exists ocr_provider text,
  add column if not exists supermemory_ids text[] not null default '{}';
