-- Balancete: plano de contas padrão, lançamentos automáticos de receita e visão mensal.
--
-- Regime de caixa, do ponto de vista do condomínio:
--  * cota paga pelo condômino SEM antecipação  -> receita no pagamento;
--  * cota ANTECIPADA pela garantidora          -> receita (valor total da cota) e despesa (taxa)
--    na data da antecipação; o pagamento do condômino depois NÃO gera nova receita
--    (o dinheiro segue para a garantidora como repasse).
--  * estornos geram lançamentos de estorno (nunca se altera ou apaga um lançamento).

-- Esta migration não faz backfill: só pode rodar antes de existirem pagamentos/antecipações.
do $$
begin
  if exists (select 1 from pagamento) or exists (select 1 from antecipacao) then
    raise exception 'Existem pagamentos ou antecipações: é necessário um backfill de lançamentos antes desta migration';
  end if;
end $$;

-- ---------------------------------------------------------------- plano de contas
alter table conta_contabil add column sistema text;
create unique index conta_sistema_unica on conta_contabil (condominio_id, sistema) where sistema is not null;

create function proteger_conta_sistema() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.sistema is not null then
      raise exception 'Conta do sistema não pode ser removida';
    end if;
    return old;
  end if;
  if old.sistema is distinct from new.sistema or (old.sistema is not null and old.tipo <> new.tipo) then
    raise exception 'Conta do sistema não pode mudar de tipo nem de função';
  end if;
  return new;
end $$;

create trigger conta_sistema_protegida before update or delete on conta_contabil
  for each row execute function proteger_conta_sistema();

create function criar_plano_contas_padrao(p_condominio uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.conta_contabil (condominio_id, codigo, nome, tipo, sistema) values
    (p_condominio, '1.01', 'Taxa condominial ordinária', 'receita', 'receita_cota'),
    (p_condominio, '1.02', 'Fundo de reserva',           'receita', null),
    (p_condominio, '1.03', 'Multas e juros',             'receita', null),
    (p_condominio, '1.04', 'Outras receitas',            'receita', null),
    (p_condominio, '2.01', 'Pessoal e encargos',         'despesa', null),
    (p_condominio, '2.02', 'Água e esgoto',              'despesa', null),
    (p_condominio, '2.03', 'Energia elétrica',           'despesa', null),
    (p_condominio, '2.04', 'Manutenção e reparos',       'despesa', null),
    (p_condominio, '2.05', 'Limpeza e conservação',      'despesa', null),
    (p_condominio, '2.06', 'Administração',              'despesa', null),
    (p_condominio, '2.07', 'Seguros',                    'despesa', null),
    (p_condominio, '2.08', 'Tarifas bancárias',          'despesa', null),
    (p_condominio, '2.09', 'Outras despesas',            'despesa', null),
    (p_condominio, '2.10', 'Taxa de antecipação (garantidora)', 'despesa', 'taxa_antecipacao')
  on conflict do nothing;
$$;
revoke all on function criar_plano_contas_padrao(uuid) from public, anon, authenticated;

create function trg_plano_contas_padrao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.criar_plano_contas_padrao(new.id);
  return new;
end $$;

create trigger condominio_plano_contas after insert on condominio
  for each row execute function trg_plano_contas_padrao();

-- Condomínios já existentes.
select criar_plano_contas_padrao(id) from condominio;

-- ---------------------------------------------------------------- vínculo dos lançamentos automáticos
alter table lancamento
  add column pagamento_id   uuid unique references pagamento(id),
  add column antecipacao_id uuid references antecipacao(id);
create unique index lancamento_antecipacao_conta on lancamento (antecipacao_id, conta_id)
  where antecipacao_id is not null;
create unique index lancamento_estorno_unico on lancamento (estorno_de) where estorno_de is not null;

-- A conta do lançamento precisa pertencer ao mesmo condomínio.
create function valida_conta_do_condominio() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.conta_contabil where id = new.conta_id and condominio_id = new.condominio_id
  ) then
    raise exception 'Conta contábil não pertence a este condomínio';
  end if;
  return new;
end $$;

create trigger lancamento_conta_valida before insert on lancamento
  for each row execute function valida_conta_do_condominio();

-- ---------------------------------------------------------------- registrar_pagamento (com receita)
create or replace function registrar_pagamento(
  p_cota uuid, p_valor_centavos bigint, p_pago_em date,
  p_origem origem_pagamento default 'manual', p_id_externo text default null
) returns uuid
language plpgsql set search_path = '' as $$
declare
  c        public.cota;
  pago     bigint;
  pid      uuid;
  v_contr  uuid;
  v_prazo  integer;
  v_conta  uuid;
  v_unid   text;
