-- Vínculo proprietário/inquilino, edição do vínculo e "foto" do titular no consentimento.

-- 'morador' nunca foi usado pela aplicação; o vínculo passa a ser proprietário ou inquilino.
alter type tipo_vinculo rename value 'morador' to 'inquilino';

-- Uma pessoa tem um único vínculo por unidade (ou é proprietária ou é inquilina daquela unidade).
alter table vinculo_unidade drop constraint vinculo_unidade_unidade_id_pessoa_id_tipo_key;
alter table vinculo_unidade add constraint vinculo_unidade_unidade_pessoa_unica unique (unidade_id, pessoa_id);

-- O que constava no termo no momento do aceite (nome, documento, unidades e tipo de vínculo).
-- Calculado no banco, não vem do navegador. Fica como evidência mesmo que os dados mudem depois.
alter table consentimento_comunicacao add column titular jsonb;

create function atualizar_vinculo(p_vinculo uuid, p_tipo tipo_vinculo) returns void
language plpgsql set search_path = '' as $$
declare
  v public.vinculo_unidade;
begin
  select * into v from public.vinculo_unidade where id = p_vinculo for update;
  if not found then
    raise exception 'vinculo_nao_encontrado';
  end if;
  if not public.pode_escrever_condominio(v.condominio_id) then
    raise exception 'Sem permissão neste condomínio';
  end if;
  update public.vinculo_unidade set tipo = p_tipo where id = v.id;
end $$;

revoke all on function atualizar_vinculo(uuid, tipo_vinculo) from public, anon;
grant execute on function atualizar_vinculo(uuid, tipo_vinculo) to authenticated;

-- atualizar_pessoa: igual à 0010, mas grava a "foto" do titular em cada registro de consentimento.
create or replace function atualizar_pessoa(
  p_pessoa uuid, p_nome text, p_documento text, p_email text, p_telefone text,
  p_aceita_email boolean, p_aceita_whatsapp boolean, p_versao_termo text
) returns void
language plpgsql set search_path = '' as $$
declare
  pe        public.pessoa;
  v_nome    text := btrim(coalesce(p_nome, ''));
  v_doc     text := nullif(btrim(coalesce(p_documento, '')), '');
  v_email   text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_tel     text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_pedido_termo boolean;
  v_titular jsonb;
begin
  select * into pe from public.pessoa where id = p_pessoa for update;
  if not found then
    raise exception 'pessoa_nao_encontrada';
  end if;
  if not public.pode_escrever_condominio(pe.condominio_id) then
    raise exception 'Sem permissão neste condomínio';
  end if;

  if char_length(v_nome) < 2 or char_length(v_nome) > 120 then
    raise exception 'nome_invalido';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_invalido';
  end if;
  if v_tel is not null then
    if char_length(v_tel) in (12, 13) and left(v_tel, 2) = '55' then
      v_tel := substr(v_tel, 3);
    end if;
    if char_length(v_tel) not in (10, 11) then
      raise exception 'telefone_invalido';
    end if;
  end if;
  if p_aceita_email and v_email is null then
    raise exception 'email_obrigatorio';
  end if;
  if p_aceita_whatsapp and v_tel is null then
    raise exception 'telefone_obrigatorio';
  end if;

  v_pedido_termo :=
       (p_aceita_email    and (not pe.aceita_email    or v_email is distinct from lower(pe.email)))
    or (p_aceita_whatsapp and (not pe.aceita_whatsapp or v_tel   is distinct from pe.telefone));
  if v_pedido_termo and nullif(btrim(coalesce(p_versao_termo, '')), '') is null then
    raise exception 'termo_obrigatorio';
  end if;
  -- O termo identifica o titular: ao liberar um canal o CPF/CNPJ precisa estar preenchido.
  if v_pedido_termo and v_doc is null then
    raise exception 'documento_obrigatorio';
  end if;

  update public.pessoa
     set nome = v_nome, documento = v_doc, email = v_email, telefone = v_tel,
         aceita_email = p_aceita_email, aceita_whatsapp = p_aceita_whatsapp
   where id = pe.id;

  v_titular := jsonb_build_object(
    'nome', v_nome,
    'documento', v_doc,
    'vinculos', (
      select coalesce(jsonb_agg(
               jsonb_build_object('bloco', b.nome, 'unidade', u.identificador, 'tipo', v.tipo)
               order by b.nome nulls first, u.identificador), '[]'::jsonb)
      from public.vinculo_unidade v
      join public.unidade u on u.id = v.unidade_id
      left join public.bloco b on b.id = u.bloco_id
      where v.pessoa_id = pe.id
    )
  );

  if p_aceita_email <> pe.aceita_email or (p_aceita_email and v_email is distinct from lower(pe.email)) then
    insert into public.consentimento_comunicacao (condominio_id, pessoa_id, canal, aceito, versao_termo, destino, titular)
    values (pe.condominio_id, pe.id, 'email', p_aceita_email, coalesce(nullif(btrim(p_versao_termo), ''), 'revogacao'), v_email, v_titular);
  end if;
  if p_aceita_whatsapp <> pe.aceita_whatsapp or (p_aceita_whatsapp and v_tel is distinct from pe.telefone) then
    insert into public.consentimento_comunicacao (condominio_id, pessoa_id, canal, aceito, versao_termo, destino, titular)
    values (pe.condominio_id, pe.id, 'whatsapp', p_aceita_whatsapp, coalesce(nullif(btrim(p_versao_termo), ''), 'revogacao'), v_tel, v_titular);
  end if;
end $$;

-- importar_unidades: aceita a chave opcional "tipo" ("proprietario" | "inquilino"; padrão proprietário).
-- Reimportar atualiza o tipo do vínculo existente em vez de criar outro.
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
