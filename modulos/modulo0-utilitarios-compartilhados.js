/* =========================================================================
 * MÓDULO 0: UTILITÁRIOS COMPARTILHADOS — CRM TexCotton
 * -------------------------------------------------------------------------
 * Funções e constantes usadas por 2+ módulos, extraídas pra um único lugar
 * depois de uma auditoria (/code-reviewer) apontar duplicação real:
 *   - normalizarData: existia em 3 cópias (Módulo 1, Módulo 6, Módulo 7) --
 *     a do Módulo 7 usava meia-noite (setHours(0,0,0,0)) em vez de meio-dia
 *     como as outras duas, causando um BUG REAL: uma promessa datada pra
 *     HOJE podia ser tratada como "futura" só pelo Módulo 7, excluindo o
 *     cliente da Fila por Prioridade por engano.
 *   - toast: existia em 3 cópias (Módulo 2, Módulo 3, Módulo 7), pixel a
 *     pixel idênticas.
 *   - esperar: existia em 2 cópias (Módulo 4, Módulo 7).
 *   - montarUrlCliente: existia em 2 cópias (Módulo 3, Módulo 5).
 *   - escolherTituloRepresentativo/maiorAtraso: a mesma regra de negócio
 *     (qual título "representa" o cliente pra nota do CRM e pra mensagem)
 *     existia em 3 cópias (Módulo 2, Módulo 4, Módulo 7), incluindo os
 *     limiares de dias do aviso de suspensão SCPC.
 *
 * Onde colar: PRIMEIRO módulo no @require do wrapper -- todos os outros
 * dependem de window.__smartTableUtil já existir quando executam.
 *
 * Módulo 1 e Módulo 2 são protegidos (exigem confirmação explícita do
 * usuário pra qualquer edição) e continuam com suas próprias cópias
 * locais de normalizarData / maiorAtraso -- de propósito, não migradas
 * aqui nesta rodada.
 * ========================================================================= */
