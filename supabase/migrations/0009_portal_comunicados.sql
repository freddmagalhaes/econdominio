-- Portal do morador (só leitura), convites por e-mail e comunicados.
--
-- O morador NÃO é membro do condomínio (não herda o acesso amplo do RLS). Ele só enxerga o que
-- as funções `portal_*` (security definer) devolvem, sempre limitado às unidades vinculadas a ele
-- em `acesso_unidade` (um acesso por unidade). O token do convite nunca é guardado em texto:
-- a aplicação gera o token, envia por e-mail e grava apenas o hash SHA-256.

alter table pessoa add column aceita_email boolean not null default true;

create type tipo_comunicado as enum ('aviso', 'reuniao');
create type canal_envio     as enum ('email', 'whatsapp');
create type status_envio    as enum ('pendente', 'enviado', 'falhou');

-- ---------------------------------------------------------------- comunicados
create table comunicado (
  id            uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references condominio(id) on delete cascade,
  tipo          tipo_comunicado not null default 'aviso',
  titulo        text not null check (char_length(btrim(titulo)) between 2 and 200),
  corpo         text not null check (char_length(corpo) <= 10000),
  data_reuniao  timestamptz,
  local         text check (char_length(local) <= 200),
  criado_por    uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em     timestamptz not null default now(),
  check (tipo <> 'reuniao' or data_reuniao is not null)
);
create index on comunicado (condominio_id, criado_em desc);

create table envio_comunicacao (
  id            uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references condominio(id) on delete cascade,
  comunicado_id uuid not null references comunicado(id) on delete cascade,
  pessoa_id     uuid not null references pessoa(id) on delete cascade,
  canal         canal_envio not null,
  destino       text not null,
  status        status_envio not null default 'pendente',
  tentativas    integer not null default 0,
  erro          text,
  enviado_em    timestamptz,
  criado_em     timestamptz not null default now(),
  unique (comunicado_id, pessoa_id, canal)
);
create index on envio_comunicacao (comunicado_id);
create index envio_a_processar on envio_comunicacao (status, tentativas) where status <> 'enviado';

-- ---------------------------------------------------------------- acesso do morador e convites
create table acesso_unidade (
  id            uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references condominio(id) on delete cascade,
  unidade_id    uuid not null unique references unidade(id) on delete cascade, -- 1 acesso por unidade
  usuario_id    uuid not null references auth.users(id) on delete cascade,
  pessoa_id     uuid references pessoa(id) on delete set null,
  criado_em     timestamptz not null default now()
);
create index on acesso_unidade (usuario_id);

create table convite (
  id            uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references condominio(id) on delete cascade,
  unidade_id    uuid not null references unidade(id) on delete cascade,
  pessoa_id     uuid not null references pessoa(id) on delete cascade,
  email         text not null,
  token_hash    text not null unique,
  expira_em     timestamptz not null default now() + interval '7 days',
  aceito_em     timestamptz,
  revogado_em   timestamptz,
  criado_por    uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em     timestamptz not null default now()
);
create index on convite (unidade_id);

-- ---------------------------------------------------------------- RLS
do $$
declare
  t text;
begin
  foreach t in array array['comunicado', 'envio_comunicacao', 'convite'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (pode_ler_condominio(condominio_id))',
                   t || '_select', t);
    execute format('create policy %I on %I for all using (pode_escrever_condominio(condominio_id)) with check (pode_escrever_condominio(condominio_id))',
                   t || '_escrita', t);
  end loop;
end $$;

alter table acesso_unidade enable row level security;
create policy acesso_unidade_select on acesso_unidade for select
  using (pode_ler_condominio(condominio_id) or usuario_id = auth.uid());
create policy acesso_unidade_escrita on acesso_unidade for all
  using (pode_escrever_condominio(condominio_id)) with check (pode_escrever_condominio(condominio_id));

create trigger audit_comunicado    after insert                     on comunicado     for each row execute function auditar();
create trigger audit_acesso        after insert or update or delete on acesso_unidade for each row execute function auditar();
create trigger audit_convite       after insert or update           on convite        for each row execute function auditar();

