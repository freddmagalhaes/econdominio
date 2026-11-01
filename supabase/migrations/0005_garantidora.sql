-- Módulo garantidora.
-- Modelo: a garantidora antecipa ao condomínio o valor da cota menos a taxa
-- (antecipacao.valor_antecipado_centavos + antecipacao.taxa_centavos = valor da cota).
-- Quando o condômino paga a cota, o valor pago pertence à garantidora e vira um repasse pendente,
-- com previsão = data do pagamento + prazo do contrato.

-- Antecipa todas as cotas abertas (sem pagamento e ainda não antecipadas) de uma competência.
create function antecipar_competencia(
  p_contrato uuid, p_competencia date, p_data date
) returns integer
language plpgsql set search_path = '' as $$
declare
  k public.contrato_garantidora;
  n integer;
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
  )
  insert into public.antecipacao
    (condominio_id, contrato_id, cota_id, valor_antecipado_centavos, taxa_centavos, antecipada_em)
  select condominio_id, k.id, id, valor_centavos - taxa, taxa, p_data
  from alvo
  where taxa < valor_centavos
  on conflict (cota_id) do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

-- Marca um repasse pendente como repassado à garantidora.
create function registrar_repasse(p_repasse uuid, p_data date) returns void
language plpgsql set search_path = '' as $$
declare
  r public.repasse;
begin
  select * into r from public.repasse where id = p_repasse for update;
  if not found then
    raise exception 'Repasse não encontrado';
  end if;
  if not public.pode_escrever_condominio(r.condominio_id) then
    raise exception 'Sem permissão neste condomínio';
  end if;
  if r.status <> 'pendente' then
    raise exception 'Repasse não está pendente';
  end if;
  update public.repasse set status = 'repassado', repassado_em = p_data where id = r.id;
end $$;

-- registrar_pagamento: agora gera o repasse quando a cota foi antecipada.
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
    insert into public.repasse (condominio_id, contrato_id, pagamento_id, valor_centavos, previsto_para)
    values (c.condominio_id, v_contr, pid, p_valor_centavos, p_pago_em + v_prazo);
  end if;

  if pago + p_valor_centavos = c.valor_centavos then
    update public.cota set status = 'paga' where id = c.id;
  end if;

  return pid;
end $$;

-- estornar_ultimo_pagamento: cancela o repasse pendente; bloqueia se já foi repassado.
create or replace function estornar_ultimo_pagamento(p_cota uuid) returns uuid
language plpgsql set search_path = '' as $$
declare
  c   public.cota;
  p   public.pagamento;
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

  update public.repasse set status = 'cancelado' where pagamento_id = p.id and status = 'pendente';
  update public.cota set status = 'aberta' where id = c.id and status = 'paga';
  return eid;
end $$;

-- Saldo por contrato.
create view vw_garantidora_saldo with (security_invoker = true) as
select k.id as contrato_id, k.condominio_id, k.garantidora_id,
       coalesce(a.antecipado, 0)::bigint as antecipado_centavos,
       coalesce(a.taxa, 0)::bigint as taxa_centavos,
       (coalesce(a.antecipado, 0) + coalesce(a.taxa, 0))::bigint as total_cotas_centavos,
       coalesce(r.recebido, 0)::bigint as recebido_centavos,
       coalesce(r.repassado, 0)::bigint as repassado_centavos,
       coalesce(r.pendente, 0)::bigint as a_repassar_centavos,
       (coalesce(a.antecipado, 0) + coalesce(a.taxa, 0) - coalesce(r.recebido, 0))::bigint
         as em_aberto_centavos
from contrato_garantidora k
left join lateral (
  select sum(valor_antecipado_centavos) as antecipado, sum(taxa_centavos) as taxa
  from antecipacao where contrato_id = k.id
) a on true
left join lateral (
  select sum(valor_centavos) filter (where status <> 'cancelado') as recebido,
         sum(valor_centavos) filter (where status = 'repassado') as repassado,
         sum(valor_centavos) filter (where status = 'pendente') as pendente
  from repasse where contrato_id = k.id
) r on true;

revoke all on function antecipar_competencia(uuid, date, date), registrar_repasse(uuid, date)
  from public, anon;
grant execute on function antecipar_competencia(uuid, date, date), registrar_repasse(uuid, date)
  to authenticated;
