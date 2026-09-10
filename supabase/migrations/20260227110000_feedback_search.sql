create extension if not exists pg_trgm;

create index if not exists idx_feedback_content_trgm
  on public.feedback using gin (content gin_trgm_ops);
