alter table public.payment_accounts
add column if not exists payment_due_day integer
check (payment_due_day between 1 and 31),
add column if not exists preferred_payment_timing text
check (preferred_payment_timing in ('on_due_date', 'days_before_due', 'specific_day')),
add column if not exists preferred_payment_days_before_due integer
check (preferred_payment_days_before_due between 0 and 31),
add column if not exists preferred_payment_day integer
check (preferred_payment_day between 1 and 31);
