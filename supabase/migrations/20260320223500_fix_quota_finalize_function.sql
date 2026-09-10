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

  update public.quota_accounts as qa
  set
    quota_used = 0,
    period_start = now_ts,
    period_end = now_ts + make_interval(days => qa.period_days),
    updated_at = now_ts
  where qa.teacher_id = p_teacher_id
    and qa.period_end <= now_ts;

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

  update public.quota_accounts as qa
  set
    quota_used = qa.quota_used + normalized_units,
    updated_at = now_ts
  where qa.teacher_id = p_teacher_id
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