begin
  select * into c from public.cota where id = p_cota for update;
  if not found then
    raise exception 'Cota não encontrada';
  end if;
  if not public.pode_escrever_condominio(c.condominio_id) then
    raise exception 'Sem permissão neste condomínio';
  end if;

  if p_id_externo is not null then
    select id into pid from public.pagamento
      where condominio_id = c.condominio_id and origem = p_origem and id_externo = p_id_externo;
    if found then
      return pid;
    end if;
  end if;

  if c.status = 'cancelada' then
    raise exception 'Cota cancelada';
  end if;
  if p_valor_centavos is null or p_valor_centavos <= 0 then
    raise exception 'Valor do pagamento deve ser maior que zero';
  end if;

  select coalesce(sum(case when estorno_de is null then valor_centavos else -valor_centavos end), 0)
    into pago from public.pagamento where cota_id = c.id;

  if pago + p_valor_centavos > c.valor_centavos then
    raise exception 'Pagamento excede o valor da cota';
  end if;

  insert into public.pagamento (condominio_id, cota_id, valor_centavos, pago_em, origem, id_externo)
  values (c.condominio_id, c.id, p_valor_centavos, p_pago_em, p_origem, p_id_externo)
  returning id into pid;

  select a.contrato_id, k.prazo_repasse_dias into v_contr, v_prazo
    from public.antecipacao a
    join public.contrato_garantidora k on k.id = a.contrato_id
    where a.cota_id = c.id;
  if found then
    -- Cota antecipada: o dinheiro é da garantidora (repasse); a receita já foi lançada na antecipação.
    insert into public.repasse (condominio_id, contrato_id, pagamento_id, valor_centavos, previsto_para)
    values (c.condominio_id, v_contr, pid, p_valor_centavos, p_pago_em + v_prazo);
  else
    select id into v_conta from public.conta_contabil
      where condominio_id = c.condominio_id and sistema = 'receita_cota';
    if v_conta is null then
      raise exception 'Plano de contas sem a conta de receita de cotas';
    end if;
    select identificador into v_unid from public.unidade where id = c.unidade_id;
    insert into public.lancamento (condominio_id, conta_id, data, valor_centavos, descricao, pagamento_id)
    values (c.condominio_id, v_conta, p_pago_em, p_valor_centavos,
            'Cota ' || v_unid || ' - ' || to_char(c.competencia, 'MM/YYYY'), pid);
  end if;

  if pago + p_valor_centavos = c.valor_centavos then
    update public.cota set status = 'paga' where id = c.id;
  end if;

  return pid;
end $$;

-- ---------------------------------------------------------------- estornar_ultimo_pagamento (com estorno da receita)
create or replace function estornar_ultimo_pagamento(p_cota uuid) returns uuid
language plpgsql set search_path = '' as $$
declare
  c   public.cota;
  p   public.pagamento;
  l   public.lancamento;
  eid uuid;
begin
  select * into c from public.cota where id = p_cota for update;
  if not found then
    raise exception 'Cota não encontrada';
  end if;
  if not public.pode_escrever_condominio(c.condominio_id) then
    raise exception 'Sem permissão neste condomínio';
  end if;

  select * into p from public.pagamento pg
    where pg.cota_id = c.id and pg.estorno_de is null
      and not exists (select 1 from public.pagamento e where e.estorno_de = pg.id)
    order by pg.criado_em desc, pg.id desc
    limit 1;
  if not found then
    raise exception 'Não há pagamento para estornar';
  end if;

  if exists (select 1 from public.repasse where pagamento_id = p.id and status = 'repassado') then
    raise exception 'Repasse já efetuado à garantidora: acerte com a garantidora antes de estornar';
  end if;

  insert into public.pagamento (condominio_id, cota_id, valor_centavos, pago_em, origem, estorno_de)
  values (c.condominio_id, c.id, p.valor_centavos,
          (now() at time zone 'America/Sao_Paulo')::date, p.origem, p.id)
  returning id into eid;

  select * into l from public.lancamento where pagamento_id = p.id;
  if found then
    insert into public.lancamento (condominio_id, conta_id, data, valor_centavos, descricao, estorno_de, pagamento_id)
    values (c.condominio_id, l.conta_id, (now() at time zone 'America/Sao_Paulo')::date,
            l.valor_centavos, 'Estorno: ' || l.descricao, l.id, eid);
  end if;

  update public.repasse set status = 'cancelado' where pagamento_id = p.id and status = 'pendente';
  update public.cota set status = 'aberta' where id = c.id and status = 'paga';
  return eid;
end $$;

-- ---------------------------------------------------------------- antecipar_competencia (com receita e taxa)
create or replace function antecipar_competencia(
  p_contrato uuid, p_competencia date, p_data date
) returns integer
language plpgsql set search_path = '' as $$
declare
  k       public.contrato_garantidora;
  v_rec   uuid;
  v_taxa  uuid;
  v_n     integer;
