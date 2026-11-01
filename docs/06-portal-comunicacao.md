# Portal do morador e comunicação

## Decisões (01/11/2026)
- **Acesso do morador:** convite por e-mail, **um acesso por unidade**. Só leitura.
- **O morador vê:** as cotas da própria unidade, o balancete agregado do condomínio (receitas e despesas por conta, sem lançamentos individuais) e os comunicados.
- **E-mail:** Resend, com domínio próprio (a definir).
- **WhatsApp:** número exclusivo para comunicados, via API **não oficial** (gateway ainda não escolhido).
- **Fora do escopo agora:** boleto/Pix para o morador (exige provedor de pagamentos).

## Como funciona o convite
1. O gestor abre **Moradores** no condomínio e clica em *Enviar convite* (vai para o e-mail do responsável principal da unidade).
2. O sistema gera um token aleatório, grava **apenas o hash SHA-256** e envia o link `/convite/<token>` por e-mail. Vale 7 dias e só pode ser usado uma vez.
3. O morador abre o link. Sem login, é levado a `/login?next=...` e volta ao convite depois de entrar ou criar a conta.
4. Para aceitar, o **e-mail da conta precisa ser o mesmo do convite**. Isso impede que um link encaminhado dê acesso a outra pessoa.
5. Reenviar o convite revoga o anterior. *Revogar* remove o acesso e os convites abertos, e o morador perde tudo imediatamente.

Se o e-mail não estiver configurado, o convite é criado mesmo assim e a tela mostra o link para o gestor repassar manualmente.

## Isolamento de dados
O morador **não** é membro do condomínio, então não herda o RLS de gestão. Ele só lê o que as funções `portal_*` devolvem, sempre limitado às unidades dele em `acesso_unidade`. Acessar uma tela de gestão mostra a tela de "não encontrado". Isso é verificado em `npm run test:sql` e no teste de ponta a ponta.

## Comunicados e reuniões
- **Comunicados** > *Novo comunicado*: tipo (aviso ou reunião), título e mensagem. Reunião exige data e hora (horário de Brasília) e aceita local.
- Aparece no portal e é enviado por e-mail a todas as pessoas do condomínio que têm e-mail e aceitam receber (`pessoa.aceita_email`, padrão sim).
- Cada envio fica numa fila (`envio_comunicacao`) com status e número de tentativas. Falhas podem ser reenviadas na tela, e um cron diário reprocessa pendentes (até 5 tentativas).
- O conteúdo digitado é escapado no HTML do e-mail e o assunto não aceita quebra de linha.

## Configurar o Resend
1. Crie a conta no Resend e **adicione o domínio** (Domains > Add Domain).
2. Publique no DNS do domínio os registros que o Resend indicar (SPF e DKIM). Aguarde a verificação.
3. Defina no ambiente (`.env.local` e na Vercel):
   - `RESEND_API_KEY`
   - `EMAIL_REMETENTE`, por exemplo `eCondomínio <avisos@seu-dominio.com.br>`
   - `NEXT_PUBLIC_APP_URL` com a URL pública (usada nos links dos convites)
4. Sem domínio verificado o Resend só entrega para o e-mail dono da conta. O plano gratuito tem limite diário de envios; confira antes de uso real.

## Cron de reenvio (Vercel)
`vercel.json` agenda `GET /api/comunicacao/reprocessar` uma vez por dia. Defina `CRON_SECRET` (valor longo e aleatório) e `SUPABASE_SECRET_KEY` (chave secreta do projeto, só no servidor). A rota exige `Authorization: Bearer <CRON_SECRET>`.

## WhatsApp via Evolution API
Decisão: número exclusivo para comunicados (não recebe nem conversa), pela **Evolution API**, que roda em um servidor seu (a Vercel não serve: a sessão do WhatsApp precisa ficar ligada o tempo todo; uma VPS pequena resolve).

