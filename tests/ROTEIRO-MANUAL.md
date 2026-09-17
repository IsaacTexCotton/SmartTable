# Roteiro de teste manual — SmartTable

O que **não dá** para automatizar no jsdom: captura de imagem (html2canvas),
área de transferência, handoff pro app do WhatsApp, abas de fundo reais,
bloqueio de pop-up do Chrome e o layout de verdade. Tudo isso é verificado
aqui, à mão.

**Regra de ouro:** faça tudo isto num cliente de teste ou num cliente que
você já ia cobrar hoje de qualquer forma. Nada aqui deve virar mensagem
enviada por engano — o Alt+A **para** na caixa de observações, para revisão;
o envio só acontece no Alt+S.

---

## 1. Relatório (Alt+R)

| Pré-condição | Ação | O que observar | Como saber se falhou |
|---|---|---|---|
| Página de um cliente com título vencido | `Alt+R` | Botão vira "Gerando...", depois volta ao normal | Botão fica travado em "Gerando..." por mais de ~15s |
| idem | Após gerar | Imagem foi baixada E copiada pra área de transferência (cole num chat) | Download não aparece, ou Ctrl+V não cola imagem |
| Cliente com títulos em situações diferentes | Olhar o relatório | Vermelho = último dia, amarelo = cartório, índigo = SCPC | Cor não bate com a situação da tabela |
| Cliente com título "NÃO COBRAR" ou "CARTEIRA" | `Alt+R` | Banner fixo de aviso aparece; o título **não** sai no relatório | O título bloqueado aparece no relatório |

## 2. Mensagem personalizada (Alt+A)

| Pré-condição | Ação | O que observar | Como saber se falhou |
|---|---|---|---|
| Cliente com título vencido | `Alt+A` | Relatório gera, tela de contato abre, mensagem aparece escrita | Caixa fica vazia, ou com `{{alguma_coisa}}` visível |
| Qualquer cliente | Ler a mensagem inteira | Nenhuma frase se contradiz (ex.: agradecer pagamento e dizer "sem retorno") | Duas frases dizendo coisas opostas |
| Cliente nunca contatado por você | `Alt+A` | Mensagem começa com "Sou &lt;seu nome&gt; do financeiro..." | Nome errado, ou apresentação ausente |
| Cliente que você já contatou | `Alt+A` | **Não** tem linha de apresentação | Se apresenta de novo para quem já te conhece |
| Cliente com 2+ razões do grupo com vencido | `Alt+A` | Abas de fundo abrem, geram relatório e **fecham sozinhas** | Abas ficam abertas, ou o Chrome bloqueia pop-up (ver ícone na barra) |
| Cliente contatado ontem, sem título novo | `Alt+A` | Mensagem **sem** relatório (ele já viu) | Relatório repetido sem nada novo |
| Cliente que pagou um título desde ontem | `Alt+A` | Linha "Recebemos a baixa do título X, obrigado!" | Agradecimento ausente |
| idem, mas dê **F5** antes do Alt+A | `Alt+A` | Agradecimento **continua** aparecendo | Sumiu — era o bug corrigido na v1.4.0, teria voltado |

## 3. Registrar e enviar (Alt+S)

| Pré-condição | Ação | O que observar | Como saber se falhou |
|---|---|---|---|
| Mensagem revisada na caixa | `Alt+S` | Contato registra e o app do WhatsApp abre | Nada acontece, ou registra sem abrir |
| idem | Depois do app abrir | Fazer **Alt+Tab**: você volta pro CRM, **não** pra uma aba de WhatsApp | Volta numa guia de WhatsApp — regressão do fix da v1.1 |
| idem | Se o app abrir sem o texto | `Ctrl+V` cola a mensagem | Área de transferência vazia |
| Cliente com promessa registrada | Clicar num dos 3 botões de agendamento | Marca "Promessa de pagamento", preenche a frase e a data de hoje | Data não preenche, ou a promessa não é selecionada |

## 4. Filas (Alt+I / Alt+U / Alt+P / Alt+V)

| Pré-condição | Ação | O que observar | Como saber se falhou |
|---|---|---|---|
| Página de lista de clientes | `Alt+I` | Fila inicia e mostra o progresso | Nada acontece (ver console) |
| Fila iniciada | `Alt+P` duas vezes rápido | Avança **um** cliente por vez, não dois | Pula um cliente |
| Fila em andamento | `Alt+V` | Volta um cliente e desfaz a contagem | Contador não bate |
| Página de lista | `Alt+U` | Visita clientes em aba de fundo; pode levar minutos | Pop-up bloqueado, ou trava sem terminar |
| Fila de ontem salva | Abrir o CRM hoje | Fila antiga é descartada sozinha | Oferece continuar fila de ontem |

## 5. Atalhos e foco

| Pré-condição | Ação | O que observar | Como saber se falhou |
|---|---|---|---|
| Qualquer página do CRM | `Alt+H` | Painel de ajuda abre; `Alt+H` de novo fecha | Não fecha |
| Qualquer página | `Alt+B`, depois `Alt+B` | Busca abre e **fecha** | Não fecha com Alt+B (só com Esc) |
| Busca aberta, digitando | `Alt+S` | **Nada** acontece | Registrou e enviou no meio da pesquisa — grave |
| Depois de qualquer atalho | Apertar outro atalho | Funciona na hora | Segundo atalho "não pega" (foco preso num campo) |

## 6. Depois de atualizar a versão

| Pré-condição | Ação | O que observar | Como saber se falhou |
|---|---|---|---|
| Tampermonkey instalado | "Check for updates" | Versão nova aparece | Continua na anterior (confira `@version`) |
| Console do CRM aberto | Recarregar a página | `[SmartTable] vX.Y.Z carregado (7 módulos)` | Número de módulos menor que 7 |
| idem | Olhar o console | Nenhum erro vermelho nosso (`[Atalhos]`, `[Fila]`, `[Contexto Adicional]`) | Erro nosso no console |