begin
  select * into k from public.contrato_garantidora where id = p_contrato;
  if not found then
    raise exception 'Contrato não encontrado';
  end if;
  if not public.pode_escrever_condominio(k.condominio_id) then
    raise exception 'Sem permissão neste condomínio';
  end if;
  if not k.ativo or p_data < k.vigencia_inicio or (k.vigencia_fim is not null and p_data > k.vigencia_fim) then
    raise exception 'Contrato inativo ou fora da vigência na data informada';
  end if;

  select id into v_rec from public.conta_contabil
    where condominio_id = k.condominio_id and sistema = 'receita_cota';
  select id into v_taxa from public.conta_contabil
    where condominio_id = k.condominio_id and sistema = 'taxa_antecipacao';
  if v_rec is null or v_taxa is null then
    raise exception 'Plano de contas incompleto (receita de cotas / taxa de antecipação)';
  end if;

  with alvo as (
    select c.id, c.condominio_id, c.valor_centavos,
           round(c.valor_centavos * k.taxa_antecipacao_bps / 10000.0)::bigint as taxa
    from public.cota c
    where c.condominio_id = k.condominio_id
      and c.competencia = date_trunc('month', p_competencia)::date
      and c.status = 'aberta'
      and not exists (select 1 from public.antecipacao a where a.cota_id = c.id)
      and not exists (select 1 from public.pagamento p where p.cota_id = c.id)
    for update of c
  ),
  nova as (
    insert into public.antecipacao
      (condominio_id, contrato_id, cota_id, valor_antecipado_centavos, taxa_centavos, antecipada_em)
    select condominio_id, k.id, id, valor_centavos - taxa, taxa, p_data
    from alvo
    where taxa < valor_centavos
    on conflict (cota_id) do nothing
    returning id, condominio_id, cota_id, valor_antecipado_centavos, taxa_centavos
  ),
  receita as (
    insert into public.lancamento (condominio_id, conta_id, data, valor_centavos, descricao, antecipacao_id)
    select n.condominio_id, v_rec, p_data, n.valor_antecipado_centavos + n.taxa_centavos,
           'Cota antecipada ' || u.identificador || ' - ' || to_char(c.competencia, 'MM/YYYY'), n.id
    from nova n
    join public.cota c on c.id = n.cota_id
    join public.unidade u on u.id = c.unidade_id
    returning 1
  ),
  taxa as (
    insert into public.lancamento (condominio_id, conta_id, data, valor_centavos, descricao, antecipacao_id)
    select n.condominio_id, v_taxa, p_data, n.taxa_centavos,
           'Taxa de antecipação ' || u.identificador || ' - ' || to_char(c.competencia, 'MM/YYYY'), n.id
    from nova n
    join public.cota c on c.id = n.cota_id
    join public.unidade u on u.id = c.unidade_id
    where n.taxa_centavos > 0
    returning 1
  )
  select count(*) into v_n from nova;

  return v_n;
end $$;

-- ---------------------------------------------------------------- lançamentos manuais e estorno
create function estornar_lancamento(p_lancamento uuid) returns uuid
language plpgsql set search_path = '' as $$
declare
  l   public.lancamento;
  eid uuid;
begin
  select * into l from public.lancamento where id = p_lancamento;
  if not found then
    raise exception 'Lançamento não encontrado';
  end if;
  if not public.pode_escrever_condominio(l.condominio_id) then
    raise exception 'Sem permissão neste condomínio';
  end if;
  if l.pagamento_id is not null or l.antecipacao_id is not null then
    raise exception 'Lançamento automático: estorne pela cota ou pela antecipação';
  end if;
  if l.estorno_de is not null then
    raise exception 'Este lançamento já é um estorno';
  end if;
  if exists (select 1 from public.lancamento where estorno_de = l.id) then
    raise exception 'Lançamento já estornado';
  end if;

  insert into public.lancamento (condominio_id, conta_id, data, valor_centavos, descricao, estorno_de)
  values (l.condominio_id, l.conta_id, (now() at time zone 'America/Sao_Paulo')::date,
          l.valor_centavos, 'Estorno: ' || l.descricao, l.id)
  returning id into eid;
  return eid;
end $$;

revoke all on function estornar_lancamento(uuid) from public, anon;
grant execute on function estornar_lancamento(uuid) to authenticated;

-- ---------------------------------------------------------------- visão do balancete
-- Total líquido (lançamentos menos estornos) por conta e mês.
create view vw_balancete_mensal with (security_invoker = true) as
select l.condominio_id,
       date_trunc('month', l.data)::date as competencia,
       c.id as conta_id, c.codigo, c.nome, c.tipo,
       sum(case when l.estorno_de is null then l.valor_centavos else -l.valor_centavos end)::bigint
         as total_centavos
from lancamento l
join conta_contabil c on c.id = l.conta_id
group by l.condominio_id, date_trunc('month', l.data), c.id, c.codigo, c.nome, c.tipo;
