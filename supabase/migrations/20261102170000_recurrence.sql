-- How often an expense happens: Fixed (same amount each time), Recurring (regular, amount varies) or One-off.
alter table public.transactions add column recurrence text
  check (recurrence in ('Fixed', 'Recurring', 'One-off'));
alter table public.transactions add constraint recurrence_expense_only
  check (recurrence is null or type = 'Expense');
