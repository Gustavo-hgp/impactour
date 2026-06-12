-- Impactour — schema do Supabase
-- Rode isto no SQL Editor do seu projeto Supabase.

create table if not exists passeios (
  id              bigint generated always as identity primary key,
  nome            text not null,
  custo_pax       numeric(10,2) not null default 0,
  preco_venda_pax numeric(10,2) not null default 0,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists lancamentos (
  id          bigint generated always as identity primary key,
  passeio_id  bigint not null references passeios(id) on delete cascade,
  data        date not null,
  quantidade  integer not null default 0 check (quantidade >= 0),
  created_at  timestamptz not null default now(),
  unique (passeio_id, data)
);

create index if not exists idx_lancamentos_data on lancamentos(data);
create index if not exists idx_lancamentos_passeio on lancamentos(passeio_id);

-- Acesso restrito a usuários autenticados (Supabase Auth). A role anon (chave
-- pública embutida no navegador) NÃO tem acesso aos dados — é obrigatório fazer
-- login. Crie o usuário no painel: Authentication > Users > Add user (marque
-- "Auto Confirm User") e DESATIVE o cadastro público em Authentication >
-- Sign In / Providers > "Allow new users to sign up".
alter table passeios enable row level security;
alter table lancamentos enable row level security;

-- Remove a policy antiga aberta (caso o schema já tenha sido aplicado antes).
drop policy if exists "anon full access passeios" on passeios;
drop policy if exists "authenticated full access passeios" on passeios;
create policy "authenticated full access passeios" on passeios
  for all to authenticated using (true) with check (true);

drop policy if exists "anon full access lancamentos" on lancamentos;
drop policy if exists "authenticated full access lancamentos" on lancamentos;
create policy "authenticated full access lancamentos" on lancamentos
  for all to authenticated using (true) with check (true);
