create table if not exists closed_months (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  ending_balance numeric(12, 2) not null default 0,
  closed_at timestamptz not null default now(),
  reopened_at timestamptz,
  unique (user_id, month_key)
);

create index if not exists closed_months_user_id_idx on closed_months(user_id);
create index if not exists closed_months_user_month_idx on closed_months(user_id, month_key);

alter table closed_months enable row level security;

create policy "closed_months_select_own"
  on closed_months for select
  using (auth.uid() = user_id);

create policy "closed_months_insert_own"
  on closed_months for insert
  with check (auth.uid() = user_id);

create policy "closed_months_update_own"
  on closed_months for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "closed_months_delete_own"
  on closed_months for delete
  using (auth.uid() = user_id);
