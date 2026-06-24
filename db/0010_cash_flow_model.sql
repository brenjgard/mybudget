alter table public.payment_accounts
add column if not exists type text default 'checking',
add column if not exists current_balance numeric(12, 2) not null default 0,
add column if not exists statement_close_day integer check (statement_close_day between 1 and 31),
add column if not exists payment_due_day integer check (payment_due_day between 1 and 31),
add column if not exists active boolean not null default true;

alter table public.payment_accounts
alter column type set default 'checking';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_accounts_type_check'
      and conrelid = 'public.payment_accounts'::regclass
  ) then
    alter table public.payment_accounts
    add constraint payment_accounts_type_check
    check (type in ('checking', 'credit_card', 'savings', 'cash'));
  end if;
end $$;

update public.payment_accounts
set type = case
  when kind = 'credit' then 'credit_card'
  when kind = 'checking' then 'checking'
  when kind = 'savings' then 'savings'
  when kind = 'cash' then 'cash'
  else 'checking'
end
where type is null;

update public.payment_accounts
set statement_close_day = coalesce(statement_close_day, statement_closing_day)
where statement_close_day is null
  and statement_closing_day is not null;

update public.payment_accounts as pa
set current_balance = bs.checking_balance
from public.budget_settings as bs
where pa.user_id = bs.user_id
  and pa.account_key = 'checking'
  and pa.current_balance = 0;

insert into public.payment_accounts (
  user_id,
  account_key,
  kind,
  type,
  label,
  current_balance,
  sort_order
)
select
  bs.user_id,
  'checking',
  'checking',
  'checking',
  'Checking',
  bs.checking_balance,
  0
from public.budget_settings as bs
where not exists (
  select 1
  from public.payment_accounts as pa
  where pa.user_id = bs.user_id
    and pa.account_key = 'checking'
);

insert into public.payment_accounts (
  user_id,
  account_key,
  kind,
  type,
  label,
  current_balance,
  sort_order
)
select
  p.user_id,
  'checking',
  'checking',
  'checking',
  'Checking',
  0,
  0
from public.profiles as p
where not exists (
  select 1
  from public.payment_accounts as pa
  where pa.user_id = p.user_id
    and pa.account_key = 'checking'
);

insert into public.payment_accounts (
  user_id,
  account_key,
  kind,
  type,
  label,
  current_balance,
  sort_order
)
select
  bs.user_id,
  'primary-credit-card',
  'credit',
  'credit_card',
  'Primary Credit Card',
  0,
  1
from public.budget_settings as bs
where not exists (
  select 1
  from public.payment_accounts as pa
  where pa.user_id = bs.user_id
    and coalesce(pa.type, case when pa.kind = 'credit' then 'credit_card' else pa.kind end) = 'credit_card'
);

insert into public.payment_accounts (
  user_id,
  account_key,
  kind,
  type,
  label,
  current_balance,
  sort_order
)
select
  p.user_id,
  'primary-credit-card',
  'credit',
  'credit_card',
  'Primary Credit Card',
  0,
  1
from public.profiles as p
where not exists (
  select 1
  from public.payment_accounts as pa
  where pa.user_id = p.user_id
    and coalesce(pa.type, case when pa.kind = 'credit' then 'credit_card' else pa.kind end) = 'credit_card'
);

create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null,
  name text not null,
  amount numeric(12, 2) not null default 0,
  recurrence_type text not null default 'legacy',
  recurrence_config jsonb,
  default_payment_account_id uuid,
  default_cash_account_id uuid,
  payment_method text not null check (payment_method in ('cash', 'checking', 'credit_card')),
  active boolean not null default true,
  legacy_line_item_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, category_id) references public.categories(user_id, id) on delete restrict,
  foreign key (user_id, default_payment_account_id) references public.payment_accounts(user_id, id) on delete restrict,
  foreign key (user_id, default_cash_account_id) references public.payment_accounts(user_id, id) on delete restrict,
  foreign key (user_id, legacy_line_item_id) references public.line_items(user_id, id) on delete set null (legacy_line_item_id),
  unique (user_id, id)
);

create table if not exists public.actual_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  merchant text,
  amount numeric(12, 2) not null check (amount >= 0),
  category_id uuid not null,
  account_id uuid not null,
  payment_method text not null check (payment_method in ('cash', 'checking', 'credit_card')),
  notes text,
  source text not null default 'manual' check (source in ('manual', 'planned', 'imported')),
  planned_item_id uuid,
  legacy_spend_log_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, category_id) references public.categories(user_id, id) on delete restrict,
  foreign key (user_id, account_id) references public.payment_accounts(user_id, id) on delete restrict,
  foreign key (user_id, planned_item_id) references public.budget_items(user_id, id) on delete set null (planned_item_id),
  foreign key (user_id, legacy_spend_log_id) references public.spend_logs(user_id, id) on delete set null (legacy_spend_log_id),
  unique (user_id, id)
);