**Como ligar**
1. Suba a Evolution API v2 num servidor com Docker (siga a documentação oficial do projeto: `https://doc.evolution-api.com`), com uma chave de API forte e HTTPS na frente.
2. Crie uma **instância** (ex.: `econdominio`) e leia o QR Code com o chip dedicado.
3. Defina no ambiente (Vercel e `.env.local`): `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`. Opcional: `WHATSAPP_INTERVALO_MS`.
4. Na tela **Comunicados** aparece o estado da instância (conectado / desconectado / indisponível).

**Como funciona**
- Só recebe quem marcou WhatsApp (`aceita_whatsapp`, desligado por padrão) e tem telefone válido. O número vai para a fila já como `55` + DDD + número.
- Os envios saem **um a um, com pausa** (4 s ± 50% por padrão) e a mensagem traz como deixar de receber. Cada resultado é gravado na hora, então uma rodada interrompida não repete mensagens.
- Cada rodada tem limite de tempo (~40 s ao publicar, ~45 s no cron). O que não couber fica **pendente** e sai na próxima: botão *Reenviar pendentes* ou o cron. Para filas grandes, agende `GET /api/comunicacao/reprocessar` com frequência (ex.: a cada 5 minutos; o plano gratuito da Vercel só permite cron diário, então use um agendador externo com o cabeçalho `Authorization: Bearer <CRON_SECRET>`).

**Riscos da API não oficial:** viola os termos do WhatsApp, o número pode ser banido a qualquer momento e o gateway pode quebrar com atualizações do WhatsApp. Mantenha o e-mail como canal principal, use um chip que aceite perder, não envie mensagens idênticas em massa e respeite a autorização de cada pessoa.

## Consentimento e termo de autorização
- Em **Pessoas** o gestor edita nome, CPF/CNPJ, e-mail e telefone, e liga ou desliga **e-mail** e **WhatsApp** (`aceita_email` / `aceita_whatsapp`; o WhatsApp nasce desligado).
- O **termo** é montado com os dados do titular: nome, CPF/CNPJ, bloco, unidade e se é **proprietário(a) ou inquilino(a)**. Para inquilino entra uma cláusula extra. O CPF/CNPJ é obrigatório para liberar um canal.
- O vínculo (proprietário/inquilino) de cada unidade é editado na própria tela da pessoa e pode vir da coluna `tipo` da planilha de importação.
- Liberar um canal (ou trocar o contato de um canal liberado) exige o aceite do termo. Cada liberação ou revogação grava um registro com a **versão do termo**, o contato e uma cópia do que constava no termo (nome, CPF/CNPJ, unidades e tipo de vínculo), calculada no banco.
- O texto está em `src/lib/consentimento.ts`. Ao mudar o texto, altere `VERSAO_TERMO`. **É um modelo básico: peça revisão jurídica antes de usar com clientes.**

## Aceite do termo pelo morador (obrigatório) e autorização no portal
- No primeiro acesso, o portal mostra **só o termo**, já com os dados dele (nome, CPF/CNPJ, bloco, unidade, proprietário ou inquilino). Só depois de marcar *Li e aceito* o portal libera cotas, balancete e comunicados. A trava está no banco: sem o aceite da versão vigente, as consultas do portal voltam vazias.
- O aceite grava **data e hora (do servidor)**, a versão do termo, uma cópia do que constava (titular, unidade, vínculo e canais), o IP e o navegador. Há um aceite por unidade. O gestor vê a data/hora em *Acesso ao portal*.
- Se faltar o CPF/CNPJ no cadastro, o aceite é recusado e a tela orienta a pedir ao síndico.
- Depois do aceite, o morador gerencia a própria autorização em **Minhas autorizações** (e-mail e WhatsApp): cada mudança grava um registro de consentimento com origem *portal*. Mudar contato continua com o gestor.
- **Nova versão do termo:** insira a versão em `termo_versao` (marcando-a vigente e desligando a anterior) numa migration e altere `VERSAO_TERMO` em `src/lib/consentimento.ts`. Todos precisam aceitar de novo. Um teste confere que o app e o banco usam a mesma versão.
- IP e navegador são dados pessoais usados como evidência; informe isso na política de privacidade.

