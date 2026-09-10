-- ============================================================
-- Remove invite-code system
-- The welcome card now acts as a pure entry animation.
-- ============================================================

drop function if exists public.redeem_invite_code(uuid, text);

drop index if exists public.idx_teachers_global_number;
drop index if exists public.idx_teachers_school_number;

alter table if exists public.teachers
  drop column if exists invite_code_id,
  drop column if exists global_number,
  drop column if exists school_number;

drop table if exists public.invite_codes cascade;
drop table if exists public.invite_batches cascade;
