-- PDF 扫描上传记录表
create table if not exists public.pdf_scan_uploads (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  file_name text not null,
  file_url text,
  storage_path text,
  file_size integer not null default 0,
  page_count integer,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  mathpix_id text,
  question_count integer default 0,
  scan_result jsonb,
  error_message text,
  processing_time_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pdf_scan_uploads is 'PDF 扫描上传记录';

-- 索引
create index if not exists idx_pdf_scan_uploads_teacher
  on public.pdf_scan_uploads (teacher_id);
create index if not exists idx_pdf_scan_uploads_status
  on public.pdf_scan_uploads (status);
create index if not exists idx_pdf_scan_uploads_created
  on public.pdf_scan_uploads (created_at desc);

-- RLS
alter table public.pdf_scan_uploads enable row level security;

create policy "Teachers can view own scans"
  on public.pdf_scan_uploads for select
  using (teacher_id = auth.uid());

create policy "Teachers can insert own scans"
  on public.pdf_scan_uploads for insert
  with check (teacher_id = auth.uid());

create policy "Teachers can update own scans"
  on public.pdf_scan_uploads for update
  using (teacher_id = auth.uid());

-- Service role bypass (for API routes using admin client)
create policy "Service role full access"
  on public.pdf_scan_uploads for all
  using (auth.role() = 'service_role');

-- updated_at trigger
create or replace function public.update_pdf_scan_uploads_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_pdf_scan_uploads_updated_at
  before update on public.pdf_scan_uploads
  for each row
  execute function public.update_pdf_scan_uploads_updated_at();
