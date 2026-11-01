-- eCondomínio: schema base multi-tenant (organização -> condomínio) com RLS.
-- Valores monetários sempre em centavos (bigint).

-- ---------------------------------------------------------------- enums
create type papel_organizacao as enum ('proprietario', 'admin', 'operador');
create type papel_condominio  as enum ('sindico', 'subsindico', 'financeiro', 'leitura');
create type tipo_conta        as enum ('receita', 'despesa');
create type status_cota       as enum ('aberta', 'paga', 'cancelada');
create type origem_pagamento  as enum ('manual', 'cnab', 'pix', 'boleto');
create type tipo_vinculo      as enum ('proprietario', 'morador');
create type status_repasse    as enum ('pendente', 'repassado', 'cancelado');

-- ---------------------------------------------------------------- tenant
create table organizacao (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  documento  text,
  criado_em  timestamptz not null default now()
);

create table membro_organizacao (
  organizacao_id uuid not null references organizacao(id) on delete cascade,
  usuario_id     uuid not null references auth.users(id) on delete cascade,
  papel          papel_organizacao not null default 'operador',
  primary key (organizacao_id, usuario_id)
);
create index on membro_organizacao (usuario_id);

create table condominio (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacao(id) on delete cascade,
  nome           text not null,
  cnpj           text,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now()
);
create index on condominio (organizacao_id);

create table membro_condominio (
  condominio_id uuid not null references condominio(id) on delete cascade,
  usuario_id    uuid not null references auth.users(id) on delete cascade,
  papel         papel_condominio not null default 'leitura',
  primary key (condominio_id, usuario_id)
);
create index on membro_condominio (usuario_id);

-- ---------------------------------------------------------------- estrutura
create table bloco (
  id            uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references condominio(id) on delete cascade,
  nome          text not null,
  unique (condominio_id, nome)
);

create table unidade (
  id            uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references condominio(id) on delete cascade,
  bloco_id      uuid references bloco(id) on delete set null,
  identificador text not null,
  fracao_ideal  numeric(10, 6),
  unique (condominio_id, bloco_id, identificador)
);
create index on unidade (condominio_id);

create table pessoa (
  id            uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references condominio(id) on delete cascade,
  nome          text not null,
  documento     text,
  email         text,
  telefone      text
);
create index on pessoa (condominio_id);

create table vinculo_unidade (
  id            uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references condominio(id) on delete cascade,
  unidade_id    uuid not null references unidade(id) on delete cascade,
  pessoa_id     uuid not null references pessoa(id) on delete cascade,
  tipo          tipo_vinculo not null,
  principal     boolean not null default false,
  unique (unidade_id, pessoa_id, tipo)
);
-- no máximo 1 responsável (acesso) por unidade
create unique index vinculo_principal_unico on vinculo_unidade (unidade_id) where principal;

-- ---------------------------------------------------------------- financeiro
create table conta_contabil (
  id            uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references condominio(id) on delete cascade,
  codigo        text not null,
  nome          text not null,
  tipo          tipo_conta not null,
  unique (condominio_id, codigo)
);

create table cota (
  id              uuid primary key default gen_random_uuid(),
  condominio_id   uuid not null references condominio(id) on delete cascade,
  unidade_id      uuid not null references unidade(id) on delete cascade,
  competencia     date not null check (competencia = date_trunc('month', competencia)::date),
  vencimento      date not null,
  valor_centavos  bigint not null check (valor_centavos > 0),
  status          status_cota not null default 'aberta',
  criado_em       timestamptz not null default now(),
  unique (unidade_id, competencia)
);
create index on cota (condominio_id, competencia);
create index on cota (condominio_id, status, vencimento);

-- Lançamentos e pagamentos são imutáveis: correção por estorno.
create table lancamento (
  id              uuid primary key default gen_random_uuid(),
  condominio_id   uuid not null references condominio(id) on delete cascade,
  conta_id        uuid not null references conta_contabil(id),
  data            date not null,
  valor_centavos  bigint not null check (valor_centavos > 0),
  descricao       text not null,
  estorno_de      uuid references lancamento(id),
  criado_por      uuid references auth.users(id) default auth.uid(),
  criado_em       timestamptz not null default now()
);
create index on lancamento (condominio_id, data);

