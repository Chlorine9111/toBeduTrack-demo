-- ============================================================
-- 邀请码批量生成系统
-- 替换单一环境变量方案，支持按学校批量生成、一次性使用、用户编号
-- ============================================================

-- 1. 邀请码批次表
create table if not exists public.invite_batches (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  label text,
  quantity integer not null check (quantity > 0),
  created_by text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.invite_batches enable row level security;

create policy "invite_batches_service_role_all"
  on public.invite_batches
  for all
  to service_role
  using (true)
  with check (true);

-- 2. 邀请码表
create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.invite_batches(id) on delete cascade,
  code text not null,
  school_name text not null,
  used_by uuid references public.teachers(id) on delete set null,
  used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invite_codes_code_unique unique (code)
);

alter table public.invite_codes enable row level security;

create policy "invite_codes_service_role_all"
  on public.invite_codes
  for all
  to service_role
  using (true)
  with check (true);

create policy "invite_codes_select_own"
  on public.invite_codes
  for select
  to authenticated
  using (used_by = auth.uid());

-- 3. teachers 表新增列
alter table public.teachers
  add column if not exists invite_code_id uuid references public.invite_codes(id) on delete set null,
  add column if not exists global_number integer,
  add column if not exists school_number integer;

-- 4. 索引
create index if not exists idx_invite_codes_batch_id on public.invite_codes (batch_id);
create index if not exists idx_teachers_global_number on public.teachers (global_number) where global_number is not null;
create index if not exists idx_teachers_school_number on public.teachers (school_name, school_number) where school_number is not null;

-- 5. 核心 RPC: 兑换邀请码（原子操作）
create or replace function public.redeem_invite_code(
  p_teacher_id uuid,
  p_code text
)
returns table (
  success boolean,
  error_reason text,
  school_name text,
  global_number integer,
  school_number integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_row invite_codes%rowtype;
  v_global_num integer;
  v_school_num integer;
begin
  -- 全局排他锁，序列化所有编号分配，防止并发产生重复编号
  perform pg_advisory_xact_lock(hashtext('redeem_invite_code'));

  -- 锁定邀请码行，防止并发兑换
  select * into v_code_row
  from public.invite_codes
  where lower(btrim(code)) = lower(btrim(p_code))
  for update;

  if not found then
    return query select false, 'invalid_code'::text, null::text, null::integer, null::integer;
    return;
  end if;

  if v_code_row.used_by is not null then
    return query select false, 'already_used'::text, null::text, null::integer, null::integer;
    return;
  end if;

  if v_code_row.expires_at is not null and v_code_row.expires_at < now() then
    return query select false, 'expired'::text, null::text, null::integer, null::integer;
    return;
  end if;

  -- 检查该教师是否已经兑换过
  if exists (select 1 from public.teachers where id = p_teacher_id and invite_code_id is not null) then
    return query select false, 'already_redeemed'::text, null::text, null::integer, null::integer;
    return;
  end if;

  -- 计算全站编号（advisory lock 保证串行，无竞态）
  select count(*) + 1 into v_global_num
  from public.teachers where global_number is not null;

  -- 计算学校编号
  select count(*) + 1 into v_school_num
  from public.teachers
  where teachers.school_name = v_code_row.school_name and school_number is not null;

  -- 标记邀请码已使用
  update public.invite_codes
  set used_by = p_teacher_id, used_at = now()
  where id = v_code_row.id;

  -- 更新教师记录
  update public.teachers
  set
    invite_code_id = v_code_row.id,
    school_name = v_code_row.school_name,
    global_number = v_global_num,
    school_number = v_school_num,
    updated_at = now()
  where id = p_teacher_id;

  return query select true, null::text, v_code_row.school_name, v_global_num, v_school_num;
end;
$$;

grant execute on function public.redeem_invite_code(uuid, text) to service_role;

-- 6. 修改 handle_new_user 触发器：注册时自动兑换邀请码
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata jsonb;
  v_invite_code text;
  v_redeem_result record;
begin
  metadata := new.raw_user_meta_data;

  insert into public.teachers (
    id,
    full_name,
    display_name,
    avatar_url,
    school_name
  )
  values (
    new.id,
    nullif(coalesce(metadata->>'full_name', metadata->>'name', ''), ''),
    nullif(coalesce(metadata->>'display_name', metadata->>'preferred_name', metadata->>'name', ''), ''),
    nullif(coalesce(metadata->>'avatar_url', metadata->>'picture', ''), ''),
    nullif(coalesce(metadata->>'school_name', ''), '')
  )
  on conflict (id) do nothing;

  -- 自动兑换邀请码（如果 metadata 中包含）
  v_invite_code := nullif(btrim(metadata->>'invite_code'), '');
  if v_invite_code is not null then
    select * into v_redeem_result
    from public.redeem_invite_code(new.id, v_invite_code);
    if v_redeem_result is not null and not v_redeem_result.success then
      raise warning 'Auto-redeem invite code failed for user %: %',
        new.id, v_redeem_result.error_reason;
    end if;
  end if;

  return new;
end;
$$;
