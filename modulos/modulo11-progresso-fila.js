/* =========================================================================
 * MÓDULO 11: PROGRESSO DA FILA POR PRIORIDADE (botão discreto) — CRM TexCotton
 * -------------------------------------------------------------------------
 * Uma barra por faixa de prioridade (Módulo 7), mostrando quanto já foi
 * cobrado hoje dentro dela: "23/56" -- cobrados sobre o total da faixa.
 *
 * PEDIDO EXPLÍCITO DO USUÁRIO: um BOTÃO, não um atalho de teclado -- "muito
 * bem localizado e escondido". Por isso este módulo não entra no mapa de
 * teclas do Módulo 4: o gatilho é um elemento visual próprio, quase
 * invisível (opacidade baixa) numa borda da tela sem nada nosso hoje
 * (esquerda-inferior já tem o botão "Continuar fila" e os painéis;
 * direita-inferior já tem os toasts do Módulo 7). Fica na borda direita,
 * centralizado na vertical -- único ponto ainda livre.
 *
 * DE ONDE VÊM OS NÚMEROS: a MESMA fila que o Alt+U já monta e guarda em
 * localStorage (window.filaDebug, chave compartilhada com o Módulo 3) --
 * este módulo não calcula prioridade nem confere resultado, só AGRUPA o que
 * já está lá por prioridadeTier (window.filaDebug.obterFila().clientes) e
 * cruza com quem já foi contatado hoje (window.filaDebug.obterAtendidosHoje()).
 * Nomes e cores das faixas vêm do Módulo 7 (NOMES_PRIORIDADE/CORES_PRIORIDADE)
 * -- não duplicados aqui, pra nunca divergir se uma faixa mudar de nome.
 *
 * NÃO É AO VIVO: assim como os outros painéis (Alt+O, Alt+D, Alt+H, Alt+L),
 * o número é calculado no momento em que o painel abre, não atualizado
 * sozinho enquanto fica na tela. Como cada cliente da fila é uma navegação
 * de página cheia (recarrega), não haveria como manter o painel aberto
 * durante o trabalho de qualquer forma -- reabrir é o próprio mecanismo de
 * atualização.
 *
 * ONDE COLAR: depois do Módulo 0 (registro de painéis, formatação), do
 * Módulo 3 (window.filaDebug) e do Módulo 7 (window.filaPrioridadeDebug,
 * NOMES_PRIORIDADE, CORES_PRIORIDADE) -- os três precisam já estar carregados.
 * ========================================================================= */
