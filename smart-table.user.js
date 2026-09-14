// ==UserScript==
// @name         SmartTable — Automação de Cobrança TexCotton
// @namespace    https://github.com/IsaacTexCotton/SmartTable
// @version      1.0.1
// @description  Automação do fluxo de cobrança no CRM TexCotton: classificação de títulos vencidos, relatório, registrar e enviar, fila de atendimento, atalhos de teclado, alerta de grupo econômico e contexto adicional (promessas/contatos).
// @author       Isaac
// @match        https://texhub.texcotton.com.br/crm/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/claude/new-session-37eexq/smart-table.user.js
// @downloadURL  https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/claude/new-session-37eexq/smart-table.user.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/claude/new-session-37eexq/modulos/modulo1-aviso-cobranca.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/claude/new-session-37eexq/modulos/modulo2-registrar-enviar.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/claude/new-session-37eexq/modulos/modulo3-fila-atendimento.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/claude/new-session-37eexq/modulos/modulo4-atalhos-teclado.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/claude/new-session-37eexq/modulos/modulo5-alerta-grupo.js
// @require      https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/claude/new-session-37eexq/modulos/modulo6-contexto-adicional.js
// ==/UserScript==

// Este arquivo é só o "invólucro" do Tampermonkey (metadados + @require dos
// módulos reais, que continuam em modulos/*.js — fonte única de verdade).
// Não colar lógica aqui: qualquer mudança de comportamento deve ir no módulo
// correspondente em modulos/, e este arquivo só precisa de @version novo
// pra distribuir a atualização pro time.
