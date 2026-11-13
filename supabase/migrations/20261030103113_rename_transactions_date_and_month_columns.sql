ALTER TABLE public.transactions RENAME COLUMN transaction_date TO date;
ALTER TABLE public.transactions RENAME COLUMN accrual_month TO month;

CREATE OR REPLACE FUNCTION public.set_accrual_month()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.month is null then
    new.month := date_trunc('month', coalesce(new.date, now()) at time zone 'Europe/Rome')::date;
  else
    new.month := date_trunc('month', new.month)::date;
  end if;
  return new;
end;
$function$;

ALTER FUNCTION public.set_accrual_month() RENAME TO set_month;
ALTER TRIGGER set_accrual_month ON public.transactions RENAME TO set_month;
ALTER INDEX public.transactions_accrual_month_idx RENAME TO transactions_month_idx;

COMMENT ON COLUMN public.transactions.date IS 'Actual date of the transaction (may be missing for older transactions).';
COMMENT ON COLUMN public.transactions.month IS 'First day of the month the transaction belongs to; derived from date if empty.';