(function () {
  'use strict';

  if (window.__progressoFilaCarregado) return;
  window.__progressoFilaCarregado = true;

  const CONFIG_PROGRESSO = {
    ID_BOTAO: 'smarttable-gatilho-progresso',
    ID_PAINEL: 'smarttable-painel-progresso',
    // Mesmo z-index dos outros painéis nossos (Módulo 9/10): ABAIXO dos
    // modais do CRM (z-50).
    Z_INDEX: 30,
  };

  const CORES = {
    tinta: '#16232F',
    texto: '#344054',
    apagado: '#98a2b3',
    borda: '#d0d5dd',
    linha: '#eef2f6',
    destaque: '#1B6B4A',
    fundo: '#ffffff',
  };

  let painelEl = null;
  let botaoEl = null;

  /**
   * Agrupa a fila de hoje por prioridadeTier e cruza com quem já foi
   * contatado hoje. Separado do DOM de propósito -- é aqui que mora a única
   * aritmética do módulo, e é o que os testes exercitam sem navegador.
   *
   * @returns {{disponivel: boolean, motivo?: string, faixas?: object[],
   *            totalGeral?: number, cobradosGeral?: number}}
   */
  function montarProgresso() {
    const filaDebug = window.filaDebug;
    const prioridadeDebug = window.filaPrioridadeDebug;

    if (!filaDebug || typeof filaDebug.obterFila !== 'function' || !prioridadeDebug) {
      return { disponivel: false, motivo: 'A fila (Módulo 3/7) não carregou nesta página.' };
    }

    const fila = filaDebug.obterFila();
    if (!fila) {
      return { disponivel: false, motivo: 'Nenhuma fila montada hoje ainda. Alt+U monta por prioridade.' };
    }
    if (!prioridadeDebug.ehFilaDePrioridade(fila)) {
      return { disponivel: false, motivo: 'A fila de hoje foi montada pelo Alt+I (não por prioridade). Use Alt+U pra ver o progresso por faixa.' };
    }

    const atendidos = typeof filaDebug.obterAtendidosHoje === 'function'
      ? filaDebug.obterAtendidosHoje()
      : new Set();

    const porTier = new Map();
    fila.clientes.forEach((c) => {
      if (!c || c.prioridadeTier == null) return;
      const tier = c.prioridadeTier;
      if (!porTier.has(tier)) porTier.set(tier, { total: 0, cobrados: 0 });
      const registro = porTier.get(tier);
      registro.total += 1;
      if (c.cnpj && atendidos.has(c.cnpj)) registro.cobrados += 1;
    });

    const nomes = prioridadeDebug.NOMES_PRIORIDADE || {};
    const cores = prioridadeDebug.CORES_PRIORIDADE || {};

    const faixas = Array.from(porTier.entries())
      .map(([tier, { total, cobrados }]) => ({
        tier,
        nome: nomes[tier] || `Faixa ${tier}`,
        cor: cores[tier] || CORES.apagado,
        total,
        cobrados,
      }))
      .sort((a, b) => a.tier - b.tier);

    return {
      disponivel: true,
      faixas,
      totalGeral: faixas.reduce((soma, f) => soma + f.total, 0),
      cobradosGeral: faixas.reduce((soma, f) => soma + f.cobrados, 0),
    };
  }

  /* ---------------------------------------------------------------------
   * DESENHO
   * --------------------------------------------------------------------- */

  function criarDiv(texto, estilo) {
    const el = document.createElement('div');
    if (texto) el.textContent = texto;
    Object.assign(el.style, estilo || {});
    return el;
  }

  function criarResumoGeral(resumo) {
    const linha = criarDiv('', {
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      marginBottom: '10px', paddingBottom: '8px', borderBottom: `1px solid ${CORES.linha}`,
    });
    linha.appendChild(criarDiv('Hoje', { color: CORES.tinta, fontWeight: '700', fontSize: '13px' }));
    linha.appendChild(criarDiv(`${resumo.cobradosGeral}/${resumo.totalGeral}`, {
      fontFamily: 'ui-monospace, monospace', color: CORES.destaque, fontWeight: '700', fontSize: '14px',
    }));
    return linha;
  }

  function criarBarraFaixa(faixa) {
    const bloco = criarDiv('', { marginBottom: '10px' });

    const cabecalho = criarDiv('', {
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px', gap: '10px',
    });
    cabecalho.appendChild(criarDiv(faixa.nome, { color: CORES.texto, fontSize: '12px' }));
    cabecalho.appendChild(criarDiv(`${faixa.cobrados}/${faixa.total}`, {
      fontFamily: 'ui-monospace, monospace', color: CORES.tinta, fontWeight: '600', fontSize: '12px', whiteSpace: 'nowrap',
    }));
    bloco.appendChild(cabecalho);

    const trilha = criarDiv('', {
      height: '8px', borderRadius: '4px', background: CORES.linha, overflow: 'hidden',
    });
    const preenchido = criarDiv('', {
      height: '100%',
      width: `${Math.round((faixa.cobrados / faixa.total) * 100)}%`,
      background: faixa.cor,
      borderRadius: '4px',
    });
    trilha.appendChild(preenchido);
    bloco.appendChild(trilha);

    return bloco;
  }

  function fecharPainel() {
    if (!painelEl) return;
    painelEl.remove();
    painelEl = null;
  }

  function abrirPainel() {
    window.__smartTableUtil?.fecharOutrosPaineis?.('progressoFila');

    const resultado = montarProgresso();

    painelEl = document.createElement('div');
    painelEl.id = CONFIG_PROGRESSO.ID_PAINEL;
    Object.assign(painelEl.style, {
      position: 'fixed',
      bottom: '112px',
      right: '16px',
      background: CORES.fundo,
      border: `1px solid ${CORES.borda}`,
      borderRadius: '10px',
      padding: '14px 16px',
      boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      zIndex: CONFIG_PROGRESSO.Z_INDEX,
      width: '300px',
      maxWidth: '92vw',
      maxHeight: '70vh',
      overflowY: 'auto',
    });

    painelEl.appendChild(criarDiv('Progresso da fila', {
      color: CORES.tinta, fontWeight: '700', fontSize: '14px', marginBottom: '8px',
    }));

    if (!resultado.disponivel) {
      painelEl.appendChild(criarDiv(resultado.motivo, { color: CORES.apagado, lineHeight: '1.5' }));
    } else if (resultado.faixas.length === 0) {
      painelEl.appendChild(criarDiv('A fila de hoje está vazia.', { color: CORES.apagado }));
    } else {
      painelEl.appendChild(criarResumoGeral(resultado));
      resultado.faixas.forEach((faixa) => painelEl.appendChild(criarBarraFaixa(faixa)));
    }

    painelEl.appendChild(criarDiv('Esc pra fechar', {
      marginTop: '6px', paddingTop: '6px', borderTop: `1px solid ${CORES.linha}`,
      color: CORES.apagado, fontSize: '11px', textAlign: 'center',
    }));

    document.body.appendChild(painelEl);
  }

  function alternarPainel() {
    if (painelEl) {
      fecharPainel();
      return;
    }
    abrirPainel();
  }

  /**
   * O gatilho: quase invisível em repouso, evidente ao passar o mouse ou
   * focar por teclado (Tab). É um <button> de verdade -- Enter/Espaço
   * ativam sozinhos, sem precisar reimplementar navegação por teclado.
   */
  function criarBotaoGatilho() {
    const el = document.createElement('button');
    el.type = 'button';
    el.id = CONFIG_PROGRESSO.ID_BOTAO;
    el.title = 'Progresso da fila por prioridade';
    el.setAttribute('aria-label', 'Progresso da fila por prioridade');
    Object.assign(el.style, {
      position: 'fixed',
      top: '50%',
      right: '0',
      transform: 'translateY(-50%)',
      width: '10px',
      height: '44px',
      padding: '0',
      margin: '0',
      border: 'none',
      borderRadius: '6px 0 0 6px',
      background: CORES.tinta,
      opacity: '0.15',
      cursor: 'pointer',
      zIndex: CONFIG_PROGRESSO.Z_INDEX,
      transition: 'opacity .15s ease, width .15s ease',
    });

    const destacar = () => { el.style.opacity = '0.85'; el.style.width = '16px'; };
    const apagar = () => { el.style.opacity = '0.15'; el.style.width = '10px'; };
    el.addEventListener('mouseenter', destacar);
    el.addEventListener('mouseleave', apagar);
    el.addEventListener('focus', destacar);
    el.addEventListener('blur', apagar);
    el.addEventListener('click', alternarPainel);

    document.body.appendChild(el);
    return el;
  }

  function aoCarregar() {
    botaoEl = criarBotaoGatilho();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aoCarregar);
  } else {
    aoCarregar();
  }

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && painelEl) fecharPainel();
  });

  window.__smartTableUtil?.registrarPainel?.('progressoFila', fecharPainel);

  window.__progressoFila = {
    alternarPainel,
    abrirPainel,
    fecharPainel,
    estaAberto: () => painelEl !== null,
    montarProgresso,
    CONFIG_PROGRESSO,
    obterBotao: () => botaoEl,
  };
})();
