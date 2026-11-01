# Escopo do MVP – eCondomínio

**Hipótese:** administradoras de condomínio que trabalham com **garantidora** pagam por um sistema que automatiza baixa, conciliação e repasse das cotas antecipadas, com visão consolidada de vários condomínios. Depois, o produto é simplificado para síndicos moradores de condomínios pequenos.

> Decisão (01/11/2026): começar por **administradoras com garantidora**; síndicos pequenos vêm na fase 3. Ajustar após as entrevistas.

## Perfis
- **Administradora:** gere vários condomínios, com equipe e permissões por condomínio.
- **Gestor** (síndico/subsíndico): acesso a um condomínio.
- **Morador:** 1 acesso por unidade (fase 2).

## Fase 1 – MVP (administradoras com garantidora)
| Módulo | Funcionalidades |
|---|---|
| Multi-condomínio | Organização (administradora), condomínios, equipe com papéis por condomínio |
| Cadastro e importação | Blocos, unidades, moradores/proprietários; **importação por planilha** (unidades, moradores, saldos iniciais) |
| Financeiro | Plano de contas, receitas e despesas, cotas por unidade/competência, baixa manual e por arquivo de retorno (CNAB), conciliação |
| **Garantidora** | Cadastro da garantidora e contrato por condomínio, marcação de cotas antecipadas, cálculo de repasse e saldo a receber/pagar, relatório de conciliação |
| Cobrança | Boleto/Pix via provedor de pagamentos, painel de inadimplência por condomínio e consolidado |
| Relatórios | Balancete por condomínio, consolidado da administradora, inadimplência, repasse da garantidora; exportação PDF/Excel |
| Plataforma | Login, perfis, trilha de auditoria, RLS por tenant, LGPD |

## Fase 2
- Portal do morador (balancete, 2ª via de boleto), 1 acesso por unidade
- Comunicação por WhatsApp e e-mail, convocação de reunião, régua de cobrança automática

## Fase 3 – síndicos de condomínios pequenos
- Cadastro self-service e onboarding em um dia
- Plano simples com preço fixo ou por unidade
- Fluxo simplificado do síndico morador

## Fase 4+
- Manutenção preventiva e corretiva com vencimentos legais
- Chamados com foto, assembleia digital, reservas, portaria
- Cotação de fornecedores, IA (resumo de balancete, ata, previsão de gastos), Open Finance

## Critérios de sucesso do piloto (90 dias)
- 1 a 2 administradoras com 5 ou mais condomínios cada em uso real
- Conciliação mensal da garantidora em metade do tempo anterior
- Dados históricos importados sem retrabalho manual relevante
- Pelo menos 1 administradora aceita pagar após o piloto

## Riscos e decisões em aberto
- **Migração de dados:** administradoras já têm sistema e histórico. A importação é recurso de primeira classe.
- **Regras da garantidora:** variam por empresa (taxa de antecipação, prazo, repasse). Levantar nas entrevistas e modelar de forma configurável.
- **Provedor de pagamentos:** Asaas, Iugu, Pagar.me ou banco com API; definir custo por boleto/Pix.
- **WhatsApp (fase 2):** API oficial cobra por conversa; calcular custo por unidade.
- **Contabilidade:** o MVP não substitui o contador.
- **Modelo de preço:** por condomínio ou por unidade (mercado: R$ 3 a R$ 15 por unidade). Ver `04-pesquisa-precos.md`.
- **Jurídico:** contrato com administradoras, termos e LGPD.

## Cronograma sugerido (1 a 2 devs)
| Semanas | Entrega |
|---|---|
| 1–2 | Entrevistas com administradoras e garantidoras, protótipo clicável |
| 3–4 | Base: auth, organizações, multi-condomínio, RLS, cadastros |
| 5–6 | Importação por planilha, plano de contas, cotas |
| 7–9 | Baixa (CNAB), boleto/Pix, inadimplência |
| 10–12 | Módulo garantidora, relatórios |
| 13+ | Piloto e ajustes |