create table pagamento (
  id              uuid primary key default gen_random_uuid(),
  condominio_id   uuid not null references condominio(id) on delete cascade,
  cota_id         uuid not null references cota(id),
  valor_centavos  bigint not null check (valor_centavos > 0),
  pago_em         date not null,
  origem          origem_pagamento not null,
  id_externo      text,
  estorno_de      uuid references pagamento(id),
  criado_por      uuid references auth.users(id) default auth.uid(),
  criado_em       timestamptz not null default now()
);
create index on pagamento (condominio_id, pago_em);
-- idempotência: o mesmo evento externo não baixa duas vezes
create unique index pagamento_idempotencia
  on pagamento (condominio_id, origem, id_externo) where id_externo is not null;

-- ---------------------------------------------------------------- garantidora
create table garantidora (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacao(id) on delete cascade,
  nome           text not null,
  documento      text
);
create index on garantidora (organizacao_id);

create table contrato_garantidora (
  id                    uuid primary key default gen_random_uuid(),
  condominio_id         uuid not null references condominio(id) on delete cascade,
  garantidora_id        uuid not null references garantidora(id),
  taxa_antecipacao_bps  integer not null default 0 check (taxa_antecipacao_bps >= 0), -- 100 bps = 1%
  prazo_repasse_dias    integer not null default 0 check (prazo_repasse_dias >= 0),
  vigencia_inicio       date not null,
  vigencia_fim          date,
  ativo                 boolean not null default true
);
create index on contrato_garantidora (condominio_id);

create table antecipacao (
  id                          uuid primary key default gen_random_uuid(),
  condominio_id               uuid not null references condominio(id) on delete cascade,
  contrato_id                 uuid not null references contrato_garantidora(id),
  cota_id                     uuid not null unique references cota(id),
  valor_antecipado_centavos   bigint not null check (valor_antecipado_centavos > 0),
  taxa_centavos               bigint not null default 0 check (taxa_centavos >= 0),
  antecipada_em               date not null
);
create index on antecipacao (condominio_id);

create table repasse (
  id              uuid primary key default gen_random_uuid(),
  condominio_id   uuid not null references condominio(id) on delete cascade,
  contrato_id     uuid not null references contrato_garantidora(id),
  pagamento_id    uuid not null unique references pagamento(id),
  valor_centavos  bigint not null check (valor_centavos > 0),
  previsto_para   date,
  repassado_em    date,
  status          status_repasse not null default 'pendente'
);
create index on repasse (condominio_id, status);

-- ---------------------------------------------------------------- auditoria
create table log_auditoria (
  id            bigint generated always as identity primary key,
  condominio_id uuid,
  usuario_id    uuid default auth.uid(),
  acao          text not null,
  tabela        text not null,
  registro_id   uuid,
  dados         jsonb,
  criado_em     timestamptz not null default now()
);
create index on log_auditoria (condominio_id, criado_em desc);

-- ---------------------------------------------------------------- funções
create function bloquear_alteracao() returns trigger
language plpgsql as $$
begin
  raise exception 'Registro financeiro imutável: use estorno.';
end $$;

create trigger lancamento_imutavel before update or delete on lancamento
  for each row execute function bloquear_alteracao();
create trigger pagamento_imutavel before update or delete on pagamento
  for each row execute function bloquear_alteracao();

create function auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  linha jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.log_auditoria (condominio_id, acao, tabela, registro_id, dados)
  values ((linha ->> 'condominio_id')::uuid, tg_op, tg_table_name, (linha ->> 'id')::uuid, linha);
  return coalesce(new, old);
end $$;

create trigger audit_cota        after insert or update or delete on cota                 for each row execute function auditar();
create trigger audit_lancamento  after insert                     on lancamento           for each row execute function auditar();
create trigger audit_pagamento   after insert                     on pagamento            for each row execute function auditar();
create trigger audit_contrato    after insert or update or delete on contrato_garantidora for each row execute function auditar();
create trigger audit_antecipacao after insert or update or delete on antecipacao          for each row execute function auditar();
create trigger audit_repasse     after insert or update or delete on repasse              for each row execute function auditar();

-- Helpers de autorização (security definer evita recursão de RLS)
create function eh_membro_organizacao(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membro_organizacao
    where organizacao_id = org and usuario_id = auth.uid()
  );
$$;

create function eh_admin_organizacao(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membro_organizacao
    where organizacao_id = org and usuario_id = auth.uid()
      and papel in ('proprietario', 'admin')
  );
$$;

