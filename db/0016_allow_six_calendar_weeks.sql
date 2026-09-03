alter table public.monthly_amounts
drop constraint if exists monthly_amounts_week_index_check,
add constraint monthly_amounts_week_index_check check (week_index between 0 and 5);

alter table public.spend_logs
drop constraint if exists spend_logs_week_index_check,
add constraint spend_logs_week_index_check check (week_index between 0 and 5);

alter table public.dock_item_states
drop constraint if exists dock_item_states_week_index_check,
add constraint dock_item_states_week_index_check check (week_index between 0 and 5);

alter table public.closed_weeks
drop constraint if exists closed_weeks_week_index_check,
add constraint closed_weeks_week_index_check check (week_index between 0 and 5);
