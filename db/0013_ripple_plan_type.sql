alter table public.line_items
add column if not exists plan_type text
check (plan_type in ('weekly_allowance', 'monthly_allowance', 'scheduled_expense'));

update public.line_items
set plan_type = case
  when is_income then null
  when ripple_type = 'flexible' and (wave_type = 'oneTime' or coalesce(recurrence->>'type', '') = 'monthly' or coalesce(recurrence->>'unit', '') = 'months')
    then 'monthly_allowance'
  when ripple_type = 'flexible'
    then 'weekly_allowance'
  else 'scheduled_expense'
end
where plan_type is null;
