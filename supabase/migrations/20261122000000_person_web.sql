-- Osoba může mít vlastní web (lidé z jedné firmy mívají každý jiný).
alter table public.persons add column if not exists web text;
