-- ============================================================
-- DESK 开头的邀请码表示无学校隶属
-- 兑换时不设置 school_name 和 school_number
-- ============================================================

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
#variable_conflict use_column
declare
  v_code_row invite_codes%rowtype;
  v_global_num integer;
  v_school_num integer;
  v_is_desk boolean;
begin
  perform pg_advisory_xact_lock(hashtext('redeem_invite_code'));

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

  if exists (select 1 from public.teachers where id = p_teacher_id and invite_code_id is not null) then
    return query select false, 'already_redeemed'::text, null::text, null::integer, null::integer;
    return;
  end if;

  -- DESK 开头 = 无学校隶属
  v_is_desk := upper(btrim(p_code)) like 'DESK%';

  -- 全站编号（所有用户都有）
  select count(*) + 1 into v_global_num
  from public.teachers where global_number is not null;

  -- 学校编号（DESK 用户跳过）
  if not v_is_desk then
    select count(*) + 1 into v_school_num
    from public.teachers
    where teachers.school_name = v_code_row.school_name and school_number is not null;
  end if;

  -- 标记邀请码已使用
  update public.invite_codes
  set used_by = p_teacher_id, used_at = now()
  where id = v_code_row.id;

  -- 更新教师记录
  update public.teachers
  set
    invite_code_id = v_code_row.id,
    school_name = case when v_is_desk then null else v_code_row.school_name end,
    global_number = v_global_num,
    school_number = case when v_is_desk then null else v_school_num end,
    updated_at = now()
  where id = p_teacher_id;

  return query select true, null::text,
    case when v_is_desk then null else v_code_row.school_name end,
    v_global_num,
    case when v_is_desk then null::integer else v_school_num end;
end;
$$;