create table if not exists public.credit_card_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credit_card_account_id uuid not null,
  cash_account_id uuid not null,
  amount numeric(12, 2) not null check (amount >= 0),
  scheduled_date date not null,
  status text not null default 'planned' check (status in ('planned', 'paid', 'skipped')),
  statement_period_start date,
  statement_period_end date,
  due_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, credit_card_account_id) references public.payment_accounts(user_id, id) on delete restrict,
  foreign key (user_id, cash_account_id) references public.payment_accounts(user_id, id) on delete restrict,
  unique (user_id, id)
);

create table if not exists public.cash_flow_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  direction text not null check (direction in ('inflow', 'outflow')),
  cash_account_id uuid not null,
  linked_account_id uuid,
  linked_transaction_id uuid,
  linked_credit_card_payment_id uuid,
  name text not null,
  category text not null,
  status text not null default 'projected' check (status in ('projected', 'scheduled', 'cleared', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, cash_account_id) references public.payment_accounts(user_id, id) on delete restrict,
  foreign key (user_id, linked_account_id) references public.payment_accounts(user_id, id) on delete set null (linked_account_id),
  foreign key (user_id, linked_transaction_id) references public.actual_transactions(user_id, id) on delete set null (linked_transaction_id),
  foreign key (user_id, linked_credit_card_payment_id) references public.credit_card_payments(user_id, id) on delete set null (linked_credit_card_payment_id),
  unique (user_id, id)
);

create index if not exists payment_accounts_user_type_sort_idx on public.payment_accounts(user_id, type, sort_order);
create index if not exists payment_accounts_user_active_idx on public.payment_accounts(user_id, active);

create index if not exists budget_items_user_id_idx on public.budget_items(user_id);
create index if not exists budget_items_user_category_idx on public.budget_items(user_id, category_id);
create index if not exists budget_items_user_payment_account_idx on public.budget_items(user_id, default_payment_account_id);
create index if not exists budget_items_user_cash_account_idx on public.budget_items(user_id, default_cash_account_id);
create index if not exists budget_items_user_active_idx on public.budget_items(user_id, active);
create unique index if not exists budget_items_user_legacy_line_item_idx
  on public.budget_items(user_id, legacy_line_item_id)
  where legacy_line_item_id is not null;

create index if not exists actual_transactions_user_id_idx on public.actual_transactions(user_id);
create index if not exists actual_transactions_user_date_idx on public.actual_transactions(user_id, date desc);
create index if not exists actual_transactions_user_category_date_idx on public.actual_transactions(user_id, category_id, date desc);
create index if not exists actual_transactions_user_account_date_idx on public.actual_transactions(user_id, account_id, date desc);
create unique index if not exists actual_transactions_user_legacy_spend_log_idx
  on public.actual_transactions(user_id, legacy_spend_log_id)
  where legacy_spend_log_id is not null;

create index if not exists credit_card_payments_user_id_idx on public.credit_card_payments(user_id);
create index if not exists credit_card_payments_user_scheduled_idx on public.credit_card_payments(user_id, scheduled_date);
create index if not exists credit_card_payments_user_card_scheduled_idx on public.credit_card_payments(user_id, credit_card_account_id, scheduled_date);
create index if not exists credit_card_payments_user_status_idx on public.credit_card_payments(user_id, status);

create index if not exists cash_flow_events_user_id_idx on public.cash_flow_events(user_id);
create index if not exists cash_flow_events_user_date_idx on public.cash_flow_events(user_id, date);
create index if not exists cash_flow_events_user_cash_date_idx on public.cash_flow_events(user_id, cash_account_id, date);
create index if not exists cash_flow_events_user_status_idx on public.cash_flow_events(user_id, status);

alter table public.budget_items enable row level security;
alter table public.actual_transactions enable row level security;
alter table public.credit_card_payments enable row level security;
alter table public.cash_flow_events enable row level security;

drop policy if exists "budget_items_select_own" on public.budget_items;
create policy "budget_items_select_own"
  on public.budget_items for select
  using (auth.uid() = user_id);

drop policy if exists "budget_items_insert_own" on public.budget_items;
create policy "budget_items_insert_own"
  on public.budget_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "budget_items_update_own" on public.budget_items;
create policy "budget_items_update_own"
  on public.budget_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "budget_items_delete_own" on public.budget_items;
create policy "budget_items_delete_own"
  on public.budget_items for delete
  using (auth.uid() = user_id);

drop policy if exists "actual_transactions_select_own" on public.actual_transactions;
create policy "actual_transactions_select_own"
  on public.actual_transactions for select
  using (auth.uid() = user_id);

