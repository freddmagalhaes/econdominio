# eCondomínio

Gestão de condomínios para administradoras (com garantidora) e, depois, síndicos de condomínios pequenos.

Stack: Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres, Auth, RLS), deploy na Vercel.
Documentação de produto e arquitetura em [`docs/`](docs/).

## Rodando localmente
1. `npm install`
2. Crie um projeto no [Supabase](https://supabase.com) (região São Paulo).
3. Copie `.env.example` para `.env.local` e preencha URL e chave publishable.
4. Aplique as migrations em ordem (`supabase/migrations/0001`, `0002`, `0003`) no SQL Editor do Supabase, ou com a CLI: `supabase link` e `supabase db push`.
5. `npm run dev` e abra http://localhost:3000

## Estrutura
- `supabase/migrations/` schema SQL com RLS (organização → condomínio)
- `src/proxy.ts` e `src/lib/supabase/` sessão e clientes Supabase
- `src/app/login` autenticação · `src/app/dashboard` organizações e condomínios · `src/app/portal` portal do morador · `src/app/convite` aceite de convite
- `src/lib/comunicacao/` e-mail (Resend), modelos e fila de envio · `docs/06-portal-comunicacao.md`
- `src/lib/dinheiro.ts` utilitários de centavos
- `public/modelo-importacao*` modelos de importação (xlsx e csv) e `docs/05-guia-importacao.md` guia para clientes

## Regras do projeto
- Dinheiro sempre em centavos (inteiros).
- `lancamento` e `pagamento` são imutáveis: correção por estorno.
- Toda tabela de negócio tem `condominio_id` e RLS.
- `SUPABASE_SERVICE_ROLE_KEY` nunca vai para o navegador.

## Testes
`npm run test:unit` testa o leitor de planilhas (CSV e XLSX).

`npm run test:sql` roda as migrations em um Postgres em memória (PGlite) e verifica RLS, importação, cotas, pagamentos, estorno e imutabilidade.