create function pode_ler_condominio(cond uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.condominio c
    join public.membro_organizacao mo on mo.organizacao_id = c.organizacao_id
    where c.id = cond and mo.usuario_id = auth.uid()
  ) or exists (
    select 1 from public.membro_condominio mc
    where mc.condominio_id = cond and mc.usuario_id = auth.uid()
  );
$$;

create function pode_escrever_condominio(cond uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.condominio c
    join public.membro_organizacao mo on mo.organizacao_id = c.organizacao_id
    where c.id = cond and mo.usuario_id = auth.uid()
      and mo.papel in ('proprietario', 'admin', 'operador')
  ) or exists (
    select 1 from public.membro_condominio mc
    where mc.condominio_id = cond and mc.usuario_id = auth.uid()
      and mc.papel in ('sindico', 'subsindico', 'financeiro')
  );
$$;

-- Cria a organização e torna o usuário atual proprietário.
create function criar_organizacao(p_nome text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  insert into public.organizacao (nome) values (p_nome) returning id into org;
  insert into public.membro_organizacao (organizacao_id, usuario_id, papel)
  values (org, auth.uid(), 'proprietario');
  return org;
end $$;

revoke all on function eh_membro_organizacao(uuid), eh_admin_organizacao(uuid),
  pode_ler_condominio(uuid), pode_escrever_condominio(uuid), criar_organizacao(text)
  from public;
grant execute on function eh_membro_organizacao(uuid), eh_admin_organizacao(uuid),
  pode_ler_condominio(uuid), pode_escrever_condominio(uuid), criar_organizacao(text)
  to authenticated;

-- ---------------------------------------------------------------- RLS
alter table organizacao          enable row level security;
alter table membro_organizacao   enable row level security;
alter table condominio           enable row level security;
alter table membro_condominio    enable row level security;
alter table garantidora          enable row level security;
alter table log_auditoria        enable row level security;

create policy organizacao_select on organizacao for select
  using (eh_membro_organizacao(id));
create policy organizacao_update on organizacao for update
  using (eh_admin_organizacao(id)) with check (eh_admin_organizacao(id));

create policy membro_org_select on membro_organizacao for select
  using (eh_membro_organizacao(organizacao_id));
create policy membro_org_admin on membro_organizacao for all
  using (eh_admin_organizacao(organizacao_id)) with check (eh_admin_organizacao(organizacao_id));

create policy condominio_select on condominio for select
  using (pode_ler_condominio(id));
create policy condominio_admin on condominio for all
  using (eh_admin_organizacao(organizacao_id)) with check (eh_admin_organizacao(organizacao_id));

create policy membro_cond_select on membro_condominio for select
  using (pode_ler_condominio(condominio_id));
create policy membro_cond_admin on membro_condominio for all
  using (pode_escrever_condominio(condominio_id)) with check (pode_escrever_condominio(condominio_id));

create policy garantidora_select on garantidora for select
  using (eh_membro_organizacao(organizacao_id));
create policy garantidora_admin on garantidora for all
  using (eh_admin_organizacao(organizacao_id)) with check (eh_admin_organizacao(organizacao_id));

create policy auditoria_select on log_auditoria for select
  using (condominio_id is not null and pode_ler_condominio(condominio_id));

-- Tabelas com condominio_id: leitura para quem acessa, escrita para quem pode escrever.
do $$
declare
  t text;
begin
  foreach t in array array[
    'bloco', 'unidade', 'pessoa', 'vinculo_unidade', 'conta_contabil', 'cota',
    'contrato_garantidora', 'antecipacao', 'repasse'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (pode_ler_condominio(condominio_id))',
                   t || '_select', t);
    execute format('create policy %I on %I for all using (pode_escrever_condominio(condominio_id)) with check (pode_escrever_condominio(condominio_id))',
                   t || '_escrita', t);
  end loop;

  -- imutáveis: apenas select e insert
  foreach t in array array['lancamento', 'pagamento'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (pode_ler_condominio(condominio_id))',
                   t || '_select', t);
    execute format('create policy %I on %I for insert with check (pode_escrever_condominio(condominio_id))',
                   t || '_insert', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- views
create view vw_cotas_em_atraso with (security_invoker = true) as
select c.id, c.condominio_id, c.unidade_id, c.competencia, c.vencimento, c.valor_centavos,
       (current_date - c.vencimento) as dias_atraso
from cota c
where c.status = 'aberta' and c.vencimento < current_date;
