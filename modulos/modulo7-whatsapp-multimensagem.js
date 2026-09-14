// ===== INICIO - WhatsApp: uma mensagem por parágrafo =====
//
// Roda dentro do WhatsApp Web (site diferente do CRM -- por isso é um
// módulo separado com seu próprio @match). Recebe do Módulo 4 (CRM), via
// window.postMessage, a lista de parágrafos da mensagem personalizada, e
// vai preparando um de cada vez na caixa de digitação da conversa já
// aberta -- SEM apertar Enter sozinho: quem envia cada mensagem é o
// operador. Assim que detecta que a mensagem foi enviada (caixa esvaziou
// de novo), prepara o próximo parágrafo.
//
// Caixa de digitação confirmada no HTML real do WhatsApp Web (mandado
// pelo usuário): div contenteditable com
// data-testid="conversation-compose-box-input" (editor Lexical). Digitar
// nela usa document.execCommand('insertText', ...) -- é o jeito que
// editores desse tipo (Lexical/Draft.js) reconhecem como digitação de
// verdade, diferente de só trocar o textContent.
//
(function () {
    'use strict';

    if (location.hostname !== 'web.whatsapp.com') return;
    if (window.__whatsappMultiMensagemCarregado) return;
    window.__whatsappMultiMensagemCarregado = true;

    const ORIGEM_CRM = 'https://texhub.texcotton.com.br';
    const SELETOR_CAIXA_TEXTO = '[data-testid="conversation-compose-box-input"]';
    const TIMEOUT_CAIXA_TEXTO_MS = 15000;
    const INTERVALO_POLL_CAIXA_MS = 300;
    // Espera depois de detectar o envio, antes de digitar o próximo
    // parágrafo -- dá tempo do WhatsApp "assentar" a mensagem enviada.
    const ATRASO_ENTRE_MENSAGENS_MS = 500;

    function caixaEstaVazia(caixa) {
        return (caixa.textContent || '').trim() === '';
    }

    function aguardarCaixaTexto() {
        return new Promise((resolve) => {
            const prazoFinal = Date.now() + TIMEOUT_CAIXA_TEXTO_MS;
            (function tentar() {
                const caixa = document.querySelector(SELETOR_CAIXA_TEXTO);
                if (caixa) return resolve(caixa);
                if (Date.now() >= prazoFinal) return resolve(null);
                setTimeout(tentar, INTERVALO_POLL_CAIXA_MS);
            })();
        });
    }

    function inserirTexto(caixa, texto) {
        caixa.focus();
        // Seleciona tudo que já estiver na caixa (ex.: o "text=" do link,
        // usado como fallback) antes de digitar por cima.
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, texto);
    }

    // Espera a caixa esvaziar de novo (sinal de que a mensagem foi
    // enviada) depois de termos acabado de escrever algo nela.
    function aguardarEnvio(caixa) {
        return new Promise((resolve) => {
            let resolvido = false;
            const observer = new MutationObserver(() => {
                if (resolvido) return;
                if (caixaEstaVazia(caixa)) {
                    resolvido = true;
                    observer.disconnect();
                    resolve();
                }
            });
            observer.observe(caixa, { childList: true, subtree: true, characterData: true });
        });
    }

    async function processarFila(paragrafos) {
        if (!Array.isArray(paragrafos) || paragrafos.length === 0) return;

        const caixa = await aguardarCaixaTexto();
        if (!caixa) {
            console.warn('[WhatsApp Multi] Não encontrei a caixa de digitação a tempo -- confira se a conversa certa abriu.');
            return;
        }

        for (let i = 0; i < paragrafos.length; i++) {
            inserirTexto(caixa, paragrafos[i]);
            console.log(`[WhatsApp Multi] Parágrafo ${i + 1}/${paragrafos.length} pronto -- aperte Enter pra enviar.`);

            const ehUltimo = i === paragrafos.length - 1;
            if (!ehUltimo) {
                await aguardarEnvio(caixa);
                await new Promise((resolver) => setTimeout(resolver, ATRASO_ENTRE_MENSAGENS_MS));
            }
        }
    }

    window.addEventListener('message', (event) => {
        if (event.origin !== ORIGEM_CRM) return;
        if (!event.data || event.data.tipo !== 'smarttable-fila-whatsapp') return;

        if (event.source && typeof event.source.postMessage === 'function') {
            event.source.postMessage({ tipo: 'smarttable-fila-whatsapp-ack' }, event.origin);
        }
        processarFila(event.data.paragrafos);
    });
})();
// ===== FIM - WhatsApp: uma mensagem por parágrafo =====