drop policy if exists "actual_transactions_insert_own" on public.actual_transactions;
create policy "actual_transactions_insert_own"
  on public.actual_transactions for insert
  with check (auth.uid() = user_id);

drop policy if exists "actual_transactions_update_own" on public.actual_transactions;
create policy "actual_transactions_update_own"
  on public.actual_transactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "actual_transactions_delete_own" on public.actual_transactions;
create policy "actual_transactions_delete_own"
  on public.actual_transactions for delete
  using (auth.uid() = user_id);

drop policy if exists "credit_card_payments_select_own" on public.credit_card_payments;
create policy "credit_card_payments_select_own"
  on public.credit_card_payments for select
  using (auth.uid() = user_id);

drop policy if exists "credit_card_payments_insert_own" on public.credit_card_payments;
create policy "credit_card_payments_insert_own"
  on public.credit_card_payments for insert
  with check (auth.uid() = user_id);

drop policy if exists "credit_card_payments_update_own" on public.credit_card_payments;
create policy "credit_card_payments_update_own"
  on public.credit_card_payments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "credit_card_payments_delete_own" on public.credit_card_payments;
create policy "credit_card_payments_delete_own"
  on public.credit_card_payments for delete
  using (auth.uid() = user_id);

drop policy if exists "cash_flow_events_select_own" on public.cash_flow_events;
create policy "cash_flow_events_select_own"
  on public.cash_flow_events for select
  using (auth.uid() = user_id);

drop policy if exists "cash_flow_events_insert_own" on public.cash_flow_events;
create policy "cash_flow_events_insert_own"
  on public.cash_flow_events for insert
  with check (auth.uid() = user_id);

drop policy if exists "cash_flow_events_update_own" on public.cash_flow_events;
create policy "cash_flow_events_update_own"
  on public.cash_flow_events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "cash_flow_events_delete_own" on public.cash_flow_events;
create policy "cash_flow_events_delete_own"
  on public.cash_flow_events for delete
  using (auth.uid() = user_id);

insert into public.budget_items (
  user_id,
  category_id,
  name,
  amount,
  recurrence_type,
  recurrence_config,
  default_payment_account_id,
  default_cash_account_id,
  payment_method,
  active,
  legacy_line_item_id,
  created_at,
  updated_at
)
select
  li.user_id,
  li.category_id,
  li.name,
  li.default_amount,
  coalesce(li.recurrence ->> 'type', li.wave_type, 'legacy'),
  coalesce(li.recurrence, jsonb_build_object(
    'frequency', li.frequency,
    'anchorDate', li.anchor_date,
    'anchorMonth', li.anchor_month,
    'oneTimeDate', li.one_time_date
  )),
  li.payment_account_id,
  cash_account.id,
  case
    when coalesce(pa.type, case when pa.kind = 'credit' then 'credit_card' else pa.kind end) = 'credit_card' then 'credit_card'
    when coalesce(pa.type, pa.kind) = 'cash' then 'cash'
    else 'checking'
  end,
  true,
  li.id,
  li.created_at,
  li.updated_at
from public.line_items as li
join public.payment_accounts as pa
  on pa.user_id = li.user_id
  and pa.id = li.payment_account_id
left join public.payment_accounts as cash_account
  on cash_account.user_id = li.user_id
  and cash_account.account_key = 'checking'
where not exists (
  select 1
  from public.budget_items as bi
  where bi.user_id = li.user_id
    and bi.legacy_line_item_id = li.id
);

insert into public.actual_transactions (
  user_id,
  date,
  merchant,
  amount,
  category_id,
  account_id,
  payment_method,
  notes,
  source,
  planned_item_id,
  legacy_spend_log_id,
  created_at,
  updated_at
)
select
  sl.user_id,
  sl.spend_date,
  li.name,
  sl.amount,
  li.category_id,
  sl.payment_account_id,
  case
    when coalesce(pa.type, case when pa.kind = 'credit' then 'credit_card' else pa.kind end) = 'credit_card' then 'credit_card'
    when coalesce(pa.type, pa.kind) = 'cash' then 'cash'
    else 'checking'
  end,
  sl.note,
  'manual',
  bi.id,
  sl.id,
  sl.created_at,
  sl.updated_at
from public.spend_logs as sl
join public.line_items as li
  on li.user_id = sl.user_id
  and li.id = sl.ripple_id
join public.payment_accounts as pa
  on pa.user_id = sl.user_id
  and pa.id = sl.payment_account_id
left join public.budget_items as bi
  on bi.user_id = sl.user_id
  and bi.legacy_line_item_id = sl.ripple_id
where not exists (
  select 1
  from public.actual_transactions as atx
  where atx.user_id = sl.user_id
    and atx.legacy_spend_log_id = sl.id
);
