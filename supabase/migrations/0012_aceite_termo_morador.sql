-- Aceite obrigatório do termo pelo próprio morador/inquilino.
--
-- Sem aceitar a versão vigente do termo, as consultas do portal (cotas, balancete, comunicados)
-- não devolvem nada: a trava está no banco. O aceite grava data/hora (servidor), versão do termo,
-- uma cópia do que constava (titular, unidade, vínculo, canais) e IP/navegador como evidência.
-- É um aceite por unidade: uma unidade nova vinculada ao mesmo usuário exige novo aceite.

-- ---------------------------------------------------------------- versões do termo
-- Para publicar um texto novo: insira a nova versão como vigente (e desligue a anterior) numa
-- migration e altere VERSAO_TERMO em src/lib/consentimento.ts. Todos voltam a precisar aceitar.
create table termo_versao (
  versao       text primary key,
  publicado_em timestamptz not null default now(),
  vigente      boolean not null default false
);
create unique index termo_versao_vigente_unica on termo_versao (vigente) where vigente;
insert into termo_versao (versao, vigente) values ('2026-11-01-v2', true);

alter table termo_versao enable row level security;
create policy termo_versao_select on termo_versao for select to authenticated using (true);

-- ---------------------------------------------------------------- registro dos aceites
create table aceite_termo (
  id            uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references condominio(id) on delete cascade,
  unidade_id    uuid not null references unidade(id) on delete cascade,
  usuario_id    uuid not null references auth.users(id) on delete cascade,
  pessoa_id     uuid references pessoa(id) on delete set null,
  versao_termo  text not null references termo_versao(versao),
  aceito_em     timestamptz not null default now(),
  titular       jsonb not null,
  ip            text,
  user_agent    text,
  unique (usuario_id, unidade_id, versao_termo)
);
create index on aceite_termo (condominio_id, versao_termo);

-- Leitura: gestores do condomínio e o próprio morador. Ninguém escreve direto (só a função).
alter table aceite_termo enable row level security;
create policy aceite_termo_select on aceite_termo for select
  using (pode_ler_condominio(condominio_id) or usuario_id = auth.uid());

-- ---------------------------------------------------------------- funções auxiliares
create function termo_vigente() returns text
language sql stable security definer set search_path = '' as $$
  select versao from public.termo_versao where vigente;
$$;

-- Verdadeiro quando TODAS as unidades do usuário têm aceite da versão vigente.
create function aceitou_termo_vigente() returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.acesso_unidade a
    where a.usuario_id = auth.uid()
      and not exists (
        select 1 from public.aceite_termo t
        where t.usuario_id = a.usuario_id and t.unidade_id = a.unidade_id
          and t.versao_termo = (select versao from public.termo_versao where vigente)
      )
  );
$$;

-- ---------------------------------------------------------------- portal: trava de leitura
create or replace function portal_cotas(p_unidade uuid)
returns table (competencia date, vencimento date, valor_centavos bigint, valor_pago_centavos bigint, status public.status_cota)
language sql stable security definer set search_path = '' as $$
  select s.competencia, s.vencimento, s.valor_centavos, s.valor_pago_centavos, s.status
  from public.vw_cotas_situacao s
  where s.unidade_id = p_unidade
    and s.status <> 'cancelada'
    and exists (select 1 from public.acesso_unidade a where a.unidade_id = p_unidade and a.usuario_id = auth.uid())
    and public.aceitou_termo_vigente()
  order by s.competencia desc
  limit 36;
$$;

create or replace function portal_balancete(p_condominio uuid, p_ate date)
returns table (competencia date, codigo text, nome text, tipo public.tipo_conta, total_centavos bigint)
language sql stable security definer set search_path = '' as $$
  select v.competencia, v.codigo, v.nome, v.tipo, v.total_centavos
  from public.vw_balancete_mensal v
  where v.condominio_id = p_condominio
    and v.competencia <= date_trunc('month', p_ate)::date
    and exists (select 1 from public.acesso_unidade a where a.condominio_id = p_condominio and a.usuario_id = auth.uid())
    and public.aceitou_termo_vigente();
$$;

