# Arquitetura e stack – eCondomínio

**Decisão (01/11/2026):** TypeScript full-stack com **Next.js na Vercel** e **Supabase** (Postgres, Auth, Storage, RLS). Monólito modular, multi-tenant desde o início.

## Por que não Django
Python na Vercel roda só como função serverless, sem workers. O Django exigiria hospedar o back em outro lugar (Railway/Render) e perderia a integração com Supabase Auth/RLS. Reavaliar se a equipe dominar Python bem melhor que TypeScript.

## Stack
| Camada | Escolha |
|---|---|
| Frontend + backend | **Next.js (App Router) + TypeScript**, server actions e route handlers |
| UI | Tailwind CSS (shadcn/ui quando necessário) |
| Banco | **Supabase Postgres**, região **São Paulo** |
| Auth | Supabase Auth (e-mail/senha, MFA para gestores) |
| Isolamento | **Row Level Security** por organização e condomínio |
| Arquivos | Supabase Storage (CNAB, boletos, relatórios) |
| Jobs em segundo plano | **Inngest** ou Trigger.dev (CNAB, envios, conciliação) |
| Pagamentos | Asaas/Iugu/Pagar.me com webhooks idempotentes |
| WhatsApp (fase 2) | Cloud API da Meta via provedor |
| E-mail | Resend ou Amazon SES |
| Validação | Zod |
| Testes | Vitest + testes de RLS no Postgres (pgTAP) |
| Observabilidade | Sentry |
| CI/CD | GitHub Actions + deploy Vercel |

## Multi-tenancy
- `organizacao` = administradora (ou condomínio autogerido).
- `condominio` pertence a uma organização.
- `membro_organizacao` (papel na organização) e `membro_condominio` (papel por condomínio).
- Todas as tabelas de negócio têm `condominio_id`. As policies RLS usam funções auxiliares `pode_ler_condominio()` e `pode_escrever_condominio()`.

## Modelo de dados (núcleo)
- Tenant: `organizacao`, `condominio`, `membro_organizacao`, `membro_condominio`
- Estrutura: `bloco`, `unidade`, `pessoa`, `vinculo_unidade`
- Financeiro: `conta_contabil`, `cota` (unidade/competência), `lancamento`, `pagamento`
- Garantidora: `garantidora`, `contrato_garantidora`, `antecipacao`, `repasse`
- Plataforma: `log_auditoria`

**Regras:** valores em **centavos** (`bigint`). Lançamentos e pagamentos **imutáveis**: correção por estorno. Eventos sensíveis gravam auditoria. Operações financeiras críticas rodam no servidor ou em funções SQL, nunca confiando no cliente.

## Cuidados específicos de Vercel + Supabase
- **Tempo limite de função:** CNAB e envios em massa vão para fila.
- **Webhooks:** idempotentes (chave do evento única).
- **Chave `service_role`:** só no servidor, nunca no navegador.
- **Região e LGPD:** dados em São Paulo; contrato e política de dados claros.
- **Custos:** acompanhar plano Pro do Supabase e custo de boleto/Pix/WhatsApp por unidade.

## Segurança e conformidade
- LGPD: base legal, consentimento, exportação e exclusão de dados.
- TLS e criptografia em repouso (padrão do Supabase); backups com teste de restauração.
- Testes automáticos de isolamento entre tenants.
- Regra de 1 acesso de morador por unidade na camada de domínio.

## Estrutura do repositório
```
econdominio/
  docs/                 documentação de produto e arquitetura
  supabase/migrations/  schema SQL + RLS
  src/app/              rotas Next.js
  src/lib/supabase/     clientes browser/server e middleware
  src/lib/dinheiro.ts   utilitários de centavos
```
