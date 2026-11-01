-- Corrige a trava de cadastro da 0015.
--
-- O Supabase grava o app_metadata DEPOIS de inserir o usuário, então o gatilho não consegue ler a "origem"
-- no INSERT (nem a criação legítima passava). Novo mecanismo:
--   1) o servidor do app (service_role) registra uma AUTORIZAÇÃO de uso único para um e-mail, com o hash de um
--      código secreto aleatório (nonce) e validade de 2 minutos;
--   2) cria o usuário passando o nonce em user_metadata.autorizacao;
--   3) o gatilho só aceita a conta se houver autorização válida para aquele e-mail E o nonce conferir; então
--      consome a autorização, grava a origem em app_metadata e remove o nonce.
-- Quem usa o cadastro público (ou o botão "Add user" do painel) não conhece o nonce e é recusado.

create table autorizacao_cadastro (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  origem     text not null check (origem in ('convite', 'gestora', 'plataforma')),
  nonce_hash text not null unique,
  expira_em  timestamptz not null default now() + interval '2 minutes',
  usada_em   timestamptz,
  criado_em  timestamptz not null default now()
);
create index on autorizacao_cadastro (lower(email));
alter table autorizacao_cadastro enable row level security; -- sem políticas: ninguém lê pela API

-- Só o servidor do app chama (chave secreta).
create function autorizar_cadastro(p_email text, p_origem text, p_nonce_hash text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_origem not in ('convite', 'gestora', 'plataforma') then
    raise exception 'origem_invalida';
  end if;
  if p_nonce_hash is null or char_length(p_nonce_hash) <> 64 then
    raise exception 'nonce_invalido';
  end if;
  delete from public.autorizacao_cadastro where expira_em < now() - interval '1 day';
  insert into public.autorizacao_cadastro (email, origem, nonce_hash)
  values (lower(btrim(p_email)), p_origem, p_nonce_hash);
end $$;

create or replace function gate_cadastro_por_convite() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a public.autorizacao_cadastro;
begin
  select * into a from public.autorizacao_cadastro
   where lower(email) = lower(coalesce(new.email, ''))
     and nonce_hash = encode(sha256(convert_to(coalesce(new.raw_user_meta_data ->> 'autorizacao', ''), 'UTF8')), 'hex')
     and usada_em is null and expira_em > now()
   for update;
  if not found then
    raise exception 'cadastro_somente_por_convite';
  end if;

  update public.autorizacao_cadastro set usada_em = now() where id = a.id;
  new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('origem', a.origem);
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'autorizacao';
  return new;
end $$;

revoke all on function autorizar_cadastro(text, text, text) from public, anon, authenticated;
grant execute on function autorizar_cadastro(text, text, text) to service_role;
