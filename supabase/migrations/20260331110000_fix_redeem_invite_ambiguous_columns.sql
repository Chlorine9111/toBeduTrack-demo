-- Fix: "column reference is ambiguous" in redeem_invite_code
-- The RETURNS TABLE output columns (school_name, global_number, school_number)
-- clash with teachers table columns. Use #variable_conflict use_column to
-- tell PL/pgSQL to prefer table columns over output columns when ambiguous.

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

  select count(*) + 1 into v_global_num
  from public.teachers where global_number is not null;

  select count(*) + 1 into v_school_num
  from public.teachers
  where teachers.school_name = v_code_row.school_name and school_number is not null;

  update public.invite_codes
  set used_by = p_teacher_id, used_at = now()
  where id = v_code_row.id;

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
