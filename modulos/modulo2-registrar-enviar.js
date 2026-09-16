// ===== INICIO - Registrar e Enviar (contato padronizado) =====
//
// Adiciona um botao novo no modal "Registrar Contato", ao lado de
// "Salvar Contato". Ao clicar:
//
//   1. Calcula um resumo padronizado ("Enviado cobranca Xo dia.") a partir
//      da classificacao que o modulo de Aviso de Cobranca ja calcula.
//      Prioridade: titulo no ULTIMO_DIA (6o dia, fluxo cartorio) vence o
//      titulo mais vencido do cliente. EXCECAO: cliente sem nenhum contato
//      registrado ainda registra "Primeiro contato - Tentativa" em vez do
//      dia de atraso (ver ehPrimeiroContato).
//   2. Registra o contato via API com esse resumo (canal=WHATSAPP,
//      resultado=REGISTRO), sem depender do formulario nem do texto que
//      esta na caixa de observacao.
//   3. Abre o WhatsApp com a mensagem que estava na caixa de observacao
//      (a frase padrao que o operador escolheu manualmente) - essa caixa
//      NAO e alterada por este script. A aba do WhatsApp usa um nome fixo
//      (NOME_JANELA_WHATSAPP) pra ser REAPROVEITADA a cada cobranca, em
//      vez de acumular uma aba nova por cliente (pedido do usuario).
//
// Depende de duas coisas que ja existem na pagina:
//   - window.__avisoCobranca.simular()  (modulo de Aviso de Cobranca)
//   - window.abrirWhatsAppCliente()     (script proprio da pagina)
// Se qualquer uma faltar, o botao avisa e nao quebra o resto da tela.
//
// Tambem adiciona, logo abaixo do botao "Atencao" (fora da secao de
// Promessa, a pedido do usuario), 3 botoes de agendamento rapido: cada um
// insere uma frase pronta na observacao (reaproveitando o mecanismo nativo
// de "Frases padrao" quando a frase ja existe la) e seleciona a data de
// hoje no campo "Data Prometida" da promessa, num clique so.
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

    // PEDIDO DO USUARIO: cliente sem NENHUM contato registrado ainda nao
    // esta em regua de cobranca -- registrar "Enviado cobranca Xo dia."
    // nesse caso conta uma historia errada no CRM (o dia de atraso do
    // titulo nao e o dia de cobranca do cliente). O Alt+A ja trata esse
    // caso na mensagem (so se apresenta e confirma o responsavel, ver
    // semContatoAnterior no Modulo 4), entao a nota do CRM passa a bater
    // com o que foi de fato enviado.
    //
    // semContatoAnterior vem do Modulo 6 (total de .contato-item na aba
    // Contatos === 0). Se o Modulo 6 nao estiver disponivel, cai no
    // comportamento de sempre -- este modulo nunca dependeu dele, entao a
    // ausencia nao pode quebrar nada.
    const RESUMO_PRIMEIRO_CONTATO = 'Primeiro contato - Tentativa';

    function ehPrimeiroContato() {
        return !!(window.__contextoAdicional && window.__contextoAdicional.semContatoAnterior);
    }

    // Reaproveita a classificacao ja calculada pelo modulo de Aviso de
    // Cobranca, em vez de duplicar aqui o calculo de prazos e feriados.
    function calcularResumoPadronizado() {
        if (ehPrimeiroContato()) return RESUMO_PRIMEIRO_CONTATO;

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
    // ABRIR WHATSAPP SEM ACUMULAR ABAS (item pedido pelo usuário)
    // ============================================================
    // ABORDAGEM ANTERIOR (removida a pedido do usuário -- não funcionava
    // na prática): tentar fechar a aba via window.close() depois de um
    // temporizador fixo (1.5s). Não é confiável quando o link dispara o
    // handoff pro app desktop do WhatsApp -- nesse caminho o Chrome mostra
    // um diálogo nativo ("Abrir WhatsApp Desktop?") que compete com esse
    // fechamento por script, e não há como saber de fora quando esse
    // diálogo foi respondido. O operador relatou a aba continuando aberta
    // (incomodando ao voltar pro CRM) mesmo depois do tempo de espera.
    //
    // ABORDAGEM NOVA: em vez de tentar ADIVINHAR quando fechar a aba, evita
    // que ela SE ACUMULE. abrirWhatsAppCliente() (função própria da
    // página, fora dos nossos módulos) sempre chama window.open(url,
    // '_blank', ...) -- e o alvo '_blank' SEMPRE abre uma aba NOVA a cada
    // chamada (comportamento padrão e documentado do navegador, não um
    // bug a corrigir). Interceptamos window.open só durante essa chamada
    // pra trocar o nome do alvo de '_blank' pra um nome FIXO
    // (NOME_JANELA_WHATSAPP) -- com nome fixo, o navegador REAPROVEITA a
    // mesma aba/janela em vez de abrir uma nova a cada cobrança (mesmo
    // mecanismo por trás de <a target="minha-aba">: nome repetido = mesma
    // aba, é assim que target funciona desde sempre). Resultado: nunca
    // mais que 1 aba de WhatsApp por vez, em vez de acumular uma por
    // cliente cobrado -- e ela é reciclada (navega pro próximo cliente),
    // não duplicada.
    //
    // BÔNUS: como não precisamos mais de uma referência pra fechar a aba
    // depois, não precisamos tirar "noopener,noreferrer" dos features (a
    // implementação antiga tirava, de propósito, só pra conseguir essa
    // referência) -- os features da página passam intactos, mais seguro
    // por padrão. E como não há mais nenhum temporizador, não há mais
    // corrida nenhuma com o location.reload() logo depois -- a função é
    // síncrona.
    const NOME_JANELA_WHATSAPP = 'smarttable-whatsapp';

    function abrirWhatsAppSemAcumularAbas() {
        const openOriginal = window.open;

        window.open = function (url, _nomeIgnorado, features) {
            return openOriginal.call(window, url, NOME_JANELA_WHATSAPP, features);
        };

        try {
            window.abrirWhatsAppCliente();
        } finally {
            window.open = openOriginal; // restaura sempre, mesmo se der erro lá dentro
        }
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
                abrirWhatsAppSemAcumularAbas();
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
    // AGENDAMENTO RAPIDO (observacao + data de pagamento = hoje)
    // ============================================================
    // PEDIDO DO USUARIO: 3 botoes com frases prontas pra quando o cliente
    // ja avisou algo sobre o pagamento (comprovante, confirmacao verbal ou
    // agendamento) -- cada um preenche a observacao com a frase certa E
    // seleciona a data de hoje no campo "Data Prometida" da promessa, sem
    // precisar digitar nem abrir o seletor de data manualmente.

    const FRASES_AGENDAMENTO_RAPIDO = [
        { rotulo: 'Comprovante enviado', frase: 'Cliente enviou comprovante de pagamento.' },
        { rotulo: 'Cliente informou que pagou', frase: 'Cliente informou que pagou' },
        { rotulo: 'Pagamento agendado', frase: 'Cliente agendou o pagamento.' }
    ];

    function dataDeHojeIso() {
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const dia = String(hoje.getDate()).padStart(2, '0');
        return ano + '-' + mes + '-' + dia;
    }

    // Reaproveita o botao nativo de "Frases padrao" quando a frase ja existe
    // la (confirmado com o usuario: as 3 frases usadas aqui ja existem) --
    // evita duplicar o comportamento de insercao (separador, formatacao)
    // que nao e nosso. Comparacao exata em vez de selecionar por atributo
    // (title) pra nao precisar escapar aspas/caracteres especiais da frase.
    function encontrarBotaoFraseNativo(frase) {
        const botoes = document.querySelectorAll('.btn-inserir-frase');
        for (let i = 0; i < botoes.length; i++) {
            if (botoes[i].title === frase) return botoes[i];
        }
        return null;
    }

    function inserirFraseNaObservacao(frase) {
        const botaoNativo = encontrarBotaoFraseNativo(frase);
        if (botaoNativo) {
            botaoNativo.click();
            return;
        }

        // Fallback defensivo, caso a frase deixe de existir na lista nativa
        // -- ainda funciona (acrescenta na observacao), so sem o
        // comportamento exato que a lista nativa teria.
        console.warn('[registrar-enviar] Frase "' + frase + '" não encontrada nas Frases padrão -- inserindo direto na observação.');
        const textarea = document.getElementById('contato-resumo');
        if (!textarea) return;
        const atual = textarea.value.trim();
        textarea.value = atual ? atual + '\n' + frase : frase;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function selecionarDataDePagamentoHoje() {
        const inputData = document.getElementById('input-data-promessa');
        if (!inputData) return;
        inputData.value = dataDeHojeIso();
        // Dispara o onchange nativo (atualizarValorPromessaContato) -- sem
        // isso, o "Valor calculado" (saldo + juros/multa até a data) fica
        // desatualizado, porque so recalcula em resposta a esse evento.
        inputData.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // BUG REAL (relatado pelo usuário): os botões preenchiam a observação e
    // a data, mas a seção de promessa (com a lista de títulos pra marcar)
    // só aparece depois de selecionar "Promessa de Pagamento" como
    // resultado do contato -- sem isso, o campo de data ficava preenchido
    // só que escondido, e não dava pra selecionar título nenhum. Clica no
    // botão nativo de resultado (mesmo que um clique manual do operador
    // faria) pra abrir a seção antes de preencher o resto.
    function selecionarResultadoPromessaDePagamento() {
        const botaoResultado = document.getElementById('btn-resultado-PROMESSA_PAGAMENTO');
        if (!botaoResultado) return;
        botaoResultado.click();
    }

    function aoClicarAgendamentoRapido(frase) {
        selecionarResultadoPromessaDePagamento();
        inserirFraseNaObservacao(frase);
        selecionarDataDePagamentoHoje();
        toast('Promessa de Pagamento selecionada, observação preenchida e data definida para hoje.', 'success');
    }

    function criarBotoesAgendamentoRapido() {
        if (document.getElementById('agendamento-rapido-wrap')) return;

        const btnAtencao = document.getElementById('btn-resultado-ATENCAO');
        if (!btnAtencao || !btnAtencao.parentElement) return;

        // NOTA: classes Tailwind aqui sao restritas de proposito as que ja
        // aparecem literalmente em algum lugar do HTML real da pagina
        // (confirmado via diagnostico ao vivo) -- o build do CRM e
        // pre-compilado e purgado, e uma classe que nenhum template do
        // servidor usa simplesmente nao existe no CSS final, sem erro
        // nenhum (ja aconteceu de verdade neste projeto com "h-64", ver
        // comentario no HTML de Frases padrao). Por isso "indigo-200"/
        // "indigo-50"/"indigo-900" (usados em #valores-por-razao-wrap) e o
        // hover "yellow-400"/"yellow-50" (usado em .resultado-btn,
        // .canal-btn e no proprio botao Atencao) -- nunca uma cor nova so
        // porque "combinaria melhor".
        const wrap = document.createElement('div');
        wrap.id = 'agendamento-rapido-wrap';
        wrap.className = 'mt-2 border-t border-gray-100 space-y-2';

        const rotulo = document.createElement('label');
        rotulo.className = 'block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1';
        rotulo.textContent = 'Agendar pagamento (observação + data de hoje)';
        wrap.appendChild(rotulo);

        FRASES_AGENDAMENTO_RAPIDO.forEach(function (item) {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.className = 'w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-indigo-200 ' +
                              'bg-indigo-50 text-indigo-900 text-xs font-medium text-left transition ' +
                              'hover:border-yellow-400 hover:bg-yellow-50';
            botao.title = item.frase + ' (e seleciona a data de hoje)';

            const icone = document.createElement('span');
            icone.textContent = '📅';
            icone.className = 'flex-shrink-0';

            const texto = document.createElement('span');
            texto.textContent = item.rotulo;

            botao.appendChild(icone);
            botao.appendChild(texto);
            botao.addEventListener('click', function () {
                aoClicarAgendamentoRapido(item.frase);
            });

            wrap.appendChild(botao);
        });

        btnAtencao.parentElement.insertBefore(wrap, btnAtencao.nextSibling);
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
            criarBotoesAgendamentoRapido();
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
                criarBotoesAgendamentoRapido();
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
