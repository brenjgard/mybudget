alter table public.payment_accounts
add column if not exists current_balance_updated_at timestamptz;

update public.payment_accounts
set current_balance_updated_at = updated_at
where current_balance_updated_at is null
  and coalesce(type, case when kind = 'credit' then 'credit_card' else kind end) = 'credit_card';
