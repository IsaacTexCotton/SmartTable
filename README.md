# SmartTable — Automação de Cobrança (CRM TexCotton)

Scripts JavaScript injetados via **Local Overrides do Chrome DevTools** no
arquivo `smart-table.js`, servido pelo CRM interno (`texhub.texcotton.com.br`).
Automatiza o fluxo de cobrança: classifica títulos vencidos, gera relatório
visual, monta mensagem personalizada por WhatsApp, registra contato, percorre
uma fila de clientes sozinho, avisa sobre grupo econômico e promessas de
pagamento quebradas, bloqueia cobrança indevida, e roda quase inteiramente por
atalhos de teclado.

Este repositório existe para versionar os módulos — o uso real continua sendo
colar o conteúdo no Local Override do DevTools (ver `contexto-v7.md` para o
histórico completo de decisões, armadilhas e itens em aberto).

## Módulos (`modulos/`), colados nessa ordem no mesmo arquivo

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
   (mensagem personalizada) consultar sem custo extra.

Ver `contexto-v7.md` para fatos técnicos confirmados, armadilhas já
encontradas e itens em aberto — não redescobrir do zero.
