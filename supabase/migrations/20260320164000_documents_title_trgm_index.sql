create extension if not exists pg_trgm;

create index if not exists idx_documents_active_title_trgm
  on public.documents using gin (title gin_trgm_ops)
  where deleted_at is null;
