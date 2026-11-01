-- Fila de WhatsApp (Evolution API): publicar_comunicado passa a enfileirar também o canal WhatsApp,
-- só para quem autorizou (`aceita_whatsapp`) e tem telefone válido. O destino é guardado já no
-- formato internacional do Brasil ("55" + DDD + número), que é o que a Evolution API espera.

drop function publicar_comunicado(uuid, tipo_comunicado, text, text, timestamptz, text);

create function publicar_comunicado(
  p_condominio uuid, p_tipo public.tipo_comunicado, p_titulo text, p_corpo text,
  p_data_reuniao timestamptz, p_local text, p_whatsapp boolean default false
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_id uuid;
  v_email integer;
  v_wa    integer := 0;
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
  get diagnostics v_email = row_count;

  if p_whatsapp then
    insert into public.envio_comunicacao (condominio_id, comunicado_id, pessoa_id, canal, destino)
    select p_condominio, v_id, x.id, 'whatsapp', '55' || x.digitos
    from (
      select distinct on (p.id) p.id,
             case when char_length(d.digitos) in (12, 13) and left(d.digitos, 2) = '55'
                  then substr(d.digitos, 3) else d.digitos end as digitos
      from public.pessoa p
      join public.vinculo_unidade v on v.pessoa_id = p.id
      cross join lateral (select regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g') as digitos) d
      where p.condominio_id = p_condominio and p.aceita_whatsapp
    ) x
    where char_length(x.digitos) in (10, 11)
    on conflict do nothing;
    get diagnostics v_wa = row_count;
  end if;

  return jsonb_build_object('comunicado_id', v_id, 'destinatarios', v_email, 'destinatarios_whatsapp', v_wa);
end $$;

revoke all on function publicar_comunicado(uuid, tipo_comunicado, text, text, timestamptz, text, boolean) from public, anon;
grant execute on function publicar_comunicado(uuid, tipo_comunicado, text, text, timestamptz, text, boolean) to authenticated;
