alter table public.quota_accounts
  alter column quota_total set default 300;

update public.quota_accounts
set
  quota_total = 300,
  updated_at = timezone('utc', now())
where plan = 'beta_teacher';

update public.quota_accounts
set
  quota_used = 0,
  grace_buffer = 50,
  period_days = 30,
  period_start = timezone('utc', now()),
  period_end = timezone('utc', now()) + interval '30 days',
  updated_at = timezone('utc', now())
where plan = 'beta_teacher'
  and (
    grace_buffer <> 50
    or period_days <> 30
  );
