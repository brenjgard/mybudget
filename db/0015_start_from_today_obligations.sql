alter table public.credit_card_payments
add column if not exists source_type text not null default 'generated'
check (source_type in ('generated', 'manual', 'opening_statement')),
add column if not exists statement_close_date date,
add column if not exists paid_date date;

comment on column public.credit_card_payments.source_type is
  'Classifies whether a card payment was generated from tracked activity, manually scheduled, or seeded as an opening statement obligation.';

comment on column public.line_items.one_time_date is
  'For one-time obligations, the date or budget-month anchor where the obligation belongs in Budget.';

comment on column public.line_items.preferred_payment_date is
  'Optional cash execution date override; Budget timing remains anchored by recurrence or one_time_date.';

comment on column public.line_items.payment_due_date is
  'Optional due/cash fallback date; Budget timing remains anchored by recurrence or one_time_date.';

alter table public.line_items
add column if not exists include_in_cash_forecast boolean not null default false;

comment on column public.line_items.include_in_cash_forecast is
  'When true, a non-scheduled allowance still creates expected checking cash events in Dock using its budget recurrence.';
