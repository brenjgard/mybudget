create table if not exists spend_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  week_index integer not null check (week_index between 0 and 4),
  ripple_id uuid,
  payment_account_id uuid not null,
  amount numeric(12, 2) not null check (amount >= 0),
  spend_date date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, ripple_id) references line_items(user_id, id) on delete cascade,
  foreign key (user_id, payment_account_id) references payment_accounts(user_id, id) on delete restrict,
  unique (user_id, id)
);

create index if not exists spend_logs_user_id_idx on spend_logs(user_id);
create index if not exists spend_logs_user_month_idx on spend_logs(user_id, month_key);
create index if not exists spend_logs_user_ripple_week_idx on spend_logs(user_id, ripple_id, month_key, week_index);
create index if not exists spend_logs_user_payment_date_idx on spend_logs(user_id, payment_account_id, spend_date desc);

alter table spend_logs enable row level security;

create policy "spend_logs_select_own"
  on spend_logs for select
  using (auth.uid() = user_id);

create policy "spend_logs_insert_own"
  on spend_logs for insert
  with check (auth.uid() = user_id);

create policy "spend_logs_update_own"
  on spend_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "spend_logs_delete_own"
  on spend_logs for delete
  using (auth.uid() = user_id);
