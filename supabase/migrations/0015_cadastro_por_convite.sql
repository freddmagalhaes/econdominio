-- Cadastro SOMENTE por convite.
--
-- 1) Trava no banco: nenhuma linha entra em auth.users sem `app_metadata.origem` válido. Esse campo só é
--    aceito quando a criação vem do servidor do app (chave secreta), nunca do cadastro público do Supabase
--    (o cliente não consegue definir app_metadata). Assim `signUp` direto na API é recusado.
-- 2) Moradores: o convite (já existente) é enviado ao e-mail do convidado; o link cria a conta e confirma o e-mail.
-- 3) Administradoras: só o administrador da plataforma convida (convite_gestora); só quem tem `conta_gestora`
--    (ou é administrador da plataforma) pode criar organização.

-- ---------------------------------------------------------------- trava no auth.users
create function gate_cadastro_por_convite() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'origem', '') not in ('convite', 'gestora', 'plataforma') then
    raise exception 'cadastro_somente_por_convite';
  end if;
  return new;
end $$;

create trigger auth_users_somente_convite before insert on auth.users
  for each row execute function public.gate_cadastro_por_convite();

-- ---------------------------------------------------------------- quem pode o quê
create table administrador_plataforma (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  criado_em  timestamptz not null default now()
);

-- Contas que podem criar organizações (administradoras e quem já era dono de organização).
create table conta_gestora (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  criado_em  timestamptz not null default now()
);
insert into conta_gestora (usuario_id)
select distinct usuario_id from membro_organizacao where papel = 'proprietario'
on conflict do nothing;

create table convite_gestora (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  token_hash  text not null unique,
  expira_em   timestamptz not null default now() + interval '7 days',
  aceito_em   timestamptz,
  revogado_em timestamptz,
  criado_por  uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em   timestamptz not null default now()
);
create index on convite_gestora (lower(email));

create function eh_admin_plataforma() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.administrador_plataforma where usuario_id = auth.uid());
$$;

create function pode_criar_organizacao() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conta_gestora where usuario_id = auth.uid())
      or exists (select 1 from public.administrador_plataforma where usuario_id = auth.uid());
$$;

alter table administrador_plataforma enable row level security;
alter table conta_gestora            enable row level security;
alter table convite_gestora          enable row level security;

create policy admin_plataforma_proprio on administrador_plataforma for select using (usuario_id = auth.uid());
create policy conta_gestora_select on conta_gestora for select
  using (usuario_id = auth.uid() or public.eh_admin_plataforma());
create policy convite_gestora_admin on convite_gestora for select using (public.eh_admin_plataforma());

-- criar_organizacao agora exige permissão.
create or replace function criar_organizacao(p_nome text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  if not public.pode_criar_organizacao() then
    raise exception 'sem_permissao_organizacao';
  end if;
  insert into public.organizacao (nome) values (p_nome) returning id into org;
  insert into public.membro_organizacao (organizacao_id, usuario_id, papel)
  values (org, auth.uid(), 'proprietario');
  return org;
end $$;

-- ---------------------------------------------------------------- administrador da plataforma: convidar administradoras
create function criar_convite_gestora(p_email text, p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_exp   timestamptz;
begin
  if not public.eh_admin_plataforma() then
    raise exception 'Sem permissão';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_invalido';
  end if;
  if exists (select 1 from auth.users u join public.conta_gestora g on g.usuario_id = u.id where lower(u.email) = v_email) then
    raise exception 'ja_cadastrada';
  end if;

  update public.convite_gestora set revogado_em = now()
    where lower(email) = v_email and aceito_em is null and revogado_em is null;
  insert into public.convite_gestora (email, token_hash) values (v_email, p_token_hash)
    returning expira_em into v_exp;
  return jsonb_build_object('email', v_email, 'expira_em', v_exp);
end $$;

create function revogar_convite_gestora(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin_plataforma() then
    raise exception 'Sem permissão';
  end if;
  update public.convite_gestora set revogado_em = now()
    where id = p_id and aceito_em is null and revogado_em is null;
end $$;

-- ---------------------------------------------------------------- uso exclusivo do servidor do app (service_role)
-- Validam o token do convite ANTES de o app criar a conta com a chave secreta.
create function convite_para_cadastro(p_token_hash text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'email', c.email,
    'condominio', (select nome from public.condominio where id = c.condominio_id),
    'unidade', (select identificador from public.unidade where id = c.unidade_id),
    'bloco', (select b.nome from public.unidade u join public.bloco b on b.id = u.bloco_id where u.id = c.unidade_id)
  )
  from public.convite c
  where c.token_hash = p_token_hash and c.aceito_em is null and c.revogado_em is null and c.expira_em > now();
$$;

create function convite_gestora_para_cadastro(p_token_hash text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('email', g.email)
  from public.convite_gestora g
  where g.token_hash = p_token_hash and g.aceito_em is null and g.revogado_em is null and g.expira_em > now();
$$;

-- Conclui o convite da administradora: a conta já foi criada pelo app; aqui ela ganha a permissão.
create function concluir_cadastro_gestora(p_token_hash text, p_usuario uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.convite_gestora;
  v_email text;
begin
  select * into g from public.convite_gestora where token_hash = p_token_hash for update;
  if not found or g.aceito_em is not null or g.revogado_em is not null or g.expira_em < now() then
    raise exception 'convite_invalido';
  end if;
  select lower(email) into v_email from auth.users where id = p_usuario;
  if v_email is null or v_email <> lower(g.email) then
    raise exception 'convite_outro_email';
  end if;
  insert into public.conta_gestora (usuario_id) values (p_usuario) on conflict do nothing;
  update public.convite_gestora set aceito_em = now() where id = g.id;
end $$;

-- ---------------------------------------------------------------- permissões de execução
revoke all on function
  gate_cadastro_por_convite(), eh_admin_plataforma(), pode_criar_organizacao(),
  criar_convite_gestora(text, text), revogar_convite_gestora(uuid),
  convite_para_cadastro(text), convite_gestora_para_cadastro(text), concluir_cadastro_gestora(text, uuid)
  from public, anon, authenticated;

grant execute on function eh_admin_plataforma(), pode_criar_organizacao(),
  criar_convite_gestora(text, text), revogar_convite_gestora(uuid)
  to authenticated;

grant execute on function convite_para_cadastro(text), convite_gestora_para_cadastro(text),
  concluir_cadastro_gestora(text, uuid)
  to service_role;
