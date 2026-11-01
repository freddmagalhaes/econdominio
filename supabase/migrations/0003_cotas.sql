-- Cotas: geração mensal, baixa (total ou parcial) e estorno.
-- Funções rodam como o chamador (security invoker): o RLS continua valendo.

-- Valor líquido pago por cota (pagamentos menos estornos) + dados da unidade.
create view vw_cotas_situacao with (security_invoker = true) as
select c.id, c.condominio_id, c.unidade_id, c.competencia, c.vencimento,
       c.valor_centavos, c.status,
       u.identificador as unidade, b.nome as bloco,
       coalesce(sum(case when p.estorno_de is null then p.valor_centavos else -p.valor_centavos end), 0)::bigint
         as valor_pago_centavos
from cota c
join unidade u on u.id = c.unidade_id
left join bloco b on b.id = u.bloco_id
left join pagamento p on p.cota_id = c.id
group by c.id, u.identificador, b.nome;

-- Gera a cota do mês para todas as unidades. Idempotente: não duplica nem altera existentes.
create function gerar_cotas(
  p_condominio uuid, p_competencia date, p_vencimento date, p_valor_centavos bigint
) returns integer
language plpgsql set search_path = '' as $$
declare
  n integer;
begin
  if not public.pode_escrever_condominio(p_condominio) then
    raise exception 'Sem permissão neste condomínio';
  end if;
  if p_valor_centavos is null or p_valor_centavos <= 0 then
    raise exception 'Valor da cota deve ser maior que zero';
  end if;

  insert into public.cota (condominio_id, unidade_id, competencia, vencimento, valor_centavos)
  select p_condominio, u.id, date_trunc('month', p_competencia)::date, p_vencimento, p_valor_centavos
  from public.unidade u
  where u.condominio_id = p_condominio
  on conflict (unidade_id, competencia) do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

-- Registra pagamento (manual por padrão). Idempotente quando p_id_externo é informado.
create function registrar_pagamento(
  p_cota uuid, p_valor_centavos bigint, p_pago_em date,
  p_origem origem_pagamento default 'manual', p_id_externo text default null
) returns uuid
language plpgsql set search_path = '' as $$
declare
  c    public.cota;
  pago bigint;
  pid  uuid;
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

  if pago + p_valor_centavos = c.valor_centavos then
    update public.cota set status = 'paga' where id = c.id;
  end if;

  return pid;
end $$;

-- Estorna o último pagamento ainda não estornado da cota (cria registro de estorno).
create function estornar_ultimo_pagamento(p_cota uuid) returns uuid
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

  insert into public.pagamento (condominio_id, cota_id, valor_centavos, pago_em, origem, estorno_de)
  values (c.condominio_id, c.id, p.valor_centavos,
          (now() at time zone 'America/Sao_Paulo')::date, p.origem, p.id)
  returning id into eid;

  update public.cota set status = 'aberta' where id = c.id and status = 'paga';
  return eid;
end $$;

revoke all on function gerar_cotas(uuid, date, date, bigint),
  registrar_pagamento(uuid, bigint, date, origem_pagamento, text),
  estornar_ultimo_pagamento(uuid)
  from public;
grant execute on function gerar_cotas(uuid, date, date, bigint),
  registrar_pagamento(uuid, bigint, date, origem_pagamento, text),
  estornar_ultimo_pagamento(uuid)
  to authenticated;
