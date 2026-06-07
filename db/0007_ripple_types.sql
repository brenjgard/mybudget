alter table public.line_items
add column if not exists ripple_type text
check (ripple_type in ('fixed', 'flexible'));

update public.line_items as li
set ripple_type = 'flexible'
from public.categories as c
where li.category_id = c.id
  and li.is_income = false
  and li.ripple_type is null
  and (
    lower(c.name) in ('food', 'entertainment', 'personal care', 'pets')
    or lower(li.name) like '%grocery%'
    or lower(li.name) like '%groceries%'
    or lower(li.name) like '%eating out%'
    or lower(li.name) like '%dining%'
    or lower(li.name) like '%restaurant%'
    or lower(li.name) like '%takeout%'
    or lower(li.name) like '%gas%'
    or lower(li.name) like '%fuel%'
    or lower(li.name) like '%entertainment%'
  );

update public.line_items
set ripple_type = 'fixed'
where is_income = false
  and ripple_type is null;
