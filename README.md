# SmartTable — Automação de Cobrança (CRM TexCotton)

Scripts JavaScript injetados via **Local Overrides do Chrome DevTools** no
arquivo `smart-table.js`, servido pelo CRM interno (`texhub.texcotton.com.br`).
Automatiza o fluxo de cobrança: classifica títulos vencidos, gera relatório
visual, monta mensagem personalizada por WhatsApp, registra contato, percorre
uma fila de clientes sozinho, avisa sobre grupo econômico e promessas de
pagamento quebradas, bloqueia cobrança indevida, e roda quase inteiramente por
atalhos de teclado.

Este repositório existe para versionar os módulos. Há duas formas de rodar:

## Opção 1: Tampermonkey (recomendado, permite distribuir pro time)

1. Instale a extensão [Tampermonkey](https://www.tampermonkey.net/) no Chrome.
2. Clique em `smart-table.user.js` neste repo → "Raw" → o Tampermonkey abre a
   tela de instalação automaticamente. Confirme.
3. Pronto — o script busca os módulos direto de `modulos/*.js` via `@require`.
   Quando um módulo for atualizado neste repo, basta subir o `@version` em
   `smart-table.user.js` (e dar "Check for updates" no Tampermonkey, ou
   esperar a checagem automática) pra todo mundo receber a versão nova, sem
   reenviar arquivo.

**Pendente de confirmar em uso real**: o Tampermonkey roda scripts num
contexto isolado por padrão; `@grant none` (já configurado) deveria expor o
mesmo `window` da página, necessário pra `window.showTab`,
`window.abrirWhatsAppCliente`, `window.__avisoCobranca` etc. funcionarem —
mas isso ainda não foi testado no CRM real, só documentado como expectativa.

**Repositório público**: este repo precisou ser tornado público para que
`raw.githubusercontent.com` sirva os arquivos sem autenticação (Tampermonkey
não envia credenciais). O código não contém segredos/credenciais, mas expõe
publicamente seletores, endpoints e regras de negócio do CRM interno — decisão
já tomada e confirmada.

## Dois canais: desenvolvimento e estável

Existem **dois** arquivos de instalação, e cada pessoa escolhe um:

| Canal | Arquivo | De onde vêm os módulos | Para quem |
|---|---|---|---|
| Desenvolvimento | `smart-table.user.js` | branch `main` | Quem desenvolve (Isaac) |
| Estável | `smart-table-estavel.user.js` | tag congelada (`v1.4.1`) | O resto da equipe |

**Por que isso existe**: antes, os `@require` apontavam só para `main` — ou
seja, **todo `git push` ia para o navegador de todo mundo** na checagem
seguinte do Tampermonkey. Sem homologação e sem rollback. Com um usuário só
isso era quase inofensivo; com duas pessoas, um push quebrado interrompe a
cobrança de alguém que não faz ideia do porquê.

No canal estável, os `@require` apontam para uma **tag**, que é imutável.
Trabalho do dia a dia em `main` não chega lá. Só chega uma versão publicada
de propósito. Os `@updateURL` continuam em `main` nos dois canais — é por
eles que o Tampermonkey descobre que saiu versão nova.

### Publicar uma versão nova no canal estável

```
npm run release -- 1.5.0
```

O script recusa publicar se: a árvore estiver suja, a versão pedida não bater
com o `@version` do `smart-table.user.js` e o `VERSAO_SMARTTABLE` do Módulo 6,
a tag já existir, ou a suíte falhar. Passando por tudo isso, ele reaponta os
`@require` do canal estável para a tag nova, commita e cria a tag localmente —
e imprime o comando de `push`, que fica com você (tag publicada é chata de
desfazer).

`tests/wrappers.test.js` trava os dois canais em sincronia: mesma lista de
módulos, mesma ordem, nenhum módulo órfão em `modulos/`, e o estável nunca
apontando para `main`. É o erro que não quebraria nada visivelmente — só
faria duas pessoas rodarem código diferente.

## Medindo se a régua de prioridade funciona

O Módulo 8 grava três eventos: a atribuição de fila (faixa, posição, grupo),
a cobrança efetivamente enviada (com a hora) e a baixa detectada. Para ver:

```js
window.__diario.relatorio()        // análise no console
window.__diario.exportar()         // baixa o JSON, pra juntar os dados de duas máquinas
```

**A tabela por faixa não responde se a régua é boa.** As faixas contêm
clientes diferentes por construção — quem está 2 dias atrasado paga mais que
quem está 30 em qualquer ordem que você ligue. Ela serve para ver cobertura:
quais faixas nunca são chamadas.

**O grupo de controle está DESLIGADO** (`ATIVAR_GRUPO_CONTROLE: false` no
Módulo 8). A fila sai 100% na ordem da régua. Decisão do usuário, e a conta
que a motivou: gravar é de graça e sem risco, mas reordenar 20% da fila tem
um custo que se paga TODO DIA — ~18 dos ~92 clientes chamados fora da ordem —
enquanto o benefício só chega em semanas, e só se alguma decisão for tomada a
partir do resultado.

Com ele desligado, o diário continua respondendo as perguntas **descritivas**
(cobertura por faixa, quais faixas nunca são chamadas, o que cai em "Demais
dias"). O que se perde é a pergunta **causal** — "a ordem da régua ajuda?" —
que só o grupo de controle responde, porque as faixas contêm clientes
diferentes por construção.

Para religar:

```js
window.__diario.limpar()   // não misture período com e sem experimento
window.__diario.CONFIG_DIARIO.ATIVAR_GRUPO_CONTROLE = true
```

Ligado, 1 em cada 5 clientes recebe posição sorteada **no espaço das
posições**, não das faixas — essa distinção importa: a primeira versão
sorteava no espaço das faixas e, como a faixa 10 sozinha era 27% de uma fila
real, o controle nunca alcançava o fim dela (12% no terço final em vez de
33%). O sorteio é determinístico por (cnpj, dia): rodar o Alt+U duas vezes no
mesmo dia não remexe o experimento, e nenhum cliente fica preso no controle.

**"Pagou" é inferência** — o que o sistema vê é título que sumiu da lista de
vencidos. Renegociação e baixa manual dão o mesmo sinal.

Os dados ficam no `localStorage` de cada navegador, com 120 dias de retenção
(~3 MB no volume atual). Não se juntam sozinhos entre duas pessoas.

## Diagnóstico censurado (`window.__diag`)

Qualquer informação tirada do console pra colar num chat, e-mail ou print sai
por aqui — **já censurada**, sem depender de alguém lembrar de apagar o CNPJ:

```js
window.__diag.fila()      // a fila do dia: faixa, posição, situação, dias
window.__diag.grupo()     // alerta de grupo econômico + estado visual do banner
window.__diario.exportar()  // censurado por padrão
```

O que é **preservado**, porque é o que serve pra diagnosticar: identidade
estável (o mesmo cliente vira sempre o mesmo apelido, o que permite detectar
duplicata e cruzar eventos), o **formato** dos valores (`R$ #.###,##`, que
revela erro de parsing sem revelar o valor), e tamanhos, contagens, situações,
faixas e datas.

**Ressalva honesta:** isto é pseudonimização, não anonimato criptográfico. O
apelido é um hash com sal aleatório guardado só naquele navegador — o objetivo
é não vazar dado de cliente por descuido, não resistir a adversário
determinado. Pra exportar com CNPJ de verdade (uso interno, nunca pra fora):
`window.__diario.exportar({ censurado: false })`.

## Autoconferência (`window.__conferir()`)

Rode no console depois de um Alt+U. Ela checa **invariantes contra o estado
real** — a fila salva, o diário de hoje, o contexto — e aponta o que estiver
quebrado:

```
[Conferência] 14 checagens, nenhum problema.
```

**Por que existe, e por que não é "mais um teste":** as quatro falhas que
chegaram a atrapalhar a cobrança de verdade não foram pegas pela suíte. Foram
pegas quando o operador exportou a fila e alguém olhou — a régua reordenando
errado, o grupo de controle nunca alcançando o fim da fila, o Alt+U gravando
tudo duas vezes, o Alt+A não gerando relatório. Todas invisíveis em jsdom,
porque moram em código que abre aba de fundo e depende de dado real.

Ela não substitui `npm test` — cobre justamente o que ele não alcança.

## Integração contínua

`.github/workflows/testes.yml` roda `npm ci`, `npm run lint` e `npm test` em
todo push para `main` e em todo pull request. Localmente, `npm run verificar`
roda os três na mesma ordem.

O primeiro passo (`npm run lock`, que é `npm ci --dry-run`) existe porque essa
falha é **invisível localmente**: `npm test` usa o `node_modules` que já está
instalado e passa alegremente com o `package-lock.json` dessincronizado do
`package.json`. Só o `npm ci` do CI reclama — e foi o que aconteceu ao
adicionar o ESLint com `--no-save`: quatro runs seguidos morreram em 10
segundos sem rodar um teste sequer. Custa meio segundo.

**Sobre o alcance do lint, sem ilusão:** das quatro falhas que chegaram a
atrapalhar a cobrança, o ESLint não teria pegado nenhuma — são de contrato
entre módulos e de lógica, não de sintaxe. Ele está configurado só com regras
que apontam defeito (variável morta, global não declarada, caso duplicado,
código inalcançável), nunca estilo, e os módulos protegidos ficam de fora das
regras que não se pode corrigir neles. É um piso barato, não a rede
principal. Antes disso, as asserções só valiam se alguém lembrasse de
rodar a suíte à mão antes de empurrar.

**Nota sobre a URL de atualização**: no canal de desenvolvimento,
`@updateURL`/`@downloadURL`/`@require` apontam para a branch `main`.

## Versionamento

`@version` em `smart-table.user.js` segue `MAJOR.MINOR.PATCH`, com critério
fixo (decidido com o usuário) — em caso de dúvida entre duas categorias,
sempre a MAIS ALTA das duas, nunca a mais baixa:

- **PATCH** (`1.0.x`) — só correção de bug, ajuste de texto/frase, ajuste
  visual (cor, espaçamento) ou refino de teste, sem mudar o que o script FAZ.
  Ex.: corrigir uma frase que saía sem informação, corrigir um banner que
  ficava por cima do modal errado.
- **MINOR** (`1.x.0`) — qualquer atalho, botão, critério de faixa/prioridade
  ou regra de negócio NOVA, e qualquer REORDENAÇÃO/redesenho de uma regra já
  existente (mesmo sem adicionar um recurso novo — mudar a ordem da régua de
  prioridade É uma mudança de comportamento observável, não um ajuste).
  Ex.: os 3 botões de agendamento rápido, a deduplicação por grupo
  econômico, a reordenação da régua de prioridade.
- **MAJOR** (`x.0.0`) — só quando exige atenção do usuário ANTES de
  atualizar: muda o formato salvo no `localStorage` de forma incompatível
  com filas/retratos já salvos, remove ou remapeia um atalho existente, ou
  muda uma mensagem automática de um jeito que o usuário não controla mais
  (ex.: passa a enviar sem revisão manual). Nunca por acúmulo de MINORs --
  só por uma mudança que quebra ou exige leitura do changelog antes de usar.

`VERSAO_SMARTTABLE` no Módulo 6 é bumpado em lockstep, sempre.

## Opção 2: Local Overrides do Chrome DevTools (forma original)

Colar o conteúdo dos 6 módulos, nessa ordem, no Local Override do arquivo
`smart-table.js` servido pelo CRM. Só funciona na máquina onde foi colado, e
exige o DevTools aberto. Ver `contexto-v7.md` para o histórico completo de
decisões, armadilhas e itens em aberto.

## Módulos (`modulos/`), colados nessa ordem no mesmo arquivo

0. `modulo0-utilitarios-compartilhados.js` — funções e constantes usadas por
   2+ módulos (normalização de data, toast, `escolherTituloRepresentativo`,
   limiares de aviso SCPC etc.), extraídas depois de uma auditoria apontar
   duplicação real. Precisa carregar ANTES de todos os outros. Módulo 1 e 2
   (protegidos) mantêm suas próprias cópias locais, de propósito.
1. `modulo1-aviso-cobranca.js` — classifica títulos vencidos, gera relatório
   em imagem, expõe `window.__avisoCobranca`. **Não editar sem confirmação
   explícita do usuário** (não foi escrito por Claude originalmente).
2. `modulo2-registrar-enviar.js` — botão "Registrar e Enviar" no modal de
   contato. `POST /api/crm/contatos`, abre WhatsApp e fecha a aba sozinho.
   **Não editar sem confirmação explícita do usuário.**
3. `modulo3-fila-atendimento.js` — percorre a lista de clientes sozinha,
   priorizada por urgência, avança automaticamente após cada registro.
4. `modulo4-atalhos-teclado.js` — fluxo por teclado (`Alt+letra`). Inclui o
   log de atualização (`Alt+L`), cuja lista `LOG_ATUALIZACOES` **precisa ser
   atualizada a cada bump de versão** — `tests/changelog.test.js` falha se a
   versão do topo divergir de `VERSAO_SMARTTABLE`.
5. `modulo5-alerta-grupo.js` — avisa se outra empresa do mesmo grupo
   econômico também tem título vencido.
6. `modulo6-contexto-adicional.js` — lê Promessas e Contatos ao carregar a
   página do cliente, expõe `window.__contextoAdicional` para o Alt+A
   (mensagem personalizada) consultar sem custo extra. Também identifica o
   negociador logado (`#user-menu-btn`) pra saber se ELE já falou com aquele
   cliente e pra assinar a mensagem com o nome certo — nada de nome fixo no
   código.
8. `modulo8-diario.js` — registra o que aconteceu (atribuição de fila com
   faixa e posição, cobrança enviada com hora, e baixa detectada), pra
   permitir responder se a régua de prioridade do Alt+U funciona. Inclui o
   **grupo de controle**: 1 em cada 5 clientes recebe posição sorteada em vez
   da posição pela faixa — sem isso, comparar faixa 3 com faixa 9 mede o
   cliente, não a régua. Carrega logo depois do Módulo 0; os módulos 3, 6 e 7
   dependem dele. Análise em `window.__diario.relatorio()`.
7. `modulo7-fila-prioridade.js` — a régua tem uma lacuna **intencional**: o
   5º dia de atraso não pertence a nenhuma faixa própria (o dia 2 tem a P3, os
   dias 3-4 têm a P9) e cai em "Demais dias". Confirmado com o usuário; não
   tratar como bug. Monta uma fila de atendimento ordenada por
   uma régua de prioridade de negócio (Alt+U), visitando cada candidato em
   aba de fundo pra classificar a situação real do título e a promessa de
   pagamento ativa (quem prometeu pagar hoje ou quebrou a promessa sobe na
   fila), e deduplicando por grupo econômico.

Ver `contexto-v7.md` para fatos técnicos confirmados, armadilhas já
encontradas e itens em aberto — não redescobrir do zero.

## Testes (`tests/`)

Testes de regressão em Node + jsdom que rodam contra o código REAL de
`modulos/*.js` (nunca reimplementações à parte), usando os hooks de
depuração que os próprios módulos já expõem (`window.filaDebug`,
`window.__avisoCobranca`, `window.__contextoAdicionalDebug`,
`window.filaPrioridadeDebug`, `window.__atalhosDebug`).

```
npm install
npm test
```

Cada `tests/*.test.js` cobre um módulo (fila de atendimento, mensagens do
Alt+A, fila por prioridade, snapshot de pagamento, contato recente,
aviso de não cobrar, alerta de grupo econômico, geração de relatório de
outras razões, resumo do "Registrar e Enviar", agendamento rápido de
pagamento, contexto de promessa de pagamento, cliente nunca contatado
por este negociador, omissão do relatório em recontato, substituição de
variáveis `{{ }}`/concordância de plural/busca rápida, classificação de
títulos do Módulo 1 — prazos, feriados e as 6 situações —, a consistência
entre os dois wrappers do Tampermonkey, e o diário de cobrança incluindo a
independência do grupo de controle em relação à faixa). Rode `npm test`
antes de subir qualquer mudança em `modulos/` —

O que não roda no jsdom (captura de imagem, área de transferência, handoff
pro app do WhatsApp, abas de fundo reais, bloqueio de pop-up) está em
`tests/ROTEIRO-MANUAL.md`, como checklist passo a passo.
esses testes já pegaram bugs reais nesta base de código (ex.: o bug crítico
de `normalizarData` corrigido no Módulo 0).

**Regra de fixture (aprendida do jeito difícil)**: teste de um módulo que
consome contexto de OUTRO (ex.: Módulo 4 lendo `window.__contextoAdicional`
do Módulo 6) não escreve esse objeto à mão — pede pro módulo real produzir,
via `tests/helpers/contexto-real.js`. Uma fixture escrita à mão com a data à
meia-noite, enquanto o Módulo 6 entrega meio-dia, deixou um teste de
regressão VERDE por semanas com o bug vivo em produção: os dois erros se
cancelavam dentro do teste.
