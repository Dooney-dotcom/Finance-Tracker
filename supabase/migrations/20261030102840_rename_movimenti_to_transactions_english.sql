-- 1. Table and columns
ALTER TABLE public.movimenti RENAME TO transactions;
ALTER TABLE public.transactions RENAME COLUMN descrizione TO description;
ALTER TABLE public.transactions RENAME COLUMN importo TO amount;
ALTER TABLE public.transactions RENAME COLUMN tipo TO type;
ALTER TABLE public.transactions RENAME COLUMN categoria TO category;
ALTER TABLE public.transactions RENAME COLUMN metodo TO payment_method;
ALTER TABLE public.transactions RENAME COLUMN data TO transaction_date;
ALTER TABLE public.transactions RENAME COLUMN mese_competenza TO accrual_month;
ALTER TABLE public.transactions RENAME COLUMN evitabile TO avoidable;
ALTER TABLE public.transactions RENAME COLUMN perche TO reason;
ALTER TABLE public.transactions RENAME COLUMN note TO notes;

-- 2. Enum types
ALTER TYPE public.tipo_movimento RENAME TO transaction_type;
ALTER TYPE public.categoria RENAME TO expense_category;
ALTER TYPE public.metodo_pagamento RENAME TO payment_method;
ALTER TYPE public.evitabile RENAME TO avoidable_level;
ALTER TYPE public.motivo RENAME TO spending_reason;

-- 3. Enum values
ALTER TYPE public.transaction_type RENAME VALUE 'Uscita' TO 'Expense';
ALTER TYPE public.transaction_type RENAME VALUE 'Entrata' TO 'Income';

ALTER TYPE public.expense_category RENAME VALUE 'Casa' TO 'Home';
ALTER TYPE public.expense_category RENAME VALUE 'Assicurazione' TO 'Insurance';
ALTER TYPE public.expense_category RENAME VALUE 'Abbonamenti' TO 'Subscriptions';
ALTER TYPE public.expense_category RENAME VALUE 'Viaggi' TO 'Travel';
ALTER TYPE public.expense_category RENAME VALUE 'Tasse / Bollette' TO 'Taxes / Bills';
ALTER TYPE public.expense_category RENAME VALUE 'Trasporti' TO 'Transport';
ALTER TYPE public.expense_category RENAME VALUE 'Cibo / Spesa' TO 'Food / Groceries';
ALTER TYPE public.expense_category RENAME VALUE 'Ristorante / Asporto' TO 'Restaurants / Takeaway';
ALTER TYPE public.expense_category RENAME VALUE 'Sport' TO 'Sports';
ALTER TYPE public.expense_category RENAME VALUE 'Università' TO 'University';
ALTER TYPE public.expense_category RENAME VALUE 'Altro' TO 'Other';
ALTER TYPE public.expense_category RENAME VALUE 'Salute' TO 'Health';
ALTER TYPE public.expense_category RENAME VALUE 'Abbigliamento' TO 'Clothing';
ALTER TYPE public.expense_category RENAME VALUE 'Tempo Libero' TO 'Leisure';
ALTER TYPE public.expense_category RENAME VALUE 'Svago' TO 'Entertainment';
ALTER TYPE public.expense_category RENAME VALUE 'Lavoro' TO 'Work';

ALTER TYPE public.payment_method RENAME VALUE 'Contanti' TO 'Cash';

ALTER TYPE public.avoidable_level RENAME VALUE 'Sì' TO 'Yes';
ALTER TYPE public.avoidable_level RENAME VALUE 'In parte' TO 'Partly';

ALTER TYPE public.spending_reason RENAME VALUE 'Impulso' TO 'Impulse';
ALTER TYPE public.spending_reason RENAME VALUE 'Noia' TO 'Boredom';
ALTER TYPE public.spending_reason RENAME VALUE 'Sconto' TO 'Discount';
ALTER TYPE public.spending_reason RENAME VALUE 'Comodità' TO 'Convenience';
ALTER TYPE public.spending_reason RENAME VALUE 'Abitudine' TO 'Habit';

-- 4. Trigger function and trigger (rewritten for the new column names)
CREATE OR REPLACE FUNCTION public.set_accrual_month()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.accrual_month is null then
    new.accrual_month := date_trunc('month', coalesce(new.transaction_date, now()) at time zone 'Europe/Rome')::date;
  else
    new.accrual_month := date_trunc('month', new.accrual_month)::date;
  end if;
  return new;
end;
$function$;

DROP TRIGGER movimenti_mese ON public.transactions;
CREATE TRIGGER set_accrual_month
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_accrual_month();
DROP FUNCTION public.movimenti_imposta_mese();

-- 5. Constraints and indexes
ALTER TABLE public.transactions RENAME CONSTRAINT movimenti_pkey TO transactions_pkey;
ALTER TABLE public.transactions RENAME CONSTRAINT movimenti_notion_id_key TO transactions_notion_id_key;
ALTER TABLE public.transactions RENAME CONSTRAINT movimenti_importo_check TO transactions_amount_check;
ALTER INDEX public.movimenti_mese_idx RENAME TO transactions_accrual_month_idx;

-- 6. Comments
COMMENT ON TABLE public.transactions IS 'Personal income and expenses (migrated from the Notion Finance Tracker).';
COMMENT ON COLUMN public.transactions.transaction_date IS 'Actual date of the transaction (may be missing for older transactions).';
COMMENT ON COLUMN public.transactions.accrual_month IS 'First day of the month the transaction belongs to; derived from transaction_date if empty.';