-- ---------------------------------------------------------------- gestor: convite e acesso
create function criar_convite(p_unidade uuid, p_pessoa uuid, p_token_hash text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_cond  uuid;
  v_email text;
  v_exp   timestamptz;
begin
  select condominio_id into v_cond from public.unidade where id = p_unidade;
  if not found then
    raise exception 'unidade_nao_encontrada';
  end if;
  if not public.pode_escrever_condominio(v_cond) then
    raise exception 'Sem permissão neste condomínio';
  end if;
  if not exists (select 1 from public.vinculo_unidade where unidade_id = p_unidade and pessoa_id = p_pessoa) then
    raise exception 'pessoa_nao_vinculada';
  end if;
  select lower(btrim(email)) into v_email from public.pessoa where id = p_pessoa;
  if v_email is null or v_email = '' then
    raise exception 'pessoa_sem_email';
  end if;
  if exists (select 1 from public.acesso_unidade where unidade_id = p_unidade) then
    raise exception 'unidade_ja_vinculada';
  end if;

  update public.convite set revogado_em = now()
    where unidade_id = p_unidade and aceito_em is null and revogado_em is null;

  insert into public.convite (condominio_id, unidade_id, pessoa_id, email, token_hash)
  values (v_cond, p_unidade, p_pessoa, v_email, p_token_hash)
  returning expira_em into v_exp;

  return jsonb_build_object('email', v_email, 'expira_em', v_exp);
end $$;

create function revogar_acesso_unidade(p_unidade uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_cond uuid;
begin
  select condominio_id into v_cond from public.unidade where id = p_unidade;
  if not found then
    raise exception 'unidade_nao_encontrada';
  end if;
  if not public.pode_escrever_condominio(v_cond) then
    raise exception 'Sem permissão neste condomínio';
  end if;
  delete from public.acesso_unidade where unidade_id = p_unidade;
  update public.convite set revogado_em = now()
    where unidade_id = p_unidade and aceito_em is null and revogado_em is null;
end $$;

-- ---------------------------------------------------------------- morador: aceitar convite
create function ver_convite(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  cv public.convite;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  select * into cv from public.convite where token_hash = p_token_hash;
  if not found or cv.aceito_em is not null or cv.revogado_em is not null or cv.expira_em < now() then
    raise exception 'convite_invalido';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  return jsonb_build_object(
    'condominio', (select nome from public.condominio where id = cv.condominio_id),
    'unidade', (select identificador from public.unidade where id = cv.unidade_id),
    'bloco', (select b.nome from public.unidade u join public.bloco b on b.id = u.bloco_id where u.id = cv.unidade_id),
    'email_confere', v_email = lower(cv.email),
    'expira_em', cv.expira_em
  );
end $$;

create function aceitar_convite(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cv      public.convite;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  select * into cv from public.convite where token_hash = p_token_hash for update;
  if not found or cv.aceito_em is not null or cv.revogado_em is not null or cv.expira_em < now() then
    raise exception 'convite_invalido';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null or v_email <> lower(cv.email) then
    raise exception 'convite_outro_email';
  end if;
  if exists (select 1 from public.acesso_unidade where unidade_id = cv.unidade_id) then
    raise exception 'unidade_ja_vinculada';
  end if;

  insert into public.acesso_unidade (condominio_id, unidade_id, usuario_id, pessoa_id)
  values (cv.condominio_id, cv.unidade_id, auth.uid(), cv.pessoa_id);
  update public.convite set aceito_em = now() where id = cv.id;

  return jsonb_build_object('condominio_id', cv.condominio_id, 'unidade_id', cv.unidade_id);
end $$;

-- ---------------------------------------------------------------- morador: consultas (só leitura)
create function portal_minhas_unidades()
returns table (unidade_id uuid, condominio_id uuid, condominio text, bloco text, unidade text)
language sql stable security definer set search_path = '' as $$
  select u.id, c.id, c.nome, b.nome, u.identificador
  from public.acesso_unidade a
  join public.unidade u on u.id = a.unidade_id
  join public.condominio c on c.id = a.condominio_id
  left join public.bloco b on b.id = u.bloco_id
  where a.usuario_id = auth.uid()
  order by c.nome, b.nome nulls first, u.identificador;
$$;

create function portal_cotas(p_unidade uuid)
returns table (competencia date, vencimento date, valor_centavos bigint, valor_pago_centavos bigint, status public.status_cota)
language sql stable security definer set search_path = '' as $$
  select s.competencia, s.vencimento, s.valor_centavos, s.valor_pago_centavos, s.status
  from public.vw_cotas_situacao s
  where s.unidade_id = p_unidade
    and s.status <> 'cancelada'
    and exists (select 1 from public.acesso_unidade a where a.unidade_id = p_unidade and a.usuario_id = auth.uid())
  order by s.competencia desc
  limit 36;
$$;

create function portal_balancete(p_condominio uuid, p_ate date)
returns table (competencia date, codigo text, nome text, tipo public.tipo_conta, total_centavos bigint)
language sql stable security definer set search_path = '' as $$
  select v.competencia, v.codigo, v.nome, v.tipo, v.total_centavos
  from public.vw_balancete_mensal v
  where v.condominio_id = p_condominio
    and v.competencia <= date_trunc('month', p_ate)::date
    and exists (select 1 from public.acesso_unidade a where a.condominio_id = p_condominio and a.usuario_id = auth.uid());
$$;

create function portal_comunicados(p_condominio uuid)
returns table (id uuid, tipo public.tipo_comunicado, titulo text, corpo text, data_reuniao timestamptz, local text, criado_em timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.tipo, m.titulo, m.corpo, m.data_reuniao, m.local, m.criado_em
  from public.comunicado m
  where m.condominio_id = p_condominio
    and exists (select 1 from public.acesso_unidade a where a.condominio_id = p_condominio and a.usuario_id = auth.uid())
  order by m.criado_em desc
  limit 50;
$$;

-- ---------------------------------------------------------------- gestor: publicar comunicado
-- Cria o comunicado e a fila de envio por e-mail (uma linha por pessoa com e-mail e que aceita e-mail).
create function publicar_comunicado(
  p_condominio uuid, p_tipo public.tipo_comunicado, p_titulo text, p_corpo text,
  p_data_reuniao timestamptz, p_local text
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_id uuid;
  v_n  integer;
begin
  if not public.pode_escrever_condominio(p_condominio) then
    raise exception 'Sem permissão neste condomínio';
  end if;

  insert into public.comunicado (condominio_id, tipo, titulo, corpo, data_reuniao, local)
  values (p_condominio, p_tipo, p_titulo, p_corpo, p_data_reuniao, nullif(btrim(p_local), ''))
  returning id into v_id;

  insert into public.envio_comunicacao (condominio_id, comunicado_id, pessoa_id, canal, destino)
  select distinct on (p.id) p_condominio, v_id, p.id, 'email', lower(btrim(p.email))
  from public.pessoa p
  join public.vinculo_unidade v on v.pessoa_id = p.id
  where p.condominio_id = p_condominio
    and p.aceita_email
    and p.email is not null and btrim(p.email) <> ''
  on conflict do nothing;
  get diagnostics v_n = row_count;

  return jsonb_build_object('comunicado_id', v_id, 'destinatarios', v_n);
end $$;

revoke all on function
  criar_convite(uuid, uuid, text), revogar_acesso_unidade(uuid),
  ver_convite(text), aceitar_convite(text),
  portal_minhas_unidades(), portal_cotas(uuid), portal_balancete(uuid, date), portal_comunicados(uuid),
  publicar_comunicado(uuid, tipo_comunicado, text, text, timestamptz, text)
  from public, anon;
grant execute on function
  criar_convite(uuid, uuid, text), revogar_acesso_unidade(uuid),
  ver_convite(text), aceitar_convite(text),
  portal_minhas_unidades(), portal_cotas(uuid), portal_balancete(uuid, date), portal_comunicados(uuid),
  publicar_comunicado(uuid, tipo_comunicado, text, text, timestamptz, text)
  to authenticated;
