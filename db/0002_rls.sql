alter table profiles enable row level security;
alter table budget_settings enable row level security;
alter table payment_accounts enable row level security;
alter table categories enable row level security;
alter table line_items enable row level security;
alter table monthly_amounts enable row level security;
alter table month_balances enable row level security;
alter table cc_charges enable row level security;
alter table buoys enable row level security;
alter table closed_weeks enable row level security;

create policy "profiles_select_own"
  on profiles for select
  using (auth.uid() = user_id);

create policy "profiles_insert_own"
  on profiles for insert
  with check (auth.uid() = user_id);

create policy "profiles_update_own"
  on profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "profiles_delete_own"
  on profiles for delete
  using (auth.uid() = user_id);

create policy "budget_settings_select_own"
  on budget_settings for select
  using (auth.uid() = user_id);

create policy "budget_settings_insert_own"
  on budget_settings for insert
  with check (auth.uid() = user_id);

create policy "budget_settings_update_own"
  on budget_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "budget_settings_delete_own"
  on budget_settings for delete
  using (auth.uid() = user_id);

create policy "payment_accounts_select_own"
  on payment_accounts for select
  using (auth.uid() = user_id);

create policy "payment_accounts_insert_own"
  on payment_accounts for insert
  with check (auth.uid() = user_id);

create policy "payment_accounts_update_own"
  on payment_accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "payment_accounts_delete_own"
  on payment_accounts for delete
  using (auth.uid() = user_id);

create policy "categories_select_own"
  on categories for select
  using (auth.uid() = user_id);

create policy "categories_insert_own"
  on categories for insert
  with check (auth.uid() = user_id);

create policy "categories_update_own"
  on categories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "categories_delete_own"
  on categories for delete
  using (auth.uid() = user_id);

create policy "line_items_select_own"
  on line_items for select
  using (auth.uid() = user_id);

create policy "line_items_insert_own"
  on line_items for insert
  with check (auth.uid() = user_id);

create policy "line_items_update_own"
  on line_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "line_items_delete_own"
  on line_items for delete
  using (auth.uid() = user_id);

create policy "monthly_amounts_select_own"
  on monthly_amounts for select
  using (auth.uid() = user_id);

create policy "monthly_amounts_insert_own"
  on monthly_amounts for insert
  with check (auth.uid() = user_id);

create policy "monthly_amounts_update_own"
  on monthly_amounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "monthly_amounts_delete_own"
  on monthly_amounts for delete
  using (auth.uid() = user_id);

create policy "month_balances_select_own"
  on month_balances for select
  using (auth.uid() = user_id);

create policy "month_balances_insert_own"
  on month_balances for insert
  with check (auth.uid() = user_id);

create policy "month_balances_update_own"
  on month_balances for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "month_balances_delete_own"
  on month_balances for delete
  using (auth.uid() = user_id);

create policy "cc_charges_select_own"
  on cc_charges for select
  using (auth.uid() = user_id);

create policy "cc_charges_insert_own"
  on cc_charges for insert
  with check (auth.uid() = user_id);

create policy "cc_charges_update_own"
  on cc_charges for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "cc_charges_delete_own"
  on cc_charges for delete
  using (auth.uid() = user_id);

create policy "buoys_select_own"
  on buoys for select
  using (auth.uid() = user_id);

create policy "buoys_insert_own"
  on buoys for insert
  with check (auth.uid() = user_id);

create policy "buoys_update_own"
  on buoys for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "buoys_delete_own"
  on buoys for delete
  using (auth.uid() = user_id);

create policy "closed_weeks_select_own"
  on closed_weeks for select
  using (auth.uid() = user_id);

create policy "closed_weeks_insert_own"
  on closed_weeks for insert
  with check (auth.uid() = user_id);

create policy "closed_weeks_update_own"
  on closed_weeks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "closed_weeks_delete_own"
  on closed_weeks for delete
  using (auth.uid() = user_id);
