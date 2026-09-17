// ==UserScript==
// @name         SmartTable — Automação de Cobrança TexCotton (estável)
// @namespace    https://github.com/IsaacTexCotton/SmartTable
// @version      1.4.1
// @description  Canal ESTÁVEL do SmartTable: os módulos vêm de uma versão congelada (tag), não da branch main. Só muda quando uma versão nova é publicada de propósito.
// @author       Isaac
// @match        https://texhub.texcotton.com.br/crm/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/main/smart-table-estavel.user.js
// @downloadURL  https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/main/smart-table-estavel.user.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/v1.4.1/modulos/modulo0-utilitarios-compartilhados.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/v1.4.1/modulos/modulo1-aviso-cobranca.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/v1.4.1/modulos/modulo2-registrar-enviar.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/v1.4.1/modulos/modulo3-fila-atendimento.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/v1.4.1/modulos/modulo7-fila-prioridade.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/v1.4.1/modulos/modulo5-alerta-grupo.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/v1.4.1/modulos/modulo4-atalhos-teclado.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/v1.4.1/modulos/modulo6-contexto-adicional.js
// ==/UserScript==

// CANAL ESTÁVEL — é este que outra pessoa da equipe instala.
//
// A diferença pro smart-table.user.js está só nas URLs acima:
//
//   - @require apontam pra uma TAG (v1.4.1), que é imutável. Um push em main
//     não muda nada pra quem está neste canal.
//   - @updateURL/@downloadURL apontam pra main, porque é assim que o
//     Tampermonkey descobre que existe versão nova. Este arquivo é o único
//     que muda em main, e só quando `npm run release` roda.
//
// Ou seja: o dia a dia do desenvolvimento não chega aqui. Só chega uma
// versão publicada de propósito.
//
// NÃO EDITAR À MÃO: as URLs e o @version deste arquivo são reescritos por
// `npm run release -- <versao>` (scripts/release.js), e tests/wrappers.test.js
// falha se algo sair de sincronia com o smart-table.user.js.
