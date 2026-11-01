-- A proteção das contas do sistema (0007) bloqueava também a exclusão em cascata ao apagar um
-- condomínio. Passa a bloquear apenas a remoção direta: se o condomínio já não existe (cascata),
-- a exclusão da conta é permitida.
create or replace function proteger_conta_sistema() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.sistema is not null
       and exists (select 1 from public.condominio where id = old.condominio_id) then
      raise exception 'Conta do sistema não pode ser removida';
    end if;
    return old;
  end if;
  if old.sistema is distinct from new.sistema or (old.sistema is not null and old.tipo <> new.tipo) then
    raise exception 'Conta do sistema não pode mudar de tipo nem de função';
  end if;
  return new;
end $$;
