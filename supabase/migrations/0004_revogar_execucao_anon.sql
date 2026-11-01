-- No Supabase, funções novas em `public` ficam executáveis por `anon` (privilégio padrão do
-- schema, não herdado de PUBLIC). As funções do app exigem usuário autenticado, então
-- removemos a execução do papel anônimo (defesa em profundidade).
revoke execute on function
  criar_organizacao(text),
  importar_unidades(uuid, jsonb),
  gerar_cotas(uuid, date, date, bigint),
  registrar_pagamento(uuid, bigint, date, origem_pagamento, text),
  estornar_ultimo_pagamento(uuid),
  pode_ler_condominio(uuid),
  pode_escrever_condominio(uuid),
  eh_membro_organizacao(uuid),
  eh_admin_organizacao(uuid)
from anon;
