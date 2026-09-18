---
name: alternativa-mais-rapida
description: Planeja uma alternativa mais rápida para um trecho que já funciona, com a MESMA saída — medindo antes, provando a equivalência contra a suíte existente e deixando o caminho de volta pronto. Use quando algo do SmartTable estiver lento (Alt+U visitando ~140 clientes, Alt+A esperando relatório, varreduras de localStorage) e a pergunta for "dá pra fazer isso mais rápido sem mudar o resultado?". Não use para mudar comportamento, regra de negócio ou texto de cobrança — isso é feature, não otimização.
license: MIT
metadata:
  author: SmartTable (Isaac + Claude)
  version: "1.0.0"
  domain: performance
  triggers: lento, demora, otimizar, mais rápido, performance, alternativa, mesma saída, equivalente, custo, minutos
  role: specialist
  scope: planning
  output-format: plan
---

# Alternativa Mais Rápida

Planejar um caminho mais rápido para algo que **já funciona**, entregando
**exatamente a mesma saída**.

Esta skill é de PLANEJAMENTO. Ela termina num plano com número, prova de
equivalência e rollback — não num diff.

## Quando Usar

- Um atalho leva minutos e a pergunta é "dá pra ser mais rápido?"
- Uma rotina abre muitas abas de fundo, espera timeouts, ou varre a lista inteira
- Algo cresce com o volume da carteira (hoje ~140 clientes) e vai piorar

## Quando NÃO Usar

- A saída deve mudar → é **feature**, não otimização. Outro caminho.
- A ordem da fila mudaria → **a ordem É a saída** (a régua de prioridade é o
  produto do Módulo 7). Reordenar não é otimizar; é mudar o que o sistema faz.
- O texto que chega ao cliente mudaria, mesmo "só um pouco"
- Ninguém reclamou e não há medição → não existe problema ainda

## A Regra Central

> **"Mesma saída" não é opinião. É a suíte passando sem que nenhum teste tenha
> sido editado para acomodar a mudança.**

Editar um teste para a otimização passar é admitir que a saída mudou. Se um
teste precisa mudar, pare: isso virou feature e precisa de decisão do usuário.

## Fluxo

### 1. Medir antes de qualquer coisa

Sem número de partida não há otimização — há reescrita com esperança.

```js
// No console do CRM, antes de mexer em nada:
console.time('alvo'); /* dispara a ação */ console.timeEnd('alvo');
```

Registre: **tempo total**, **quantas iterações**, **tempo por iteração**.
Descubra onde o tempo realmente está. Neste projeto o suspeito quase sempre é
espera, não cálculo — `TIMEOUT_CLASSIFICACAO_MS: 8000` por cliente domina
qualquer micro-otimização de laço.

### 2. Registrar a saída atual

Antes de mudar, capture a saída real para comparar depois. Censurada, conforme
a regra permanente do projeto (ver `window.__diag` no Módulo 8).

### 3. Escolher o movimento — do mais barato ao mais arriscado

Sempre nesta ordem. O primeiro que resolver, ganha.

| # | Movimento | Pergunta | Exemplo real deste projeto |
|---|---|---|---|
| 1 | **Não fazer** | Isso precisa rodar agora? | Alt+U passou a CONTINUAR a fila de hoje em vez de refazer: ~140 visitas viraram zero (v1.16.0) |
| 2 | **Fazer menos** | Dá pra filtrar antes de gastar? | `filtrarPorRegrasDaLista` exclui pela lista, sem visitar ninguém |
| 3 | **Não esperar à toa** | O timeout é teto ou é o caso comum? | Esperar condição (`disabled === false`) em vez de `setTimeout` fixo (Alt+A, v1.5.x) |
| 4 | **Fazer em paralelo** | As iterações dependem umas das outras? | Abas de fundo do Alt+U são independentes entre si |
| 5 | **Fazer diferente** | O algoritmo é o gargalo? | Raro aqui. Só depois de descartar 1–4 |

**O movimento 1 é o que mais rende neste projeto, e é o mais esquecido.**
Antes de acelerar um trabalho, pergunte se ele precisava acontecer.

### 4. Provar a equivalência

Três provas, nesta ordem. Nenhuma é opcional.

1. **A suíte inteira passa, sem nenhum teste editado.** `npm run verificar`.
2. **Comparação diferencial contra dado real.** Rode o caminho antigo e o novo
   sobre a mesma entrada e compare as saídas item a item — não o total, os
   itens. Total igual com ordem trocada já aconteceu neste projeto.
3. **Mutação.** Quebre a versão nova de propósito e confirme que a suíte
   percebe. Se não percebe, a prova 1 não valia nada.

### 5. Deixar o caminho de volta

Otimização é a mudança que mais volta atrás. Antes de publicar:

- O que exatamente reverte isso? (um commit? um interruptor no Alt+O?)
- Como você perceberia que deu errado **em produção**, na cobrança do dia?
- Se a resposta for "eu não perceberia", o plano está incompleto.

## Restrições Específicas deste Projeto

### OBRIGATÓRIO

- Medir antes e depois, com número, no volume real (~140 clientes)
- Rodar `npm run verificar` inteiro — não só o arquivo que você mexeu
- Verificar por mutação, como todo o resto do projeto
- Respeitar a convenção de meio-dia (`normalizarData`) em qualquer data tocada
- Manter o orçamento de tela: otimização não ganha botão, painel nem atalho novo

### PROIBIDO

- Editar um teste para a versão otimizada passar
- Tocar Módulo 1 ou Módulo 2 sem confirmação explícita do usuário (protegidos)
- Trocar a ordem da fila em nome de velocidade
- Mudar qualquer frase que chegue ao cliente
- Publicar sem o número antes/depois no commit
- Declarar ganho a partir de uma única medição

## Formato de Entrega

O plano deve conter, nesta ordem:

1. **Linha de base** — o que é lento hoje, em segundos, e onde o tempo está
2. **A alternativa** — qual movimento da tabela, e por que os anteriores não servem
3. **Ganho estimado** — de X para Y, com a conta à vista
4. **Prova de equivalência** — quais testes cobrem, o que a comparação diferencial compara, qual mutação confirma
5. **Rollback** — como desfazer, e como você perceberia o erro na cobrança
6. **O que fica de fora** — o que a otimização NÃO resolve, dito na cara

## Alvos Conhecidos, Ainda Abertos

Anotados ao longo do desenvolvimento, sem plano ainda:

- **Alt+U reconstruindo**: ~140 clientes × até 8s. O caminho 1 (continuar)
  cobriu o caso comum na v1.16.0; o Shift+Alt+U continua pagando o preço cheio.
  Movimento 4 (paralelismo entre abas) nunca foi avaliado.
- **`Dt. pagamento` no DOM**: o Módulo 6 infere pagamento por retrato no
  `localStorage` porque a coluna não era legível. Ela apareceu no DOM em
  18/09/2026. Trocar inferência por dado real seria menos código e mais
  correto — mas é mudança de saída, então **não é caso desta skill**.