## Cotas por unidade
- Cada unidade tem o seu **valor de cota mensal** (`unidade.valor_cota_centavos`): na lista de unidades do condomínio, pela coluna `valor_cota` da planilha, ou com o atalho "mesmo valor para todas".
- Em **Cotas**, a geração do mês pode **usar o valor cadastrado em cada unidade** (as sem valor ficam de fora e o sistema avisa) ou aplicar **um valor único** a todas.
- Uma cota **em aberto, sem nenhum pagamento (nem estornado) e sem antecipação** pode ter valor e vencimento corrigidos, ou ser cancelada (cancelada não é recriada ao gerar de novo). Toda alteração fica na auditoria.

## Publicar na Vercel (checklist)
O projeto já está criado e vinculado (`econdominio`, conta Hobby) e as variáveis `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` e `CRON_SECRET` já estão cadastradas. **Nenhum deploy está no ar.**

Antes do primeiro `vercel deploy`, saiba que:
1. **O primeiro deploy de um projeto vira produção**, e no plano Hobby o domínio de produção (`econdominio.vercel.app`) fica **público**, sem o login da Vercel. O app exige login, mas o cadastro de conta está aberto a qualquer visitante.
2. O **cron só existe em produção** e roda uma vez por dia (`vercel.json`).
3. `NEXT_PUBLIC_APP_URL` é embutida no build: cadastre `https://econdominio.vercel.app` (ou o domínio próprio) na Vercel **antes** do deploy, senão os links dos convites saem com `localhost`.
4. No Supabase (Authentication → URL Configuration), ajuste **Site URL** e **Redirect URLs** para o endereço publicado, para os e-mails de confirmação de conta apontarem para o lugar certo.
5. Configure o Resend (`RESEND_API_KEY`, `EMAIL_REMETENTE`) para o e-mail sair. Sem isso, o cron e o botão "Reenviar" **não tentam nada** e as mensagens ficam pendentes, sem gastar as 5 tentativas.
6. Decida o que fazer com o **cadastro aberto** (por exemplo, exigir confirmação de e-mail e/ou captcha no Supabase, ou só aceitar contas por convite).

## Cadastro somente por convite
Não existe cadastro público: a tela de entrada não tem "Criar conta" e o próprio banco recusa contas criadas fora do app.

- **Trava no banco:** um gatilho em `auth.users` só aceita a conta se existir uma **autorização de uso único** para aquele e-mail e o INSERT trouxer o código secreto correspondente (`user_metadata.autorizacao`). O servidor do app registra a autorização (`autorizar_cadastro`, só com a chave secreta), com o hash de um código aleatório e validade de 2 minutos, e logo em seguida cria o usuário levando o código; o gatilho consome a autorização e grava a origem (`convite`, `gestora` ou `plataforma`). O `signUp` público da API, o botão "Add user" do painel e qualquer tentativa de escrever a origem pelo cliente são recusados. (A 0015 tentou usar `app_metadata`, mas o Supabase só o grava depois do INSERT; a 0016 corrigiu.)
- **Morador:** o gestor envia o convite ao e-mail dele. O link (`/convite/<token>`) mostra o e-mail do convite (não editável) e pede só a senha; ao enviar, o servidor valida o token, cria a conta com aquele e-mail **já confirmado** (abrir o link prova que a caixa de entrada é dele) e aceita o convite. Quem já tem conta entra e aceita.
- **Administradora:** só o **administrador da plataforma** convida, na tela **Plataforma** do menu. O link (`/cadastro/<token>`) cria a conta e libera a criação de organizações (`conta_gestora`). Sem essa permissão, `criar_organizacao` é recusada.
- **Tokens:** valem 7 dias, uso único, e só o hash fica no banco.

**Primeiro administrador da plataforma** (uma vez, no SQL Editor do Supabase, com o seu e-mail):
```sql
insert into administrador_plataforma (usuario_id) select id from auth.users where lower(email) = lower('SEU-EMAIL');
insert into conta_gestora (usuario_id) select id from auth.users where lower(email) = lower('SEU-EMAIL') on conflict do nothing;
```

**Observação:** com o Resend sem configuração, o e-mail do convite não sai; a tela mostra o link para você repassar manualmente.
