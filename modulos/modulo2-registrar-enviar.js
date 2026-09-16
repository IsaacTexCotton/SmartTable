// ===== INICIO - Registrar e Enviar (contato padronizado) =====
//
// Adiciona um botao novo no modal "Registrar Contato", ao lado de
// "Salvar Contato". Ao clicar:
//
//   1. Calcula um resumo padronizado ("Enviado cobranca Xo dia.") a partir
//      da classificacao que o modulo de Aviso de Cobranca ja calcula.
//      Prioridade: titulo no ULTIMO_DIA (6o dia, fluxo cartorio) vence o
//      titulo mais vencido do cliente.
//   2. Registra o contato via API com esse resumo (canal=WHATSAPP,
//      resultado=REGISTRO), sem depender do formulario nem do texto que
//      esta na caixa de observacao.
//   3. Abre o WhatsApp com a mensagem que estava na caixa de observacao
//      (a frase padrao que o operador escolheu manualmente) - essa caixa
//      NAO e alterada por este script.
//
// Depende de duas coisas que ja existem na pagina:
//   - window.__avisoCobranca.simular()  (modulo de Aviso de Cobranca)
//   - window.abrirWhatsAppCliente()     (script proprio da pagina)
// Se qualquer uma faltar, o botao avisa e nao quebra o resto da tela.
//
(function () {
    'use strict';

    if (window.__registrarEEnviarInstalado) return;
    window.__registrarEEnviarInstalado = true;

    const ENDPOINT_CONTATOS = '/api/crm/contatos';

    // ============================================================
    // RESUMO PADRONIZADO
    // ============================================================

    function maiorAtraso(lista) {
        return lista.reduce((a, b) => (b.diasAtrasoReal > a.diasAtrasoReal ? b : a));
    }

    // Reaproveita a classificacao ja calculada pelo modulo de Aviso de
    // Cobranca, em vez de duplicar aqui o calculo de prazos e feriados.
    function calcularResumoPadronizado() {
        if (!window.__avisoCobranca || typeof window.__avisoCobranca.simular !== 'function') {
            console.warn('[registrar-enviar] Módulo de Aviso de Cobrança indisponível; usando resumo genérico.');
            return 'Enviado cobrança.';
        }

        let dados;
        try {
            dados = window.__avisoCobranca.simular();
        } catch (erro) {
            console.warn('[registrar-enviar] Falha ao classificar títulos:', erro);
            return 'Enviado cobrança.';
        }

        const registros = dados.registros || [];
        if (registros.length === 0) return 'Enviado cobrança.';

        // CORRIGIDO (bug real, relatado pelo usuário): o criterio antigo so
        // priorizava ULTIMO_DIA -- um titulo em NEGATIVADO_SCPC bem no 19o
        // dia (aviso de suspensao de cadastro) perdia pra qualquer outro
        // titulo do mesmo cliente com mais dias de atraso (ex.: ja em
        // EM_CARTORIO ha mais tempo), fazendo a nota do CRM (e a mensagem
        // do Modulo 4, que espelha esta logica de proposito) citar o
        // titulo errado -- sem nenhuma mencao ao aviso mais urgente do dia.
        // A janela de aviso SCPC (16 a 19 dias -- mesmos limiares do
        // Modulo 4, MANTER SINCRONIZADO se um dia mudarem) agora tem a
        // MESMA prioridade que ULTIMO_DIA.
        const emUltimoDia = registros.filter(r => r.situacaoKey === 'ULTIMO_DIA');
        let escolhido;
        if (emUltimoDia.length > 0) {
            escolhido = maiorAtraso(emUltimoDia);
        } else {
            const emAvisoSuspensaoScpc = registros.filter(
                r => r.situacaoKey === 'NEGATIVADO_SCPC' && r.diasAtrasoReal >= 16 && r.diasAtrasoReal <= 19
            );
            if (emAvisoSuspensaoScpc.length > 0) {
                escolhido = maiorAtraso(emAvisoSuspensaoScpc);
            } else {
                // CORRIGIDO (bug real, relatado pelo usuário): título já
                // EM_CARTORIO saiu da cobrança amigável -- a prioridade de
                // pagamento é sempre um título que AINDA NÃO foi pra
                // cartório, mesmo que ele tenha menos dias de atraso do que
                // o título em cartório. Sem essa regra, um título em
                // cartório há 45 dias vencia um título em atraso inicial há
                // apenas 3 dias só por ter mais dias, fazendo a nota do CRM
                // (e a mensagem do Módulo 4, que espelha esta lógica de
                // propósito) citar o título errado. Só cai pra um título em
                // cartório se literalmente não sobrar nenhum outro.
                const naoCartorio = registros.filter(r => r.situacaoKey !== 'EM_CARTORIO');
                escolhido = naoCartorio.length > 0 ? maiorAtraso(naoCartorio) : maiorAtraso(registros);
            }
        }

        return 'Enviado cobrança ' + escolhido.diasAtrasoReal + 'º dia.';
    }

    // ============================================================
    // FEEDBACK (toast proprio, nao bloqueante - sem alert())
    // ============================================================

    function toast(mensagem, tipo) {
        if (typeof window.showToast === 'function') {
            window.showToast(mensagem, tipo);
            return;
        }
        const cores = tipo === 'error'
            ? { fundo: '#FDF3F1', borda: '#E8C7BE', texto: '#8A2A16' }
            : { fundo: '#EFF6F1', borda: '#B9D9C4', texto: '#1B6B4A' };

        const el = document.createElement('div');
        el.textContent = mensagem;
        Object.assign(el.style, {
            position: 'fixed', bottom: '20px', left: '20px', zIndex: '999999',
            maxWidth: '360px', padding: '12px 16px', borderRadius: '8px',
            background: cores.fundo, border: '1px solid ' + cores.borda, color: cores.texto,
            fontSize: '13px', fontFamily: '-apple-system, Segoe UI, Arial, sans-serif',
            boxShadow: '0 4px 14px rgba(21,26,33,0.18)', lineHeight: '1.4',
            opacity: '0', transition: 'opacity 180ms ease-out'
        });
        document.body.appendChild(el);
        requestAnimationFrame(() => { el.style.opacity = '1'; });
        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 200);
        }, tipo === 'error' ? 6000 : 3500);
    }

    // ============================================================
    // ABRIR WHATSAPP E FECHAR A ABA DEPOIS (item pedido pelo usuário)
    // ============================================================

    const ATRASO_FECHAR_ABA_WHATSAPP_MS = 1500;

    function chamarWhatsAppEFecharAbaAutomaticamente() {
        // Retorna uma Promise que só resolve DEPOIS da aba fechar (ou depois
        // de confirmar que não havia aba pra fechar). Isso é essencial:
        // o location.reload() logo abaixo, no fluxo que chama esta função,
        // precisa esperar por isso -- senão a página recarrega e mata o
        // setTimeout do fechamento antes dele disparar (corrida descoberta
        // em produção: a aba nunca fechava porque o reload sempre vencia).
        return new Promise((resolve) => {
            // abrirWhatsAppCliente() (função própria da página, fora dos
            // nossos módulos) chama window.open(url, '_blank',
            // 'noopener,noreferrer'). Com "noopener", window.open sempre
            // retorna null -- não tem como recuperar a aba depois pra
            // fechar. Trocamos window.open só durante essa chamada
            // específica, tirando noopener/noreferrer, pra conseguir a
            // referência -- e restauramos o original logo em seguida,
            // síncrono, sem deixar a troca "vazando" pro resto da página.
            //
            // Troca de segurança consciente, confirmada com o usuário: por
            // um instante, a aba aberta (sempre wa.me, domínio da própria
            // Meta/WhatsApp) ganha uma referência de volta pro CRM via
            // window.opener. Risco considerado baixo.
            const openOriginal = window.open;
            let abaCapturada = null;

            window.open = function (url, nome, features) {
                const featuresSemNoopener = (features || '')
                    .split(',')
                    .map((f) => f.trim())
                    .filter((f) => f && f !== 'noopener' && f !== 'noreferrer')
                    .join(',');
                abaCapturada = openOriginal.call(window, url, nome, featuresSemNoopener);
                return abaCapturada;
            };

            try {
                window.abrirWhatsAppCliente();
            } finally {
                window.open = openOriginal; // restaura sempre, mesmo se der erro lá dentro
            }

            if (!abaCapturada) {
                // abrirWhatsAppCliente() pode ter retornado cedo (mensagem
                // vazia, telefone inválido) sem chamar window.open -- nesse
                // caso não existe aba pra fechar, e os avisos da própria
                // função já explicaram o motivo pro usuário. Nada a esperar.
                resolve();
                return;
            }

            // Atraso pra dar tempo do Chrome entregar a navegação pro app
            // desktop do WhatsApp antes de fechar a aba. Valor de partida --
            // ajustar se, na prática, fechar cedo ou tarde demais. Só
            // resolve a Promise DEPOIS de tentar fechar -- é isso que faz
            // quem chama esperar por esse tempo antes do reload.
            setTimeout(() => {
                try {
                    abaCapturada.close();
                } catch (erro) {
                    console.warn('[registrar-enviar] Não consegui fechar a aba do WhatsApp automaticamente:', erro.message);
                }
                resolve();
            }, ATRASO_FECHAR_ABA_WHATSAPP_MS);
        });
    }

    // ============================================================
    // ACAO DO BOTAO
    // ============================================================

    async function aoClicarRegistrarEEnviar(evento) {
        evento.preventDefault();
        const botao = evento.currentTarget;

        const textarea = document.getElementById('contato-resumo');
        const mensagem = textarea ? textarea.value.trim() : '';
        if (!mensagem) {
            toast('Selecione uma frase padrão (ou digite a mensagem) antes de registrar e enviar.', 'error');
            return;
        }

        const form = document.getElementById('form-contato');
        const inputCliente = form ? form.querySelector('[name="clienteCodigo"]') : null;
        const clienteCodigo = inputCliente ? inputCliente.value : null;
        if (!clienteCodigo) {
            toast('Não foi possível identificar o cliente. Recarregue a página.', 'error');
            return;
        }

        const checkFixar = document.getElementById('check-fixar-contato');
        const fixado = !!(checkFixar && checkFixar.checked);

        const rotuloOriginal = botao.textContent;
        botao.disabled = true;
        botao.style.opacity = '0.6';
        botao.style.cursor = 'wait';
        botao.textContent = 'Registrando...';

        try {
            const resumoPadronizado = calcularResumoPadronizado();

            const resposta = await fetch(ENDPOINT_CONTATOS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clienteCodigo,
                    canal: 'WHATSAPP',
                    resultado: 'REGISTRO',
                    resumo: resumoPadronizado,
                    fixado: fixado
                })
            });

            const tipoConteudo = resposta.headers.get('content-type') || '';
            if (!tipoConteudo.includes('application/json')) {
                throw new Error('Sessão expirada. Recarregue a página e faça login novamente.');
            }

            const json = await resposta.json();
            if (!resposta.ok || !json.success) {
                throw new Error((json.error && json.error.message) || json.message || 'Erro ao registrar contato.');
            }

            // Abre o WhatsApp com a mensagem que ja estava na caixa de
            // observacao (a frase padrao escolhida pelo operador). A caixa
            // nao foi alterada, entao a funcao da propria pagina le o texto
            // normalmente.
            if (typeof window.abrirWhatsAppCliente === 'function') {
                await chamarWhatsAppEFecharAbaAutomaticamente();
            } else {
                console.warn('[registrar-enviar] abrirWhatsAppCliente() não encontrada nesta página.');
                toast('Contato registrado, mas não foi possível abrir o WhatsApp automaticamente.', 'error');
            }

            toast('Contato registrado: "' + resumoPadronizado + '"', 'success');

            if (typeof window.closeModalContato === 'function') {
                window.closeModalContato();
            }

            // Mesma convencao do "Salvar Contato": recarrega para o novo
            // registro aparecer na aba Contatos/Timeline.
            window.location.hash = 'contatos';
            window.location.reload();

        } catch (erro) {
            console.error('[registrar-enviar]', erro);
            toast(erro.message || 'Não foi possível registrar o contato.', 'error');
            botao.disabled = false;
            botao.style.opacity = '';
            botao.style.cursor = 'pointer';
            botao.textContent = rotuloOriginal;
        }
    }

    // ============================================================
    // INSTALACAO DO BOTAO NO MODAL
    // ============================================================

    function criarBotao() {
        if (document.getElementById('btn-registrar-enviar')) return;

        const btnSalvar = document.getElementById('btn-salvar-contato');
        if (!btnSalvar || !btnSalvar.parentElement) return;

        const botao = document.createElement('button');
        botao.type = 'button';
        botao.id = 'btn-registrar-enviar';
        botao.textContent = 'Registrar e Enviar';
        botao.title = 'Registra um resumo padronizado e abre o WhatsApp com a mensagem selecionada.';
        botao.className = 'px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 ' +
                          'text-white rounded-lg font-semibold transition flex items-center gap-2';
        botao.addEventListener('click', aoClicarRegistrarEEnviar);

        // Insere entre "Cancelar" e "Salvar Contato", no mesmo grupo de botoes.
        btnSalvar.parentElement.insertBefore(botao, btnSalvar);
    }

    let _observerInstalacao = null;

    function instalar() {
        if (!document.body) {
            setTimeout(instalar, 100);
            return;
        }

        if (document.getElementById('btn-salvar-contato')) {
            criarBotao();
            return;
        }

        // O modal de contato normalmente ja esta no HTML desde o carregamento
        // da pagina, mas observa por seguranca caso isso mude no futuro.
        if (_observerInstalacao) return;
        _observerInstalacao = new MutationObserver(() => {
            if (document.getElementById('btn-salvar-contato')) {
                _observerInstalacao.disconnect();
                _observerInstalacao = null;
                criarBotao();
            }
        });
        _observerInstalacao.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
            if (_observerInstalacao) {
                _observerInstalacao.disconnect();
                _observerInstalacao = null;
            }
        }, 20000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', instalar);
    } else {
        instalar();
    }

})();
// ===== FIM - Registrar e Enviar (contato padronizado) =====
