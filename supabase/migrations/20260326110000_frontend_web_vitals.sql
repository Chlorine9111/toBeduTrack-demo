create table if not exists public.frontend_web_vitals (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references auth.users(id) on delete set null,
  session_id uuid not null,
  route text not null,
  metric_id text not null,
  metric_name text not null check (metric_name in ('CLS', 'FCP', 'INP', 'LCP', 'TTFB')),
  metric_value double precision not null,
  metric_rating text check (metric_rating in ('good', 'needs-improvement', 'poor')),
  navigation_type text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists frontend_web_vitals_route_metric_created_idx
  on public.frontend_web_vitals (route, metric_name, created_at desc);

create index if not exists frontend_web_vitals_teacher_created_idx
  on public.frontend_web_vitals (teacher_id, created_at desc);

alter table public.frontend_web_vitals enable row level security;

create policy "frontend_web_vitals_select_own"
  on public.frontend_web_vitals
  for select
  using (teacher_id = auth.uid() or teacher_id is null);
