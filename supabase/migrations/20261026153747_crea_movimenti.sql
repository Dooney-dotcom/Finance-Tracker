create type public.tipo_movimento as enum ('Uscita', 'Entrata');
create type public.categoria as enum ('Casa', 'Assicurazione', 'Abbonamenti', 'Viaggi', 'Tasse / Bollette', 'Trasporti', 'Shopping', 'Cibo / Spesa', 'Ristorante / Asporto', 'Sport', 'Università', 'Altro', 'Salute', 'Abbigliamento', 'Tempo Libero', 'Svago', 'Lavoro');
create type public.metodo_pagamento as enum ('Unicredit', 'Paypal', 'IsyBank', 'Revolut', 'Contanti');
create type public.evitabile as enum ('Sì', 'In parte', 'No');
create type public.motivo as enum ('Impulso', 'Noia', 'Stress', 'Social / FOMO', 'Sconto', 'Comodità', 'Abitudine');

create table public.movimenti (
  id uuid primary key default gen_random_uuid(),
  descrizione text not null default '',
  importo numeric(10,2) not null check (importo >= 0),
  tipo public.tipo_movimento not null default 'Uscita',
  categoria public.categoria,
  metodo public.metodo_pagamento,
  data timestamptz,
  mese_competenza date not null,
  evitabile public.evitabile,
  perche public.motivo,
  note text,
  notion_id text unique,
  created_at timestamptz not null default now()
);

comment on table public.movimenti is 'Entrate e uscite personali (migrate dal Finance Tracker di Notion).';
comment on column public.movimenti.data is 'Data effettiva del movimento (può mancare per i movimenti vecchi).';
comment on column public.movimenti.mese_competenza is 'Primo giorno del mese a cui il movimento appartiene; se vuoto viene ricavato da data.';

create or replace function public.movimenti_imposta_mese()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.mese_competenza is null then
    new.mese_competenza := date_trunc('month', coalesce(new.data, now()) at time zone 'Europe/Rome')::date;
  else
    new.mese_competenza := date_trunc('month', new.mese_competenza)::date;
  end if;
  return new;
end;
$$;

create trigger movimenti_mese before insert or update on public.movimenti
for each row execute function public.movimenti_imposta_mese();

create index movimenti_mese_idx on public.movimenti (mese_competenza);

alter table public.movimenti enable row level security;
