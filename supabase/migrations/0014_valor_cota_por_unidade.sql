-- Valor da cota por unidade, geração a partir desses valores e edição de cotas.
--
-- Cada unidade tem o seu "valor da cota mensal" (pode ser igual para todas ou não). A geração do mês
-- pode usar o valor de cada unidade ou um valor único. Uma cota ainda sem pagamento nem antecipação
-- pode ter valor e vencimento corrigidos, ou ser cancelada (a auditoria registra a alteração).

alter table unidade add column valor_cota_centavos bigint check (valor_cota_centavos is null or valor_cota_centavos > 0);

-- gerar_cotas: p_valor_centavos NULL = usar o valor cadastrado em cada unidade (unidades sem valor
-- são ignoradas). Com valor informado, vale para todas. Idempotente: não altera cotas já geradas.
drop function gerar_cotas(uuid, date, date, bigint);

create function gerar_cotas(
  p_condominio uuid, p_competencia date, p_vencimento date, p_valor_centavos bigint default null
) returns integer
language plpgsql set search_path = '' as $$
declare
  n integer;
begin
  if not public.pode_escrever_condominio(p_condominio) then
    raise exception 'Sem permissão neste condomínio';
  end if;
  if p_valor_centavos is not null and p_valor_centavos <= 0 then
    raise exception 'Valor da cota deve ser maior que zero';
  end if;

  insert into public.cota (condominio_id, unidade_id, competencia, vencimento, valor_centavos)
  select p_condominio, u.id, date_trunc('month', p_competencia)::date, p_vencimento,
         coalesce(p_valor_centavos, u.valor_cota_centavos)
  from public.unidade u
  where u.condominio_id = p_condominio
    and coalesce(p_valor_centavos, u.valor_cota_centavos) is not null
  on conflict (unidade_id, competencia) do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function gerar_cotas(uuid, date, date, bigint) from public, anon;
grant execute on function gerar_cotas(uuid, date, date, bigint) to authenticated;

-- Só dá para mexer numa cota aberta, sem nenhum pagamento (nem estornado) e sem antecipação.
create function editar_cota(p_cota uuid, p_valor_centavos bigint, p_vencimento date) returns void
language plpgsql set search_path = '' as $$
declare
  c public.cota;
begin
  select * into c from public.cota where id = p_cota for update;
  if not found then
    raise exception 'Cota não encontrada';
  end if;
  if not public.pode_escrever_condominio(c.condominio_id) then
    raise exception 'Sem permissão neste condomínio';
  end if;
  if c.status <> 'aberta' then
    raise exception 'cota_nao_editavel';
  end if;
  if exists (select 1 from public.pagamento where cota_id = c.id) then
    raise exception 'cota_com_pagamento';
  end if;
  if exists (select 1 from public.antecipacao where cota_id = c.id) then
    raise exception 'cota_antecipada';
  end if;
  if p_valor_centavos is null or p_valor_centavos <= 0 then
    raise exception 'Valor da cota deve ser maior que zero';
  end if;

  update public.cota set valor_centavos = p_valor_centavos, vencimento = coalesce(p_vencimento, vencimento)
   where id = c.id;
end $$;

create function cancelar_cota(p_cota uuid) returns void
language plpgsql set search_path = '' as $$
declare
  c public.cota;
begin
  select * into c from public.cota where id = p_cota for update;
  if not found then
    raise exception 'Cota não encontrada';
  end if;
  if not public.pode_escrever_condominio(c.condominio_id) then
    raise exception 'Sem permissão neste condomínio';
  end if;
  if c.status <> 'aberta' then
    raise exception 'cota_nao_editavel';
  end if;
  if exists (select 1 from public.pagamento where cota_id = c.id) then
    raise exception 'cota_com_pagamento';
  end if;
  if exists (select 1 from public.antecipacao where cota_id = c.id) then
    raise exception 'cota_antecipada';
  end if;
  update public.cota set status = 'cancelada' where id = c.id;
end $$;

revoke all on function editar_cota(uuid, bigint, date), cancelar_cota(uuid) from public, anon;
grant execute on function editar_cota(uuid, bigint, date), cancelar_cota(uuid) to authenticated;