create or replace function portal_comunicados(p_condominio uuid)
returns table (id uuid, tipo public.tipo_comunicado, titulo text, corpo text, data_reuniao timestamptz, local text, criado_em timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.tipo, m.titulo, m.corpo, m.data_reuniao, m.local, m.criado_em
  from public.comunicado m
  where m.condominio_id = p_condominio
    and exists (select 1 from public.acesso_unidade a where a.condominio_id = p_condominio and a.usuario_id = auth.uid())
    and public.aceitou_termo_vigente()
  order by m.criado_em desc
  limit 50;
$$;

-- ---------------------------------------------------------------- portal: dados do termo e aceite
-- O que o morador precisa ver para aceitar: quem ele é no cadastro, em que unidade e com qual vínculo.
create function portal_dados_termo()
returns table (
  unidade_id uuid, condominio_id uuid, condominio text, bloco text, unidade text,
  tipo public.tipo_vinculo, pessoa_id uuid, pessoa_nome text, documento text,
  email text, telefone text, aceita_email boolean, aceita_whatsapp boolean, aceito_em timestamptz
)
language sql stable security definer set search_path = '' as $$
  select u.id, c.id, c.nome, b.nome, u.identificador,
         v.tipo, p.id, p.nome, p.documento,
         p.email, p.telefone, p.aceita_email, p.aceita_whatsapp, t.aceito_em
  from public.acesso_unidade a
  join public.unidade u on u.id = a.unidade_id
  join public.condominio c on c.id = a.condominio_id
  left join public.bloco b on b.id = u.bloco_id
  left join public.pessoa p on p.id = a.pessoa_id
  left join public.vinculo_unidade v on v.unidade_id = a.unidade_id and v.pessoa_id = a.pessoa_id
  left join public.aceite_termo t
    on t.usuario_id = a.usuario_id and t.unidade_id = a.unidade_id
   and t.versao_termo = (select versao from public.termo_versao where vigente)
  where a.usuario_id = auth.uid()
  order by c.nome, b.nome nulls first, u.identificador;
$$;

-- Registra o aceite (data/hora do servidor) e aplica a escolha de canais do próprio morador.
-- Pode ser chamada de novo para mudar os canais; os aceites já feitos não são duplicados.
create function aceitar_termo(
  p_versao text, p_aceita_email boolean, p_aceita_whatsapp boolean, p_ip text, p_user_agent text
) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_vigente text;
  v_agora   timestamptz := now();
  a         record;
  pe        public.pessoa;
  v_titular jsonb;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  select versao into v_vigente from public.termo_versao where vigente;
  if v_vigente is null or p_versao is distinct from v_vigente then
    raise exception 'versao_desatualizada';
  end if;
  if not exists (select 1 from public.acesso_unidade where usuario_id = auth.uid()) then
    raise exception 'sem_acesso';
  end if;
  if exists (select 1 from public.acesso_unidade where usuario_id = auth.uid() and pessoa_id is null) then
    raise exception 'cadastro_incompleto';
  end if;

  -- O termo identifica o titular e o contato precisa existir para o canal escolhido.
  for pe in
    select distinct p.* from public.pessoa p
    join public.acesso_unidade ac on ac.pessoa_id = p.id
    where ac.usuario_id = auth.uid()
  loop
    if pe.documento is null or btrim(pe.documento) = '' then
      raise exception 'documento_ausente';
    end if;
    if p_aceita_email and (pe.email is null or btrim(pe.email) = '') then
      raise exception 'email_obrigatorio';
    end if;
    if p_aceita_whatsapp and (pe.telefone is null or btrim(pe.telefone) = '') then
      raise exception 'telefone_obrigatorio';
    end if;
  end loop;

  -- Um aceite por unidade, cada um com a cópia do que constava no termo.
  for a in
    select ac.unidade_id, ac.condominio_id, ac.pessoa_id
    from public.acesso_unidade ac where ac.usuario_id = auth.uid()
  loop
    select * into pe from public.pessoa where id = a.pessoa_id;
    v_titular := jsonb_build_object(
      'nome', pe.nome,
      'documento', pe.documento,
      'condominio', (select nome from public.condominio where id = a.condominio_id),
      'vinculos', (
        select coalesce(jsonb_agg(jsonb_build_object('bloco', b.nome, 'unidade', u.identificador, 'tipo', v.tipo)), '[]'::jsonb)
        from public.vinculo_unidade v
        join public.unidade u on u.id = v.unidade_id
        left join public.bloco b on b.id = u.bloco_id
        where v.pessoa_id = pe.id and v.unidade_id = a.unidade_id
      ),
      'aceita_email', p_aceita_email,
      'aceita_whatsapp', p_aceita_whatsapp
    );
    insert into public.aceite_termo
      (condominio_id, unidade_id, usuario_id, pessoa_id, versao_termo, aceito_em, titular, ip, user_agent)
    values
      (a.condominio_id, a.unidade_id, auth.uid(), a.pessoa_id, v_vigente, v_agora, v_titular,
       left(nullif(btrim(p_ip), ''), 64), left(nullif(btrim(p_user_agent), ''), 300))
    on conflict (usuario_id, unidade_id, versao_termo) do nothing;
  end loop;

  -- Canais escolhidos pelo próprio morador (só registra consentimento quando algo muda).
  for pe in
    select distinct p.* from public.pessoa p
    join public.acesso_unidade ac on ac.pessoa_id = p.id
    where ac.usuario_id = auth.uid()
  loop
    v_titular := jsonb_build_object('nome', pe.nome, 'documento', pe.documento, 'origem', 'portal');
    if p_aceita_email <> pe.aceita_email then
      insert into public.consentimento_comunicacao (condominio_id, pessoa_id, canal, aceito, versao_termo, destino, titular)
      values (pe.condominio_id, pe.id, 'email', p_aceita_email, v_vigente, lower(btrim(pe.email)), v_titular);
    end if;
    if p_aceita_whatsapp <> pe.aceita_whatsapp then
      insert into public.consentimento_comunicacao (condominio_id, pessoa_id, canal, aceito, versao_termo, destino, titular)
      values (pe.condominio_id, pe.id, 'whatsapp', p_aceita_whatsapp, v_vigente, pe.telefone, v_titular);
    end if;
    update public.pessoa set aceita_email = p_aceita_email, aceita_whatsapp = p_aceita_whatsapp where id = pe.id;
  end loop;

  return (select max(t.aceito_em) from public.aceite_termo t
          where t.usuario_id = auth.uid() and t.versao_termo = v_vigente);
end $$;

revoke all on function
  termo_vigente(), aceitou_termo_vigente(), portal_dados_termo(),
  aceitar_termo(text, boolean, boolean, text, text),
  portal_cotas(uuid), portal_balancete(uuid, date), portal_comunicados(uuid)
  from public, anon;
grant execute on function
  termo_vigente(), aceitou_termo_vigente(), portal_dados_termo(),
  aceitar_termo(text, boolean, boolean, text, text),
  portal_cotas(uuid), portal_balancete(uuid, date), portal_comunicados(uuid)
  to authenticated;
