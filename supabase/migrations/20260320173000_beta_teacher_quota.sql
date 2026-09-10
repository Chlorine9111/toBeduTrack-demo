create table if not exists public.quota_accounts (
  teacher_id uuid primary key references public.teachers (id) on delete cascade,
  plan text not null default 'beta_teacher',
  status text not null default 'active' check (status in ('active', 'paused')),
  quota_total integer not null default 1000 check (quota_total >= 0),
  quota_used integer not null default 0 check (quota_used >= 0),
  grace_buffer integer not null default 50 check (grace_buffer >= 0),
  period_days smallint not null default 30 check (period_days between 1 and 365),
  period_start timestamptz not null default timezone('utc', now()),
  period_end timestamptz not null default (timezone('utc', now()) + interval '30 days'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists quota_accounts_plan_status_idx
  on public.quota_accounts (plan, status);

drop trigger if exists quota_accounts_set_updated_at on public.quota_accounts;
create trigger quota_accounts_set_updated_at
  before update on public.quota_accounts
  for each row execute function public.set_updated_at();

create table if not exists public.quota_transactions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  idempotency_key text not null,
  action text not null,
  quota_class text not null,
  units integer not null check (units >= 0),
  kind text not null default 'spend' check (kind in ('spend', 'adjustment')),
  balance_after integer not null check (balance_after >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (teacher_id, idempotency_key)
);

create index if not exists quota_transactions_teacher_created_idx
  on public.quota_transactions (teacher_id, created_at desc);

create index if not exists quota_transactions_action_created_idx
  on public.quota_transactions (action, created_at desc);

alter table public.quota_accounts enable row level security;
alter table public.quota_transactions enable row level security;

drop policy if exists "quota_accounts_select_own" on public.quota_accounts;
create policy "quota_accounts_select_own"
  on public.quota_accounts
  for select
  to authenticated
  using (teacher_id = auth.uid());

drop policy if exists "quota_accounts_service_role_all" on public.quota_accounts;
create policy "quota_accounts_service_role_all"
  on public.quota_accounts
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "quota_transactions_select_own" on public.quota_transactions;
create policy "quota_transactions_select_own"
  on public.quota_transactions
  for select
  to authenticated
  using (teacher_id = auth.uid());

drop policy if exists "quota_transactions_service_role_all" on public.quota_transactions;
create policy "quota_transactions_service_role_all"
  on public.quota_transactions
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.handle_new_teacher_quota_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := timezone('utc', now());
begin
  insert into public.quota_accounts (
    teacher_id,
    period_start,
    period_end
  )
  values (
    new.id,
    now_ts,
    now_ts + interval '30 days'
  )
  on conflict (teacher_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_teacher_quota_account_created on public.teachers;
create trigger on_teacher_quota_account_created
  after insert on public.teachers
  for each row execute function public.handle_new_teacher_quota_account();

insert into public.quota_accounts (
  teacher_id,
  period_start,
  period_end
)
select
  teachers.id,
  timezone('utc', now()),
  timezone('utc', now()) + interval '30 days'
from public.teachers as teachers
on conflict (teacher_id) do nothing;

create or replace function public.assert_quota_access(p_teacher_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return;
  end if;

  if auth.uid() is null then
    raise exception 'quota access denied';
  end if;

  if auth.uid() <> p_teacher_id then
    raise exception 'quota access denied';
  end if;
end;
$$;

create or replace function public.quota_touch_account(p_teacher_id uuid)
returns public.quota_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  account public.quota_accounts%rowtype;
  now_ts timestamptz := timezone('utc', now());
begin
  perform public.assert_quota_access(p_teacher_id);

  insert into public.quota_accounts (
    teacher_id,
    period_start,
    period_end
  )
  values (
    p_teacher_id,
    now_ts,
    now_ts + interval '30 days'
  )
  on conflict (teacher_id) do nothing;

  update public.quota_accounts
  set
    quota_used = 0,
    period_start = now_ts,
    period_end = now_ts + make_interval(days => period_days),
    updated_at = now_ts
  where teacher_id = p_teacher_id
    and period_end <= now_ts;

  select *
  into account
  from public.quota_accounts
  where teacher_id = p_teacher_id;

  return account;
end;
$$;

create or replace function public.get_quota_summary(p_teacher_id uuid)
returns table (
  plan text,
  status text,
  quota_total integer,
  quota_used integer,
  quota_remaining integer,
  quota_soft_remaining integer,
  grace_buffer integer,
  period_days smallint,
  period_start timestamptz,
  period_end timestamptz,
  usage_ratio numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  account public.quota_accounts%rowtype;
begin
  account := public.quota_touch_account(p_teacher_id);

  return query
  select
    account.plan,
    account.status,
    account.quota_total,
    account.quota_used,
    greatest(account.quota_total - account.quota_used, 0) as quota_remaining,
    greatest(account.quota_total + account.grace_buffer - account.quota_used, 0) as quota_soft_remaining,
    account.grace_buffer,
    account.period_days,
    account.period_start,
    account.period_end,
    case
      when account.quota_total <= 0 then 0::numeric
      else round(account.quota_used::numeric / account.quota_total::numeric, 4)
    end as usage_ratio;
end;
$$;

create or replace function public.check_quota_admission(
  p_teacher_id uuid,
  p_units integer
)
returns table (
  allowed boolean,
  reason text,
  requested_units integer,
  plan text,
  status text,
  quota_total integer,
  quota_used integer,
  quota_remaining integer,
  quota_soft_remaining integer,
  grace_buffer integer,
  period_days smallint,
  period_start timestamptz,
  period_end timestamptz,
  usage_ratio numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  account public.quota_accounts%rowtype;
  normalized_units integer := greatest(coalesce(p_units, 0), 0);
begin
  account := public.quota_touch_account(p_teacher_id);

  return query
  select
    account.status = 'active'
      and account.quota_used < account.quota_total
      and account.quota_used + normalized_units <= account.quota_total + account.grace_buffer as allowed,
    case
      when account.status <> 'active' then 'inactive'
      when account.quota_used >= account.quota_total then 'quota_exhausted'
      when account.quota_used + normalized_units > account.quota_total + account.grace_buffer then 'grace_exceeded'
      else null
    end as reason,
    normalized_units as requested_units,
    account.plan,
    account.status,
    account.quota_total,
    account.quota_used,
    greatest(account.quota_total - account.quota_used, 0) as quota_remaining,
    greatest(account.quota_total + account.grace_buffer - account.quota_used, 0) as quota_soft_remaining,
    account.grace_buffer,
    account.period_days,
    account.period_start,
    account.period_end,
    case
      when account.quota_total <= 0 then 0::numeric
      else round(account.quota_used::numeric / account.quota_total::numeric, 4)
    end as usage_ratio;
end;
$$;

create or replace function public.finalize_quota_spend(
  p_teacher_id uuid,
  p_action text,
  p_quota_class text,
  p_units integer,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  charged boolean,
  already_recorded boolean,
  reason text,
  transaction_id uuid,
  plan text,
  status text,
  quota_total integer,
  quota_used integer,
  quota_remaining integer,
  quota_soft_remaining integer,
  grace_buffer integer,
  period_days smallint,
  period_start timestamptz,
  period_end timestamptz,
  usage_ratio numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  account public.quota_accounts%rowtype;
  existing_tx public.quota_transactions%rowtype;
  created_tx public.quota_transactions%rowtype;
  now_ts timestamptz := timezone('utc', now());
  normalized_units integer := greatest(coalesce(p_units, 0), 0);
begin
  perform public.assert_quota_access(p_teacher_id);

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'quota idempotency key required';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(coalesce(p_teacher_id::text, '')),
    hashtext(p_idempotency_key)
  );

  insert into public.quota_accounts (
    teacher_id,
    period_start,
    period_end
  )
  values (
    p_teacher_id,
    now_ts,
    now_ts + interval '30 days'
  )
  on conflict (teacher_id) do nothing;

  update public.quota_accounts
  set
    quota_used = 0,
    period_start = now_ts,
    period_end = now_ts + make_interval(days => period_days),
    updated_at = now_ts
  where teacher_id = p_teacher_id
    and period_end <= now_ts;

  select *
  into account
  from public.quota_accounts
  where teacher_id = p_teacher_id
  for update;

  select *
  into existing_tx
  from public.quota_transactions
  where teacher_id = p_teacher_id
    and idempotency_key = p_idempotency_key
  limit 1;

  if found then
    return query
    select
      false as charged,
      true as already_recorded,
      'already_recorded'::text as reason,
      existing_tx.id as transaction_id,
      account.plan,
      account.status,
      account.quota_total,
      account.quota_used,
      greatest(account.quota_total - account.quota_used, 0) as quota_remaining,
      greatest(account.quota_total + account.grace_buffer - account.quota_used, 0) as quota_soft_remaining,
      account.grace_buffer,
      account.period_days,
      account.period_start,
      account.period_end,
      case
        when account.quota_total <= 0 then 0::numeric
        else round(account.quota_used::numeric / account.quota_total::numeric, 4)
      end as usage_ratio;
    return;
  end if;

  if account.status <> 'active' then
    return query
    select
      false as charged,
      false as already_recorded,
      'inactive'::text as reason,
      null::uuid as transaction_id,
      account.plan,
      account.status,
      account.quota_total,
      account.quota_used,
      greatest(account.quota_total - account.quota_used, 0) as quota_remaining,
      greatest(account.quota_total + account.grace_buffer - account.quota_used, 0) as quota_soft_remaining,
      account.grace_buffer,
      account.period_days,
      account.period_start,
      account.period_end,
      case
        when account.quota_total <= 0 then 0::numeric
        else round(account.quota_used::numeric / account.quota_total::numeric, 4)
      end as usage_ratio;
    return;
  end if;

  if account.quota_used + normalized_units > account.quota_total + account.grace_buffer then
    return query
    select
      false as charged,
      false as already_recorded,
      'grace_exceeded'::text as reason,
      null::uuid as transaction_id,
      account.plan,
      account.status,
      account.quota_total,
      account.quota_used,
      greatest(account.quota_total - account.quota_used, 0) as quota_remaining,
      greatest(account.quota_total + account.grace_buffer - account.quota_used, 0) as quota_soft_remaining,
      account.grace_buffer,
      account.period_days,
      account.period_start,
      account.period_end,
      case
        when account.quota_total <= 0 then 0::numeric
        else round(account.quota_used::numeric / account.quota_total::numeric, 4)
      end as usage_ratio;
    return;
  end if;

  update public.quota_accounts
  set
    quota_used = quota_used + normalized_units,
    updated_at = now_ts
  where teacher_id = p_teacher_id
  returning *
  into account;

  insert into public.quota_transactions (
    teacher_id,
    idempotency_key,
    action,
    quota_class,
    units,
    kind,
    balance_after,
    metadata
  )
  values (
    p_teacher_id,
    p_idempotency_key,
    p_action,
    p_quota_class,
    normalized_units,
    'spend',
    greatest(account.quota_total - account.quota_used, 0),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning *
  into created_tx;

  return query
  select
    true as charged,
    false as already_recorded,
    null::text as reason,
    created_tx.id as transaction_id,
    account.plan,
    account.status,
    account.quota_total,
    account.quota_used,
    greatest(account.quota_total - account.quota_used, 0) as quota_remaining,
    greatest(account.quota_total + account.grace_buffer - account.quota_used, 0) as quota_soft_remaining,
    account.grace_buffer,
    account.period_days,
    account.period_start,
    account.period_end,
    case
      when account.quota_total <= 0 then 0::numeric
      else round(account.quota_used::numeric / account.quota_total::numeric, 4)
    end as usage_ratio;
end;
$$;

grant execute on function public.get_quota_summary(uuid) to authenticated, service_role;
grant execute on function public.check_quota_admission(uuid, integer) to authenticated, service_role;
grant execute on function public.finalize_quota_spend(uuid, text, text, integer, text, jsonb) to authenticated, service_role;
