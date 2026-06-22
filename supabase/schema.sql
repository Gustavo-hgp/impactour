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

-- ── Módulo Financeiro (Caixa Virtual) ───────────────────────────────────────

-- Configurações (um valor por chave). Chaves usadas pelo app:
--   caixa_atual  → dinheiro disponível hoje (em CLP)
--   taxa_usd     → quantos CLP vale 1 US$ (conversão de exibição)
--   taxa_brl     → quantos CLP vale 1 R$  (conversão de exibição)
create table if not exists config (
  chave          text primary key,
  valor          numeric(14,2) not null default 0,
  texto          text,
  atualizado_em  timestamptz not null default now()
);

-- Recebimentos futuros (entradas previstas no caixa), valores em CLP.
create table if not exists recebimentos (
  id          bigint generated always as identity primary key,
  data        date not null,
  valor       numeric(14,2) not null default 0 check (valor >= 0),
  moeda       text not null default 'CLP',
  tipo        text not null default 'recebido', -- 'recebido' (entrada) | 'pago' (saída)
  descricao   text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_recebimentos_data on recebimentos(data);

alter table config enable row level security;
alter table recebimentos enable row level security;

drop policy if exists "authenticated full access config" on config;
create policy "authenticated full access config" on config
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access recebimentos" on recebimentos;
create policy "authenticated full access recebimentos" on recebimentos
  for all to authenticated using (true) with check (true);

-- ── Parceiros (operação via terceiros) ──────────────────────────────────────
-- Quem presta o serviço (van / guia / van+guia), cada tipo com seu preço total
-- em pesos (CLP). Deixe nulo o tipo que o parceiro não faz.
create table if not exists parceiros (
  id             bigint generated always as identity primary key,
  nome           text not null,
  qtd_maxima     integer not null default 0 check (qtd_maxima >= 0),
  created_at     timestamptz not null default now()
);

-- Preço do parceiro POR PASSEIO (triangular: parceiro × passeio × valor).
create table if not exists parceiro_precos (
  id           bigint generated always as identity primary key,
  parceiro_id  bigint not null references parceiros(id) on delete cascade,
  passeio_id   bigint not null references passeios(id) on delete cascade,
  tipo_servico text not null,            -- 'van' | 'guia' | 'van_guia'
  valor        numeric(10,2) not null default 0,
  unique (parceiro_id, passeio_id, tipo_servico)
);

-- Para bancos que já criaram parceiros no modelo antigo (preço fixo van/guia):
alter table parceiros drop column if exists valor_van;
alter table parceiros drop column if exists valor_guia;
alter table parceiros drop column if exists valor_van_guia;

-- Vínculo OPCIONAL do lançamento com um parceiro + tipo de serviço. Sem parceiro,
-- o custo é o de referência (custo_pax). valor_servico = preço do parceiro gravado
-- no momento. A ECONOMIA (referência − valor_servico) aparece só no Financeiro;
-- o módulo de Operação continua usando o custo de referência.
alter table lancamentos add column if not exists parceiro_id   bigint references parceiros(id) on delete set null;
alter table lancamentos add column if not exists tipo_servico  text;
alter table lancamentos add column if not exists valor_servico numeric(10,2);
create index if not exists idx_lancamentos_parceiro on lancamentos(parceiro_id);

alter table parceiros enable row level security;
drop policy if exists "authenticated full access parceiros" on parceiros;
create policy "authenticated full access parceiros" on parceiros
  for all to authenticated using (true) with check (true);

alter table parceiro_precos enable row level security;
drop policy if exists "authenticated full access parceiro_precos" on parceiro_precos;
create policy "authenticated full access parceiro_precos" on parceiro_precos
  for all to authenticated using (true) with check (true);

-- ── Histórico estável (snapshots no lançamento) ─────────────────────────────
-- Gravamos no próprio lançamento o nome e o custo de referência do passeio (e o
-- nome do parceiro) no momento do lançamento. Assim, EDITAR o preço de um passeio
-- ou EXCLUIR um passeio/parceiro NÃO altera os lançamentos passados.
alter table lancamentos add column if not exists custo_pax_ref numeric(10,2);
alter table lancamentos add column if not exists passeio_nome  text;
alter table lancamentos add column if not exists parceiro_nome text;

-- Excluir um passeio não apaga mais o histórico: passeio_id vira nulo e o
-- lançamento (com o snapshot) permanece. Trocamos o ON DELETE CASCADE por SET NULL.
alter table lancamentos alter column passeio_id drop not null;
alter table lancamentos drop constraint if exists lancamentos_passeio_id_fkey;
alter table lancamentos add constraint lancamentos_passeio_id_fkey
  foreign key (passeio_id) references passeios(id) on delete set null;

-- Permite múltiplos lançamentos do mesmo passeio na mesma data (ex.: dois
-- parceiros diferentes no mesmo dia, com preços distintos).
alter table lancamentos drop constraint if exists lancamentos_passeio_id_data_key;

-- Backfill dos lançamentos já existentes (só onde o snapshot ainda está nulo).
update lancamentos l set custo_pax_ref = p.custo_pax, passeio_nome = p.nome
  from passeios p where l.passeio_id = p.id and l.custo_pax_ref is null;
update lancamentos l set parceiro_nome = pa.nome
  from parceiros pa where l.parceiro_id = pa.id and l.parceiro_nome is null;

-- ── Saldos do caixa (múltiplas contas / moedas) ─────────────────────────────
-- Substitui o caixa_atual único da tabela `config`. Cada saldo é uma entrada
-- independente (descrição + moeda + valor). O "caixa atual" exibido na app é a
-- SOMA convertida para CLP via taxas configuradas em `config` (taxa_usd/taxa_brl).
create table if not exists saldos_caixa (
  id          bigint generated always as identity primary key,
  descricao   text,
  valor       numeric(14,2) not null default 0 check (valor >= 0),
  moeda       text not null default 'CLP',
  created_at  timestamptz not null default now()
);

alter table saldos_caixa enable row level security;
drop policy if exists "authenticated full access saldos_caixa" on saldos_caixa;
create policy "authenticated full access saldos_caixa" on saldos_caixa
  for all to authenticated using (true) with check (true);

-- Backfill idempotente: migra o caixa_atual antigo só se a tabela estiver vazia.
do $$
begin
  if not exists (select 1 from saldos_caixa)
     and exists (select 1 from config where chave = 'caixa_atual' and valor > 0) then
    insert into saldos_caixa (descricao, valor, moeda)
    select 'Caixa inicial', valor, coalesce(texto, 'CLP')
    from config where chave = 'caixa_atual';
  end if;
end $$;
