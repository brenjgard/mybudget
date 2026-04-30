create extension if not exists pgcrypto;

create table profiles (
  user_id uuid not null primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table budget_settings (
  user_id uuid not null primary key references auth.users(id) on delete cascade,
  checking_balance numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table payment_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_key text not null,
  kind text not null check (kind in ('checking', 'credit')),
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_key),
  unique (user_id, id)
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (user_id, id)
);

create table line_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null,
  payment_account_id uuid not null,
  name text not null,
  default_amount numeric(12, 2) not null default 0,
  is_income boolean not null default false,
  frequency text not null check (
    frequency in (
      'every-week',
      'every-other-week',
      'twice-a-month',
      'once-a-month-1',
      'once-a-month-2',
      'once-a-month-3',
      'once-a-month-4',
      'quarterly',
      'annually',
      'week-1',
      'week-2',
      'week-3',
      'week-4',
      'week-5',
      'biweekly-odd',
      'biweekly-even'
    )
  ),
  anchor_date date,
  anchor_month integer check (anchor_month between 1 and 12),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, category_id) references categories(user_id, id) on delete restrict,
  foreign key (user_id, payment_account_id) references payment_accounts(user_id, id) on delete restrict,
  unique (user_id, id)
);

create table monthly_amounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  line_item_id uuid not null,
  month_key text not null check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  week_index integer not null check (week_index between 0 and 4),
  amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, line_item_id) references line_items(user_id, id) on delete cascade,
  unique (user_id, line_item_id, month_key, week_index)
);

create table month_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  starting_balance numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month_key)
);

create table cc_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  line_item_id uuid,
  payment_account_id uuid not null,
  item_name text not null,
  card_label text not null,
  amount numeric(12, 2) not null,
  week_label text not null,
  date_moved date not null,
  created_at timestamptz not null default now(),
  foreign key (line_item_id) references line_items(id) on delete set null,
  foreign key (user_id, payment_account_id) references payment_accounts(user_id, id) on delete restrict
);

create table buoys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  current numeric(12, 2) not null default 0,
  goal numeric(12, 2) not null default 0,
  auto_save numeric(12, 2),
  auto_save_day integer check (auto_save_day between 1 and 31),
  last_auto_save date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table closed_weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_account_id uuid not null,
  month_key text not null check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  week_index integer not null check (week_index between 0 and 4),
  closed_at timestamptz not null default now(),
  foreign key (user_id, payment_account_id) references payment_accounts(user_id, id) on delete restrict,
  unique (user_id, payment_account_id, month_key, week_index)
);

create index profiles_user_id_idx on profiles(user_id);
create index budget_settings_user_id_idx on budget_settings(user_id);

create index payment_accounts_user_id_idx on payment_accounts(user_id);
create index payment_accounts_user_account_key_idx on payment_accounts(user_id, account_key);
create index payment_accounts_user_kind_sort_idx on payment_accounts(user_id, kind, sort_order);

create index categories_user_id_idx on categories(user_id);
create index categories_user_sort_idx on categories(user_id, sort_order);

create index line_items_user_id_idx on line_items(user_id);
create index line_items_user_category_idx on line_items(user_id, category_id);
create index line_items_user_payment_account_idx on line_items(user_id, payment_account_id);
create index line_items_user_income_sort_idx on line_items(user_id, is_income, sort_order);

create index monthly_amounts_user_id_idx on monthly_amounts(user_id);
create index monthly_amounts_user_month_idx on monthly_amounts(user_id, month_key);
create index monthly_amounts_user_month_week_idx on monthly_amounts(user_id, month_key, week_index);
create index monthly_amounts_user_line_item_month_idx on monthly_amounts(user_id, line_item_id, month_key);

create index month_balances_user_id_idx on month_balances(user_id);
create index month_balances_user_month_idx on month_balances(user_id, month_key);

create index cc_charges_user_id_idx on cc_charges(user_id);
create index cc_charges_user_date_idx on cc_charges(user_id, date_moved desc);
create index cc_charges_user_account_date_idx on cc_charges(user_id, payment_account_id, date_moved desc);

create index buoys_user_id_idx on buoys(user_id);
create index buoys_user_name_idx on buoys(user_id, name);
create index buoys_user_auto_save_idx on buoys(user_id, auto_save_day) where auto_save is not null;

create index closed_weeks_user_id_idx on closed_weeks(user_id);
create index closed_weeks_user_month_idx on closed_weeks(user_id, month_key);
create index closed_weeks_user_account_month_idx on closed_weeks(user_id, payment_account_id, month_key);