-- importar_unidades: aceita "valor_cota_centavos" opcional por linha (define o valor da cota da unidade).
create or replace function importar_unidades(p_condominio uuid, p_linhas jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  linha          jsonb;
  v_bloco_nome   text;
  v_bloco_id     uuid;
  v_unidade_id   uuid;
  v_pessoa_id    uuid;
  v_vinculo_id   uuid;
  v_tipo         public.tipo_vinculo;
  v_valor        bigint;
  v_nome         text;
  v_doc          text;
  v_email        text;
  v_novos_blocos int := 0;
  v_novas_unid   int := 0;
  v_novas_pess   int := 0;
  v_novos_vinc   int := 0;
  v_linhas       int := 0;
begin
  if not public.pode_escrever_condominio(p_condominio) then
    raise exception 'Sem permissão para importar neste condomínio';
  end if;

  for linha in select * from jsonb_array_elements(p_linhas) loop
    v_linhas := v_linhas + 1;
    v_bloco_nome := nullif(trim(linha ->> 'bloco'), '');
    v_nome       := nullif(trim(linha ->> 'nome'), '');
    v_doc        := nullif(trim(linha ->> 'documento'), '');
    v_email      := nullif(lower(trim(linha ->> 'email')), '');
    v_tipo       := coalesce(nullif(lower(trim(linha ->> 'tipo')), ''), 'proprietario')::public.tipo_vinculo;
    v_valor      := nullif(trim(linha ->> 'valor_cota_centavos'), '')::bigint;
    if v_valor is not null and v_valor <= 0 then
      raise exception 'valor_cota_invalido';
    end if;
    v_bloco_id   := null;

    if v_bloco_nome is not null then
      select id into v_bloco_id from public.bloco
        where condominio_id = p_condominio and nome = v_bloco_nome;
      if v_bloco_id is null then
        insert into public.bloco (condominio_id, nome)
          values (p_condominio, v_bloco_nome) returning id into v_bloco_id;
        v_novos_blocos := v_novos_blocos + 1;
      end if;
    end if;

    select id into v_unidade_id from public.unidade
      where condominio_id = p_condominio
        and bloco_id is not distinct from v_bloco_id
        and identificador = trim(linha ->> 'unidade');
    if v_unidade_id is null then
      insert into public.unidade (condominio_id, bloco_id, identificador, valor_cota_centavos)
        values (p_condominio, v_bloco_id, trim(linha ->> 'unidade'), v_valor)
        returning id into v_unidade_id;
      v_novas_unid := v_novas_unid + 1;
    elsif v_valor is not null then
      update public.unidade set valor_cota_centavos = v_valor where id = v_unidade_id;
    end if;

    if v_nome is not null then
      select id into v_pessoa_id from public.pessoa
        where condominio_id = p_condominio
          and (
            (v_doc is not null and documento = v_doc)
            or (v_doc is null and nome = v_nome and email is not distinct from v_email)
          )
        limit 1;
      if v_pessoa_id is null then
        insert into public.pessoa (condominio_id, nome, documento, email, telefone)
          values (p_condominio, v_nome, v_doc, v_email, nullif(trim(linha ->> 'telefone'), ''))
          returning id into v_pessoa_id;
        v_novas_pess := v_novas_pess + 1;
      end if;

      select id into v_vinculo_id from public.vinculo_unidade
        where unidade_id = v_unidade_id and pessoa_id = v_pessoa_id;
      if v_vinculo_id is not null then
        update public.vinculo_unidade set tipo = v_tipo where id = v_vinculo_id and tipo <> v_tipo;
      else
        insert into public.vinculo_unidade (condominio_id, unidade_id, pessoa_id, tipo, principal)
          values (
            p_condominio, v_unidade_id, v_pessoa_id, v_tipo,
            not exists (select 1 from public.vinculo_unidade where unidade_id = v_unidade_id and principal)
          );
        v_novos_vinc := v_novos_vinc + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'linhas', v_linhas,
    'blocos_novos', v_novos_blocos,
    'unidades_novas', v_novas_unid,
    'pessoas_novas', v_novas_pess,
    'vinculos_novos', v_novos_vinc
  );
end $$;
