-- 公告系统：管理员发布公告，教师接收并可关闭
-- 支持全局广播和按学校定向发送

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null default '',
  target_type text not null default 'global' check (target_type in ('global', 'school')),
  target_schools text[] not null default '{}',
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references public.teachers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_announcements_active on public.announcements (is_active, starts_at, expires_at)
  where is_active = true;

alter table public.announcements enable row level security;

-- 所有已认证用户可读活跃公告
create policy "announcements_select_authenticated"
  on public.announcements for select to authenticated
  using (true);

-- 仅 service_role 可管理
create policy "announcements_manage_service_role"
  on public.announcements for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 教师关闭公告的记录
create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (announcement_id, teacher_id)
);

alter table public.announcement_reads enable row level security;

-- 用户只能读写自己的已读记录
create policy "announcement_reads_select_own"
  on public.announcement_reads for select to authenticated
  using (teacher_id = auth.uid());

create policy "announcement_reads_insert_own"
  on public.announcement_reads for insert to authenticated
  with check (teacher_id = auth.uid());

-- service_role 完全访问
create policy "announcement_reads_service_role"
  on public.announcement_reads for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
