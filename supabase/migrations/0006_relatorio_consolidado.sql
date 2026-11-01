-- Relatório consolidado da administradora: uma linha por condomínio.
-- Roda como o chamador (security invoker): cada usuário só enxerga o que o RLS permite.
--  * previsto/recebido: cotas da competência informada (recebido limitado ao valor da cota).
--  * em atraso: cumulativo, todas as cotas abertas com vencimento anterior a hoje (fuso de São Paulo).
--  * garantidora: repasses pendentes/atrasados e valor antecipado ainda não pago pelos condôminos.
create function relatorio_consolidado(p_organizacao uuid, p_competencia date)
returns table (
  condominio_id                  uuid,
  condominio                     text,
  unidades                       integer,
  cotas                          integer,
  previsto_centavos              bigint,
  recebido_centavos              bigint,
  cotas_em_atraso                integer,
  em_atraso_centavos             bigint,
  a_repassar_centavos            bigint,
  repasses_atrasados             integer,
  repasses_atrasados_centavos    bigint,
  antecipado_em_aberto_centavos  bigint
)
language sql stable set search_path = '' as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select
    c.id,
    c.nome,
    (select count(*)::int from public.unidade u where u.condominio_id = c.id),
    coalesce(m.cotas, 0),
    coalesce(m.previsto, 0)::bigint,
    coalesce(m.recebido, 0)::bigint,
    coalesce(a.qtd, 0),
    coalesce(a.valor, 0)::bigint,
    coalesce(r.pendente, 0)::bigint,
    coalesce(r.atrasados, 0),
    coalesce(r.atrasados_valor, 0)::bigint,
    coalesce(g.em_aberto, 0)::bigint
  from public.condominio c
  left join lateral (
    select count(*)::int as cotas,
           sum(s.valor_centavos) as previsto,
           sum(least(s.valor_pago_centavos, s.valor_centavos)) as recebido
    from public.vw_cotas_situacao s
    where s.condominio_id = c.id
      and s.competencia = date_trunc('month', p_competencia)::date
      and s.status <> 'cancelada'
  ) m on true
  left join lateral (
    select count(*)::int as qtd, sum(s.valor_centavos - s.valor_pago_centavos) as valor
    from public.vw_cotas_situacao s, hoje
    where s.condominio_id = c.id and s.status = 'aberta' and s.vencimento < hoje.d
  ) a on true
  left join lateral (
    select sum(x.valor_centavos) as pendente,
           (count(*) filter (where x.previsto_para < hoje.d))::int as atrasados,
           sum(x.valor_centavos) filter (where x.previsto_para < hoje.d) as atrasados_valor
    from public.repasse x, hoje
    where x.condominio_id = c.id and x.status = 'pendente'
  ) r on true
  left join lateral (
    select sum(v.em_aberto_centavos) as em_aberto
    from public.vw_garantidora_saldo v where v.condominio_id = c.id
  ) g on true
  where c.organizacao_id = p_organizacao and c.ativo
  order by c.nome;
$$;

revoke all on function relatorio_consolidado(uuid, date) from public, anon;
grant execute on function relatorio_consolidado(uuid, date) to authenticated;
