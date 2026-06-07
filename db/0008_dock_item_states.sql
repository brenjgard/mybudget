create table if not exists dock_item_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  week_index integer not null check (week_index between 0 and 4),
  item_id text not null,
  item_kind text not null check (item_kind in ('ripple', 'wave', 'credit_card_payment')),
  behavior_type text not null check (behavior_type in ('fixed_bill', 'flexible_spend', 'credit_card_payment', 'income')),
  status text not null default 'upcoming' check (status in ('upcoming', 'pending', 'cleared', 'skipped', 'adjusted')),
  status_updated_at timestamptz not null default now(),
  planned_amount numeric(12, 2),
  actual_amount numeric(12, 2),
  pending_until date,
  cleared_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month_key, week_index, item_id, item_kind)
);

create index if not exists dock_item_states_user_id_idx on dock_item_states(user_id);
create index if not exists dock_item_states_user_month_idx on dock_item_states(user_id, month_key);
create index if not exists dock_item_states_user_item_week_idx on dock_item_states(user_id, item_id, item_kind, month_key, week_index);
create index if not exists dock_item_states_user_status_idx on dock_item_states(user_id, status, month_key);

alter table dock_item_states enable row level security;

create policy "dock_item_states_select_own"
  on dock_item_states for select
  using (auth.uid() = user_id);

create policy "dock_item_states_insert_own"
  on dock_item_states for insert
  with check (auth.uid() = user_id);

create policy "dock_item_states_update_own"
  on dock_item_states for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "dock_item_states_delete_own"
  on dock_item_states for delete
  using (auth.uid() = user_id);
