-- Unicidade de unidade também quando não há bloco (NULL não conflita em unique comum).
alter table unidade drop constraint unidade_condominio_id_bloco_id_identificador_key;
create unique index unidade_unica
  on unidade (condominio_id, coalesce(bloco_id, '00000000-0000-0000-0000-000000000000'::uuid), identificador);

-- Importa unidades e proprietários de forma transacional e idempotente.
-- Roda como o usuário chamador (security invoker): o RLS continua valendo.
-- p_linhas: [{ "bloco": "A", "unidade": "101", "nome": "...", "documento": "...", "email": "...", "telefone": "..." }]
create function importar_unidades(p_condominio uuid, p_linhas jsonb)
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
  v_nome         text;
  v_doc          text;
  v_email        text;
  v_novos_blocos int := 0;
  v_novas_unid   int := 0;
  v_novas_pess   int := 0;
  v_novos_vinc   int := 0;
  v_linhas       int := 0;
  n              int;
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
      insert into public.unidade (condominio_id, bloco_id, identificador)
        values (p_condominio, v_bloco_id, trim(linha ->> 'unidade'))
        returning id into v_unidade_id;
      v_novas_unid := v_novas_unid + 1;
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

      insert into public.vinculo_unidade (condominio_id, unidade_id, pessoa_id, tipo, principal)
        values (
          p_condominio, v_unidade_id, v_pessoa_id, 'proprietario',
          not exists (select 1 from public.vinculo_unidade where unidade_id = v_unidade_id and principal)
        )
        on conflict (unidade_id, pessoa_id, tipo) do nothing;
      get diagnostics n = row_count;
      v_novos_vinc := v_novos_vinc + n;
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

revoke all on function importar_unidades(uuid, jsonb) from public;
grant execute on function importar_unidades(uuid, jsonb) to authenticated;
