ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_no_duplicates
  UNIQUE (amount, date, payment_method, type);

COMMENT ON CONSTRAINT transactions_no_duplicates ON public.transactions
  IS 'Prevents inserting the same transaction twice (same amount, date, payment method and type). Rows with a NULL date or payment method are not checked.';