(function () {
  'use strict';

  if (window.__utilitariosCompartilhadosCarregados) return;
  window.__utilitariosCompartilhadosCarregados = true;

  // ============================================================
  // CALENDÁRIO / DATAS
  // ============================================================

  // Meio-dia evita que horário de verão empurre a data para o dia anterior
  // (mesmo motivo do Módulo 1, que introduziu esse padrão primeiro). É a
  // convenção que TODOS os módulos que comparam datas devem seguir -- nunca
  // meia-noite, sob risco de comparações inconsistentes entre módulos (ver
  // histórico do bug corrigido acima).
  function normalizarData(data) {
    const d = new Date(data);
    d.setHours(12, 0, 0, 0);
    return d;
  }

  // ============================================================
  // UI: TOAST (não bloqueante, some sozinho)
  // ============================================================
  function toast(mensagem, duracaoMs) {
    duracaoMs = duracaoMs || 3200;
    const el = document.createElement('div');
    el.textContent = mensagem;
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      background: '#16232F',
      color: '#fff',
      padding: '12px 18px',
      borderRadius: '8px',
      boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
      fontSize: '14px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      zIndex: 999999,
      maxWidth: '360px',
      opacity: '0',
      transition: 'opacity .25s ease',
      pointerEvents: 'none',
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, duracaoMs);
  }

  // ============================================================
  // ASSÍNCRONO
  // ============================================================
  function esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================
  // NAVEGAÇÃO
  // ============================================================
  function montarUrlCliente(grupoId, cnpj) {
    return `${location.origin}/crm/clientes/grupo/${grupoId}?cnpj=${encodeURIComponent(cnpj)}`;
  }

  // ============================================================
  // TÍTULO REPRESENTATIVO (regra de negócio confirmada com o usuário) --
  // qual título "representa" o cliente pra nota padronizada do CRM e pra
  // mensagem automática. Ordem de prioridade (primeira faixa não-vazia
  // decide):
  //   1. ULTIMO_DIA (prazo final antes de cartório/SCPC)
  //   2. NEGATIVADO_SCPC na janela de aviso de suspensão de cadastro
  //   3. Maior atraso real entre todos os títulos (situação normal)
  // ============================================================

  // Dias de atraso em que o SCPC passa a avisar sobre a suspensão de
  // cadastro -- CONFIRMADO com o usuário: 16 a 18 dias avisa que a
  // suspensão vem a caminho; exatamente no 19º dia é o último dia antes da
  // suspensão de verdade (cadastro vai pra um analista).
  const DIAS_AVISO_SUSPENSAO_SCPC_MIN = 16;
  const DIAS_AVISO_SUSPENSAO_SCPC_MAX = 18;
  const DIAS_ULTIMO_DIA_SUSPENSAO_SCPC = 19;

  function maiorAtrasoEntre(lista) {
    return lista.reduce((a, b) => (b.diasAtrasoReal > a.diasAtrasoReal ? b : a));
  }

  function escolherTituloRepresentativo(dados) {
    if (!dados || !dados.registros || dados.registros.length === 0) return null;

    const emUltimoDia = dados.registros.filter((r) => r.situacaoKey === 'ULTIMO_DIA');
    if (emUltimoDia.length > 0) return maiorAtrasoEntre(emUltimoDia);

    const emAvisoSuspensaoScpc = dados.registros.filter(
      (r) =>
        r.situacaoKey === 'NEGATIVADO_SCPC' &&
        r.diasAtrasoReal >= DIAS_AVISO_SUSPENSAO_SCPC_MIN &&
        r.diasAtrasoReal <= DIAS_ULTIMO_DIA_SUSPENSAO_SCPC
    );
    if (emAvisoSuspensaoScpc.length > 0) return maiorAtrasoEntre(emAvisoSuspensaoScpc);

    // CONFIRMADO com o usuário: título já EM_CARTORIO saiu da cobrança
    // amigável -- a prioridade de pagamento (e por isso o pedido/CTA da
    // mensagem) é sempre um título que AINDA NÃO foi pra cartório, mesmo
    // que ele tenha menos dias de atraso que o título em cartório. BUG
    // REAL (relatado pelo usuário): antes, "maior atraso real" comparava
    // todos os títulos juntos -- um título em cartório há 45 dias vencia
    // um título em atraso inicial há 3 dias só por ter mais dias,
    // escolhendo o título errado (o que já foi pra cartório, não o que
    // ainda dá pra evitar) e deixando o título realmente prioritário sem
    // nenhuma menção na mensagem. Só cai pra um título em cartório se
    // literalmente não sobrar nenhum outro -- caso raro na prática, já que
    // um cliente com TODOS os títulos em cartório nem chega até aqui (ver
    // avisarSeNaoCobrar no Módulo 1).
    const naoCartorio = dados.registros.filter((r) => r.situacaoKey !== 'EM_CARTORIO');
    if (naoCartorio.length > 0) return maiorAtrasoEntre(naoCartorio);

    return maiorAtrasoEntre(dados.registros);
  }

  // ============================================================
  // CONFIGURAÇÕES DO USUÁRIO (interruptores do painel Alt+O)
  // ============================================================
  //
  // POR QUE AQUI, e não no módulo que desenha o painel: o Módulo 0 carrega
  // PRIMEIRO, então qualquer módulo pode ler uma configuração no momento em
  // que precisa dela, sem depender de ordem de carregamento. O Módulo 9 só
  // desenha o que estiver declarado aqui.
  //
  // PRA ACRESCENTAR UM INTERRUPTOR NOVO: basta uma entrada em DEFINICOES.
  // O painel aparece sozinho, o teste de configuração cobre sozinho, e
  // quem precisa do valor chama ligado('aChave'). Nada de mexer na UI.
  //
  // O padrão de TODO interruptor tem que ser o comportamento que já existia
  // antes dele. Quem nunca abriu o painel não pode ter nada mudando embaixo
  // dos pés.
  const CHAVE_CONFIG = 'smarttable_config_v1';

  const DEFINICOES = Object.freeze({
    usarWhatsAppWeb: Object.freeze({
      titulo: 'Enviar pelo WhatsApp Web',
      descricao:
        'Desligado (padrão): a mensagem abre no app do WhatsApp Desktop. ' +
        'Ligado: abre em web.whatsapp.com, sempre na mesma aba. ' +
        'Serve pra atender por outra conta sem desvincular a sua do app.',
      padrao: false,
    }),
  });

  /**
   * Lê o objeto de configuração inteiro do localStorage.
   *
   * Nunca lança: localStorage pode estar cheio, bloqueado (aba anônima) ou
   * com JSON corrompido de uma versão anterior. Em qualquer desses casos o
   * script tem que seguir cobrando com os padrões, não parar.
   *
   * @returns {Record<string, boolean>} Só as chaves declaradas em DEFINICOES.
   */
  function lerConfigBruta() {
    let cru = null;
    try {
      cru = window.localStorage.getItem(CHAVE_CONFIG);
    } catch (erro) {
      console.warn('[Util] Não consegui ler as configurações; usando os padrões.', erro);
      return {};
    }
    if (!cru) return {};

    let objeto = null;
    try {
      objeto = JSON.parse(cru);
    } catch (erro) {
      console.warn('[Util] Configurações corrompidas no localStorage; usando os padrões.', erro);
      return {};
    }
    if (!objeto || typeof objeto !== 'object') return {};

    // Só aceita chave declarada e valor booleano -- lixo de versão antiga
    // (ou de alguém editando à mão) não vira comportamento.
    const limpo = {};
    Object.keys(DEFINICOES).forEach((chave) => {
      if (typeof objeto[chave] === 'boolean') limpo[chave] = objeto[chave];
    });
    return limpo;
  }

  /**
   * Valor atual de um interruptor.
   *
   * @param {string} chave Chave declarada em DEFINICOES.
   * @returns {boolean} O valor salvo, ou o padrão da definição.
   */
  function configLigado(chave) {
    const definicao = DEFINICOES[chave];
    if (!definicao) {
      console.warn(`[Util] Configuração desconhecida: "${chave}". Tratando como desligada.`);
      return false;
    }
    const salvo = lerConfigBruta()[chave];
    return typeof salvo === 'boolean' ? salvo : definicao.padrao;
  }

  /**
   * Grava um interruptor.
   *
   * @param {string} chave Chave declarada em DEFINICOES.
   * @param {boolean} valor
   * @returns {boolean} true se gravou; false se a chave não existe ou o
   *   localStorage recusou (cota cheia, modo anônimo).
   */
  function configDefinir(chave, valor) {
    if (!DEFINICOES[chave]) {
      console.warn(`[Util] Configuração desconhecida: "${chave}". Nada foi gravado.`);
      return false;
    }
    const atual = lerConfigBruta();
    atual[chave] = valor === true;
    try {
      window.localStorage.setItem(CHAVE_CONFIG, JSON.stringify(atual));
      return true;
    } catch (erro) {
      console.warn('[Util] Não consegui gravar a configuração.', erro);
      return false;
    }
  }

  /**
   * Inverte um interruptor.
   *
   * @param {string} chave
   * @returns {boolean} O valor que passou a valer. Se a gravação falhar,
   *   devolve o valor que continua valendo -- a tela nunca mente sobre o
   *   que está em vigor.
   */
  function configAlternar(chave) {
    const novo = !configLigado(chave);
    return configDefinir(chave, novo) ? novo : configLigado(chave);
  }

  const config = {
    DEFINICOES,
    CHAVE_CONFIG,
    ligado: configLigado,
    definir: configDefinir,
    alternar: configAlternar,
  };

  // ============================================================
  // EXPORT
  // ============================================================
  window.__smartTableUtil = {
    normalizarData,
    toast,
    esperar,
    montarUrlCliente,
    maiorAtrasoEntre,
    escolherTituloRepresentativo,
    config,
    DIAS_AVISO_SUSPENSAO_SCPC_MIN,
    DIAS_AVISO_SUSPENSAO_SCPC_MAX,
    DIAS_ULTIMO_DIA_SUSPENSAO_SCPC,
  };
})();
