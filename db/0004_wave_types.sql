alter table line_items
  add column if not exists wave_type text check (wave_type in ('recurring', 'oneTime')),
  add column if not exists one_time_date date;

update line_items
set wave_type = 'recurring'
where wave_type is null;
