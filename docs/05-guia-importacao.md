# Guia de importação de unidades e proprietários

Use a planilha para cadastrar de uma vez todas as unidades e os proprietários de um condomínio.

**Arquivos** (em `public/`): `modelo-importacao-em-branco.xlsx` / `.csv` (só o cabeçalho) e `modelo-importacao.xlsx` / `.csv` (exemplo com dados fictícios: 3 blocos, 36 unidades). Para regenerar os `.xlsx` a partir dos CSV: `node scripts/gerar-modelos-xlsx.mjs`.

## Como preencher
| Coluna | Obrigatória | O que colocar |
|---|---|---|
| `bloco` | Não | Bloco ou torre. Deixe vazio se não houver. |
| `unidade` | **Sim** | Número do apartamento, casa ou sala (ex.: 101). |
| `nome` | Não | Nome do proprietário. Vazio = unidade vaga ou sem cadastro. |
| `documento` | Não | CPF ou CNPJ. Recomendado, pois identifica a mesma pessoa em várias unidades. |
| `email` | Não | E-mail válido. Usado nos comunicados. |
| `telefone` | Não | Com DDD, só números ou formatado. |
| `tipo` | Não | `proprietario` ou `inquilino` (também vale locatário). Vazio = proprietário. |
| `valor_cota` | Não | Valor mensal da cota **dessa unidade** (ex.: `450,00`; `1.250,50` e `450.50` também valem). Pode ser diferente em cada unidade. Reimportar atualiza o valor. |

## Regras
- Uma linha por **proprietário de cada unidade**.
- **Dois moradores na mesma unidade** (ex.: proprietário e inquilino): repita a unidade em duas linhas, cada uma com o seu `tipo`. O primeiro vira o responsável principal.
- **Um proprietário com várias unidades:** repita o mesmo `documento` (e nome) em cada unidade. Ele é cadastrado uma só vez.
- Sem `documento`, a pessoa é reconhecida pelo nome e e-mail.
- O mesmo par unidade + nome não pode aparecer duas vezes no arquivo.
- Limite de 2.000 linhas e 1 MB por arquivo.

## Formato do arquivo
- Envie **Excel (.xlsx)** ou **CSV**. O sistema lê a **primeira aba** do Excel. Arquivos `.xls` antigos não são aceitos: salve como `.xlsx`.
- **Formate CPF/CNPJ e telefone como Texto** no Excel, senão o Excel apaga zeros à esquerda. Os modelos `.xlsx` já vêm assim.
- Mantenha a linha de cabeçalho. Os nomes `apto`, `apartamento`, `torre`, `cpf`, `proprietario` e `celular` também são reconhecidos.
- CSV: separado por ponto e vírgula (vírgula também é aceita), em UTF-8. No Excel: *Salvar como → CSV UTF-8*. Os modelos CSV já vêm com BOM para o Excel exibir os acentos.

## Importar de novo é seguro
Reenviar a mesma planilha **não duplica** blocos, unidades nem pessoas, e uma mudança de `tipo` atualiza o vínculo existente. Dá para corrigir a planilha e importar outra vez.

## Se houver erros
A importação é "tudo ou nada": se alguma linha tiver problema, **nada é gravado** e a tela lista as linhas com o motivo (ex.: "Linha 12: e-mail inválido"). Corrija e envie de novo.

## Dados fictícios
Nomes, CPFs, e-mails e telefones do arquivo de exemplo são inventados. Apague o exemplo antes de usar com dados reais.
