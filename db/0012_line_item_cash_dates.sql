alter table public.line_items
add column if not exists preferred_payment_date date,
add column if not exists payment_due_date date;
