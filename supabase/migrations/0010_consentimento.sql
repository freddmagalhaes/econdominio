-- Consentimento de comunicação (e-mail / WhatsApp) e edição de dados de pessoas.
--
-- `aceita_whatsapp` nasce desligado (opt-in). Cada liberação ou revogação de canal grava uma linha
-- em `consentimento_comunicacao` com a versão do termo e o contato no momento. A linha é evidência;
-- usuários não editam nem apagam (só a exclusão em cascata da pessoa/condomínio remove).

alter table pessoa add column aceita_whatsapp boolean not null default false;

create table consentimento_comunicacao (
  id             uuid primary key default gen_random_uuid(),
  condominio_id  uuid not null references condominio(id) on delete cascade,
  pessoa_id      uuid not null references pessoa(id) on delete cascade,
  canal          canal_envio not null,
  aceito         boolean not null,
  versao_termo   text not null,
  destino        text,
  registrado_por uuid references auth.users(id) on delete set null default auth.uid(),
  registrado_em  timestamptz not null default now()
);
create index on consentimento_comunicacao (pessoa_id, registrado_em desc);

alter table consentimento_comunicacao enable row level security;
create policy consentimento_select on consentimento_comunicacao for select
  using (pode_ler_condominio(condominio_id));
create policy consentimento_insert on consentimento_comunicacao for insert
  with check (pode_escrever_condominio(condominio_id));

-- Atualiza os dados da pessoa e registra o consentimento quando um canal é liberado/revogado
-- ou quando o contato de um canal liberado muda. Roda como o chamador (RLS vale).
create function atualizar_pessoa(
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

  -- Liberar um canal, ou trocar o contato de um canal liberado, exige o aceite do termo.
  v_pedido_termo :=
       (p_aceita_email    and (not pe.aceita_email    or v_email is distinct from lower(pe.email)))
    or (p_aceita_whatsapp and (not pe.aceita_whatsapp or v_tel   is distinct from pe.telefone));
  if v_pedido_termo and nullif(btrim(coalesce(p_versao_termo, '')), '') is null then
    raise exception 'termo_obrigatorio';
  end if;

  update public.pessoa
     set nome = v_nome, documento = v_doc, email = v_email, telefone = v_tel,
         aceita_email = p_aceita_email, aceita_whatsapp = p_aceita_whatsapp
   where id = pe.id;

  if p_aceita_email <> pe.aceita_email or (p_aceita_email and v_email is distinct from lower(pe.email)) then
    insert into public.consentimento_comunicacao (condominio_id, pessoa_id, canal, aceito, versao_termo, destino)
    values (pe.condominio_id, pe.id, 'email', p_aceita_email, coalesce(nullif(btrim(p_versao_termo), ''), 'revogacao'), v_email);
  end if;
  if p_aceita_whatsapp <> pe.aceita_whatsapp or (p_aceita_whatsapp and v_tel is distinct from pe.telefone) then
    insert into public.consentimento_comunicacao (condominio_id, pessoa_id, canal, aceito, versao_termo, destino)
    values (pe.condominio_id, pe.id, 'whatsapp', p_aceita_whatsapp, coalesce(nullif(btrim(p_versao_termo), ''), 'revogacao'), v_tel);
  end if;
end $$;

revoke all on function atualizar_pessoa(uuid, text, text, text, text, boolean, boolean, text) from public, anon;
grant execute on function atualizar_pessoa(uuid, text, text, text, text, boolean, boolean, text) to authenticated;
