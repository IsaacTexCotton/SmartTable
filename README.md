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

**Nota sobre a URL de atualização**: `@updateURL`/`@downloadURL`/`@require`
apontam para a branch `main`.

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
4. `modulo4-atalhos-teclado.js` — fluxo por teclado (`Alt+letra`).
5. `modulo5-alerta-grupo.js` — avisa se outra empresa do mesmo grupo
   econômico também tem título vencido.
6. `modulo6-contexto-adicional.js` — lê Promessas e Contatos ao carregar a
   página do cliente, expõe `window.__contextoAdicional` para o Alt+A
   (mensagem personalizada) consultar sem custo extra. Também identifica o
   negociador logado (`#user-menu-btn`) pra saber se ELE já falou com aquele
   cliente e pra assinar a mensagem com o nome certo — nada de nome fixo no
   código.
7. `modulo7-fila-prioridade.js` — monta uma fila de atendimento ordenada por
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
pagamento, contexto de promessa de pagamento e cliente nunca contatado
por este negociador). Rode `npm test` antes de subir qualquer mudança em
`modulos/` —
esses testes já pegaram bugs reais nesta base de código (ex.: o bug crítico
de `normalizarData` corrigido no Módulo 0).
