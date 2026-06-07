alter table public.payment_accounts
add column if not exists statement_closing_day integer
check (statement_closing_day between 1 and 31);
