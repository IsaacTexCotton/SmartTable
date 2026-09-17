// ==UserScript==
// @name         SmartTable — Automação de Cobrança TexCotton (estável)
// @namespace    https://github.com/IsaacTexCotton/SmartTable
// @version      1.11.2
// @description  Canal ESTÁVEL do SmartTable: os módulos vêm do branch `estavel`, não da branch main. Só muda quando uma versão nova é publicada de propósito.
// @author       Isaac
// @match        https://texhub.texcotton.com.br/crm/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/main/smart-table-estavel.user.js
// @downloadURL  https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/main/smart-table-estavel.user.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/estavel/modulos/modulo0-utilitarios-compartilhados.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/estavel/modulos/modulo1-aviso-cobranca.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/estavel/modulos/modulo2-registrar-enviar.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/estavel/modulos/modulo3-fila-atendimento.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/estavel/modulos/modulo7-fila-prioridade.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/estavel/modulos/modulo5-alerta-grupo.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/estavel/modulos/modulo4-atalhos-teclado.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/estavel/modulos/modulo6-contexto-adicional.js
// ==/UserScript==

// CANAL ESTÁVEL — é este que outra pessoa da equipe instala.
//
// A diferença pro smart-table.user.js está só nas URLs acima:
//
//   - @require apontam pro branch `estavel`, que só anda quando uma versão é
//     publicada de propósito. Um push em main não muda nada pra quem está
//     neste canal.
//   - @updateURL/@downloadURL apontam pra main, porque é assim que o
//     Tampermonkey descobre que existe versão nova. Este arquivo é o único
//     que muda em main numa publicação.
//
// POR QUE BRANCH E NÃO TAG (decisão registrada, com o custo à vista): tag é
// imutável, e era o desenho original. Mas a sessão que mantém este projeto
// consegue criar branches e NÃO consegue criar tags (403 do GitHub), então
// com tag toda publicação dependeria de uma ação manual do usuário. Com
// branch, publicar é automatizável de ponta a ponta.
//
// O que se perde: a garantia de que uma versão publicada nunca muda. O que
// se mantém, que era o objetivo real: este canal não se move quando o main
// anda. Só `npm run release` move o branch `estavel`.
//
// NÃO EDITAR À MÃO: o @version deste arquivo é reescrito por
// `npm run release -- <versao>` (scripts/release.js), e tests/wrappers.test.js
// falha se algo sair de sincronia com o smart-table.user.js.
