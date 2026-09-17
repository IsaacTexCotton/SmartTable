/* =========================================================================
 * MÓDULO 7: FILA POR PRIORIDADE — CRM TexCotton
 * -------------------------------------------------------------------------
 * O que faz: monta uma fila de atendimento (mesmo formato/mecanismo do
 * Módulo 3 -- navegação, painel, Alt+P/Alt+V, "continuar fila anterior")
 * mas ORDENADA por uma régua de prioridade de negócio, em vez de só por
 * dias de atraso. Atalho separado (Alt+U) -- o Alt+I original continua
 * exatamente como está, sem nenhuma mudança de comportamento.
 *
 * REGRA DE PRIORIDADE (CONFIRMADA com o usuário -- 2ª revisão, reordenada
 * por completo), em ordem -- cada cliente entra na PRIMEIRA faixa que se
 * aplicar a ele:
 *   1. Cartório -- último dia (situação ULTIMO_DIA, fluxo Cartório)
 *   2. Cluster "Novo"
 *   3. Segundo dia de atraso (situação EM_ATRASO, dia 2 exato -- contato
 *      bem cedo, antes do problema crescer)
 *   4. Dia da promessa de pagamento (o cliente combinou pagar HOJE e o
 *      título continua em aberto -- ver DIA_DA_PROMESSA no Módulo 6)
 *   5. Promessa não cumprida (promessa vencida sem pagamento identificado
 *      e ainda sem nenhum contato registrado depois do vencimento -- ver
 *      QUEBRADA/PARCIAL no Módulo 6)
 *   6. SCPC -- último dia (situação ULTIMO_DIA, fluxo SCPC)
 *   7. Aviso final antes da suspensão (situação NEGATIVADO_SCPC, dia 19
 *      exato -- mesmo limiar usado pelo Módulo 4 pra mensagem)
 *   8. Última movimentação há mais de um mês (30 dias corridos -- cliente
 *      "esquecido", sem nenhum toque recente registrado na conta)
 *   9. Atraso inicial, 3º ao 4º dia (situação EM_ATRASO, dias 3-4 --
 *      dia 1 NÃO conta como dia de cobrança, fica de fora da lista; dia 2
 *      já tem faixa própria acima, ver item 3)
 *   10. Demais dias (tudo que não caiu em nenhuma faixa acima)
 *
 * POR QUE AS FAIXAS 4 E 5 FICAM ACIMA DE SCPC-ÚLTIMO-DIA E DO AVISO DE
 * SUSPENSÃO (decisão explicada pro usuário): são os clientes que JÁ SE
 * COMPROMETERAM -- quem prometeu pagar hoje só converte se for lembrado
 * hoje (janela de um dia só), e quem quebrou a promessa é o contato de
 * maior conversão da carteira. O dado vem de
 * window.__contextoAdicional.promessa, que o Módulo 6 já calcula na mesma
 * visita em aba de fundo -- custo zero de tempo.
 *
 * "Última movimentação há mais de um mês" (faixa 8) usa o mesmo campo
 * movimentacaoDataIso já lido da lista (window.CLIENTES) pra excluir quem
 * mexeu HOJE -- aqui serve o propósito oposto, achar quem está PARADO há
 * muito tempo (30 dias corridos), pra não deixar conta esquecida se
 * perder entre as de rotina.
 *
 * EXCLUSÕES (nunca entram na lista, em nenhuma faixa):
 *   - Mais de 19 dias de atraso
 *   - Dia 1 de atraso (não é considerado dia de cobrança ainda)
 *   - Última movimentação (a data mais recente mostrada na linha da
 *     lista) é HOJE
 *   - Existe alguma promessa (qualquer status) com data prometida DEPOIS
 *     de hoje
 *   - Qualquer título do cliente dispara alerta de "não cobrar" no Módulo 1
 *     (posição NAO COBRAR/CARTEIRA, ou todos os títulos já em cartório --
 *     mesmo critério do banner avisarSeNaoCobrar) -- exclui o CLIENTE
 *     inteiro, não só o título específico.
 *   - CONFIRMADO com o usuário: quando 2+ clientes do MESMO grupo econômico
 *     (confirmado via window.__alertaGrupo, lido pelo Módulo 5 na aba
 *     "Grupo" de verdade de cada cliente -- NÃO é o grupoId da lista, que é
 *     outro campo sem relação com grupo econômico) têm título em aberto, só
 *     a representante MAIS URGENTE do grupo entra na fila -- as demais já
 *     serão cobradas por tabela a partir dessa visita (ver
 *     filtrarPorGrupoEconomico).
 *
 * POR QUE PRECISA VISITAR CADA CLIENTE: a lista de clientes (página de
 * lista) só mostra dias de atraso, cluster e a data da última movimentação
 * -- NÃO mostra a situação real do título (ULTIMO_DIA/NEGATIVADO_SCPC) nem
 * o fluxo (Cartório/SCPC), porque esses dois só existem depois de rodar a
 * classificação de verdade (Módulo 1), que por sua vez depende de um campo
 * ("SCPC:") que só aparece na PÁGINA DE DETALHE de cada cliente. Promessas
 * também só existem na aba "Promessas" da página de detalhe. Por isso este
 * módulo visita cada candidato em aba de fundo (mesma técnica do Alt+A pra
 * outras razões do grupo, só que sequencial -- ver nota de popup abaixo) e
 * só monta a fila depois de classificar todo mundo.
 *
 * SOBRE POPUP: diferente do Alt+A/Alt+G (que abrem no máximo 2-3 abas, tudo
 * dentro do mesmo gesto de clique), aqui pode ser necessário visitar
 * DEZENAS de clientes -- abrir todas as abas de uma vez seria abusivo e
 * provavelmente travaria o navegador. Este módulo abre UMA aba de cada vez,
 * de forma sequencial (fecha antes de abrir a próxima). Isso significa que,
 * depois das primeiras, os `window.open` já não estão mais dentro do gesto
 * original de teclado -- SE o navegador bloquear alguma aba como pop-up,
 * aparece um aviso no console e aquele cliente fica de fora da lista (sem
 * travar o resto). Se isso acontecer na prática, a correção é permitir
 * pop-ups pra este site nas configurações do navegador (ação única).
 *
 * Onde colar: anexado ao FINAL do smart-table.js, depois do Módulo 0
 * (Utilitários Compartilhados -- usa window.__smartTableUtil.toast/esperar/
 * normalizarData/escolherTituloRepresentativo) e do Módulo 3 (Fila de
 * Atendimento) -- usa window.filaDebug.construirFilaAPartirDaPagina,
 * .salvarFila, .obterFila e .CONFIG. O atalho de teclado (Alt+U) em si fica
 * no Módulo 4, que chama window.filaPrioridadeDebug.iniciar() -- mesmo
 * padrão usado pro Alt+I chamar window.filaDebug.iniciarFila().
 * ========================================================================= */
(function () {
  'use strict';

  if (window.__filaPrioridadeCarregada) return;
  window.__filaPrioridadeCarregada = true;

  // Utilitários compartilhados (Módulo 0) -- precisa estar carregado ANTES
  // deste arquivo no @require do wrapper.
  const { toast, esperar, normalizarData, escolherTituloRepresentativo } = window.__smartTableUtil;

  /* ---------------------------------------------------------------------
   * 1. CONFIGURAÇÃO
   * --------------------------------------------------------------------- */
  const CONFIG = {
    SELETOR_LINHA: 'table tbody tr',
    REGEX_CONTROLE: /Controle:\s*(\d+)\|([\d.\/-]+)/,
    VALOR_CLUSTER_NOVO: 'novo',
    // Exclusões (confirmadas com o usuário).
    DIAS_ATRASO_MAX: 19,
    DIA_ATRASO_MIN_CONSIDERADO: 2, // dia 1 não é considerado dia de cobrança
    // Prioridade 3: dia 2 de EM_ATRASO, sozinho (faixa própria, contato bem cedo).
    DIA_PRIORIDADE_SEGUNDO_DIA: 2,
    // Prioridade 9: 3º ao 4º dia de EM_ATRASO (dia 2 já saiu pra faixa própria acima).
    //
    // O 5º DIA FICA DE FORA DE PROPÓSITO -- CONFIRMADO com o usuário depois de
    // conferir uma fila real, onde 14 dos 92 clientes eram justamente dia 5 e
    // caíram em "Demais dias" (P10). NÃO é lacuna esquecida entre o dia 2 e os
    // dias 3-4: é a régua como ela foi desenhada. Quem for "consertar" isso
    // acrescentando o 5 aqui vai derrubar o teste
    // "EM_ATRASO dia 5 NÃO é atraso inicial" em tests/fila-prioridade.test.js,
    // e deve trazer a mudança pro usuário em vez de tratar como bug.
    DIAS_PRIORIDADE_ATRASO_INICIAL: [3, 4],
    // Prioridade 8: última movimentação há mais desse tanto de dias corridos
    // (CONFIRMADO com o usuário: 30 dias, mesmo padrão já usado noutro ponto
    // do sistema -- expiração do retrato de títulos no Módulo 6).
    DIAS_MOVIMENTACAO_ANTIGA: 30,
    // Prioridade 5 e escolha do título representativo: mesmos limiares do
    // aviso de suspensão de cadastro SCPC usados em todo o resto do sistema
    // -- vêm do Módulo 0 (window.__smartTableUtil), não são mais uma cópia
    // local. MANTER SINCRONIZADO manualmente só se um dia o Módulo 2
    // (protegido, ainda com sua própria cópia) divergir.
    DIA_ULTIMO_DIA_SUSPENSAO_SCPC: window.__smartTableUtil.DIAS_ULTIMO_DIA_SUSPENSAO_SCPC,
    DIA_INICIO_AVISO_SUSPENSAO_SCPC: window.__smartTableUtil.DIAS_AVISO_SUSPENSAO_SCPC_MIN,
    // Tempo esperando cada aba de fundo ficar pronta pra ler (Módulo 1 +
    // Módulo 6 carregados) -- mesma ordem de grandeza do Alt+A.
    TIMEOUT_CLASSIFICACAO_MS: 8000,
    INTERVALO_POLL_MS: 200,
  };

  const NOMES_PRIORIDADE = {
    1: 'Cartório — último dia',
    2: 'Cluster Novo',
    3: 'Segundo dia',
    4: 'Dia da promessa de pagamento',
    5: 'Promessa não cumprida',
    6: 'SCPC — último dia',
    7: 'Aviso final antes da suspensão',
    8: 'Última movimentação há mais de um mês',
    9: 'Atraso inicial (3º–4º dia)',
    10: 'Demais dias',
  };

  // Cor de destaque do aviso de troca de prioridade (ver toastTrocaPrioridade
  // abaixo) -- reaproveita tons já usados em outros pontos do sistema pra
  // não introduzir uma paleta nova: vermelho do rail ULTIMO_DIA (Módulo 1)
  // pras duas faixas de "último dia" (cartório e SCPC -- mesmo significado,
  // mesma cor, mesmo em posições diferentes da régua), verde/vermelho-tijolo
  // dos toasts de sucesso/erro (Módulo 2) pras duas faixas de promessa,
  // âmbar do botão "Continuar fila anterior" (Módulo 3) pro atraso inicial,
  // índigo do rail NEGATIVADO_SCPC (Módulo 1) pro aviso de suspensão, e o
  // cinza neutro do rail EM_ATRASO pra "demais dias". Duas cores novas pras
  // duas faixas que não existiam antes: "segundo dia" (contato bem cedo) e
  // "última movimentação há mais de um mês" (conta parada/esquecida).
  const CORES_PRIORIDADE = {
    1: '#A3251A',
    2: '#54407C',
    3: '#0E7490',
    4: '#1B6B4A',
    5: '#8A2A16',
    6: '#A3251A',
    7: '#313A8C',
    8: '#6B4226',
    9: '#B45309',
    10: '#4E5D6C',
  };

  /* ---------------------------------------------------------------------
   * 2. ESTADO
   * --------------------------------------------------------------------- */
  let classificandoEmAndamento = false;
  let indicadorEl = null;

  /* ---------------------------------------------------------------------
   * 3. UTILITÁRIOS DE UI (toast + indicador de progresso persistente)
   * --------------------------------------------------------------------- */
  // Indicador único e persistente (não empilha toasts) -- atualizado in
  // place enquanto a classificação roda, já que pode levar minutos.
  function atualizarIndicadorProgresso(texto) {
    if (!indicadorEl) {
      indicadorEl = document.createElement('div');
      Object.assign(indicadorEl.style, {
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
      });
      document.body.appendChild(indicadorEl);
    }
    indicadorEl.textContent = texto;
  }

  function removerIndicadorProgresso() {
    if (indicadorEl) {
      indicadorEl.remove();
      indicadorEl = null;
    }
  }

  // PEDIDO DO USUÁRIO: aviso de troca de prioridade mais aparente, sem
  // destoar do resto do app -- mesma base visual do toast genérico (fundo
  // escuro, cantos arredondados, mesma fonte, mesma posição), só que com
  // borda de destaque colorida por prioridade (ver CORES_PRIORIDADE),
  // texto em duas linhas (rótulo pequeno + nome em negrito, maior que o
  // toast normal) e uma leve animação de entrada -- deixa mais chamativo
  // sem virar um elemento estranho ao resto da interface.
  function toastTrocaPrioridade(prefixo, prioridadeTier, prioridadeNome, duracaoMs) {
    duracaoMs = duracaoMs || 5000;
    const cor = CORES_PRIORIDADE[prioridadeTier] || '#16232F';

    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      background: '#16232F',
      color: '#fff',
      padding: '14px 20px 14px 16px',
      borderRadius: '8px',
      borderLeft: '5px solid ' + cor,
      boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      zIndex: 999999,
      maxWidth: '360px',
      opacity: '0',
      transform: 'translateY(6px)',
      transition: 'opacity .25s ease, transform .25s ease',
      pointerEvents: 'none',
    });

    const rotulo = document.createElement('div');
    rotulo.textContent = (prefixo + ' ' + prioridadeTier).toUpperCase();
    Object.assign(rotulo.style, {
      fontSize: '11px',
      fontWeight: '700',
      letterSpacing: '.05em',
      color: cor,
      marginBottom: '4px',
    });

    const nome = document.createElement('div');
    nome.textContent = prioridadeNome;
    Object.assign(nome.style, {
      fontSize: '15px',
      fontWeight: '600',
      lineHeight: '1.3',
    });

    el.appendChild(rotulo);
    el.appendChild(nome);
    document.body.appendChild(el);

    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, duracaoMs);
  }

  /* ---------------------------------------------------------------------
   * 4. LEITURA DA LISTA (fase 1 -- síncrona, reaproveitando o Módulo 3)
   * --------------------------------------------------------------------- */
  // Reaproveita construirFilaAPartirDaPagina (já cuida de deduplicar
  // matriz/filial mantendo o mais atrasado, e de pular quem já foi
  // atendido hoje) e enriquece cada candidato com cluster + data da última
  // movimentação.
  //
  // CORRIGIDO (bug real, achado ao vivo): a primeira versão tentava adivinhar
  // esses dois campos lendo texto renderizado (span.pbi-meta pro cluster, a
  // "última data visível" na linha pra movimentação) -- as duas suposições
  // eram erradas. pbi-meta é na verdade situacaoCobrancaDescricao, e a
  // "última data" só coincidia por sorte com a real na maioria dos casos,
  // mas não dava pra confiar (67 de 133 clientes bateram "hoje", muitos
  // deles claramente por coincidência de posição, não pela data certa).
  //
  // A CORREÇÃO: window.CLIENTES é um array com os dados brutos do cliente
  // que a própria página já usa pra renderizar a tabela (confirmado via
  // HTML/JS real -- var CLIENTES = [...] dentro de um <script> da página).
  // Como o script roda com @grant none, temos acesso direto a esse array --
  // ler os campos ali (cluster, dataUltimaMovimentacao) é muito mais
  // confiável do que tentar re-derivar a mesma informação a partir do HTML
  // já renderizado.
  function obterMapaClientes() {
    if (!Array.isArray(window.CLIENTES)) return null;
    const mapa = new Map();
    window.CLIENTES.forEach((c) => {
      if (c && c.cnpj) mapa.set(c.cnpj, c);
    });
    return mapa;
  }

  function candidatosEnriquecidos() {
    if (!window.filaDebug || typeof window.filaDebug.construirFilaAPartirDaPagina !== 'function') {
      console.warn('[Fila Prioridade] Módulo de Fila (Módulo 3) não encontrado -- confirme se foi colado ANTES deste arquivo.');
      return null;
    }

    const base = window.filaDebug.construirFilaAPartirDaPagina();
    const mapaClientes = obterMapaClientes();
    if (!mapaClientes) {
      console.warn(
        '[Fila Prioridade] window.CLIENTES não encontrado nesta página (a lista pode ter mudado de estrutura) -- ' +
        'seguindo sem cluster nem checagem de última movimentação (ninguém será excluído por isso, e ninguém ' +
        'entra na prioridade 2 por cluster). Me avise se isso acontecer -- não deveria.'
      );
    }

    let semCorrespondenciaNoMapa = 0;

    const enriquecidos = base.map((cliente) => {
      const dadosCliente = mapaClientes ? mapaClientes.get(cliente.cnpj) : null;
      if (mapaClientes && !dadosCliente) semCorrespondenciaNoMapa++;
      return Object.assign({}, cliente, {
        cluster: dadosCliente ? (dadosCliente.cluster || '') : '',
        // Formato ISO ("2026-09-11T08:00:11.523327") -- comparamos só a
        // parte "AAAA-MM-DD" por string, mesmo padrão que o próprio script
        // da página usa (ver isBeforeOrToday/isBeforeToday no HTML real) --
        // evita qualquer pegadinha de fuso horário na conversão pra Date.
        movimentacaoDataIso: dadosCliente ? (dadosCliente.dataUltimaMovimentacao || null) : null,
        // BUG REAL (relatado pelo usuário, achado ao vivo): o diasAtraso que
        // vem de construirFilaAPartirDaPagina() é extraído por regex do
        // texto INTEIRO da linha (primeira ocorrência de "N dias") -- a
        // linha tem MAIS de um número seguido de "dias" (ex.: diasAtraso e
        // diasAtrasoMedio são campos separados em window.CLIENTES, e nada
        // garante que o regex pega o certo). Isso inflou a exclusão de
        // ">19 dias" bem além do real (62 de 65 candidatos, número que o
        // usuário confirmou não bater com a carteira de verdade).
        // window.CLIENTES[].diasAtraso é o valor estruturado e correto --
        // sobrescreve o valor extraído por regex sempre que disponível.
        diasAtraso:
          dadosCliente && typeof dadosCliente.diasAtraso === 'number' ? dadosCliente.diasAtraso : cliente.diasAtraso,
      });
    });

    // Se window.CLIENTES existe mas algum CNPJ específico não bate com
    // nada nele, esses candidatos caem de volta no valor extraído por
    // regex (mesmo bug antigo) sem avisar nada -- isso deixaria passar em
    // silêncio a mesma classe de problema que acabamos de corrigir.
    if (semCorrespondenciaNoMapa > 0) {
      console.warn(
        `[Fila Prioridade] ${semCorrespondenciaNoMapa} candidato(s) não bateram com nenhum CNPJ em window.CLIENTES -- ` +
        'esses ficaram com cluster/movimentação/diasAtraso extraídos por regex da linha (menos confiável). ' +
        'Se isso acontecer com frequência, me avise -- pode indicar formato de CNPJ diferente entre os dois.'
      );
    }

    return enriquecidos;
  }

  function movimentacaoEhHoje(movimentacaoDataIso) {
    if (!movimentacaoDataIso) return false;
    const dataStr = String(movimentacaoDataIso).split('T')[0];
    const hoje = new Date();
    const hojeStr =
      hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');
    return dataStr === hojeStr;
  }

  // Converte a parte "AAAA-MM-DD" de movimentacaoDataIso num Date normalizado
  // (meio-dia, mesma convenção de normalizarData do Módulo 0) -- construído
  // via new Date(ano, mes-1, dia) e NÃO via new Date("AAAA-MM-DD") de
  // propósito: essa segunda forma é interpretada como UTC meia-noite pelo
  // motor JS, podendo virar o dia errado dependendo do fuso do navegador
  // (mesma pegadinha já evitada em converterDataBr no Módulo 6).
  function dataDaMovimentacao(movimentacaoDataIso) {
    if (!movimentacaoDataIso) return null;
    const dataStr = String(movimentacaoDataIso).split('T')[0];
    const m = dataStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return normalizarData(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }

  // Prioridade 8 (pedido do usuário): cliente cuja última movimentação
  // registrada já passou de CONFIG.DIAS_MOVIMENTACAO_ANTIGA dias corridos --
  // conta "esquecida", sem nenhum toque recente. hoje já vem normalizado
  // (normalizarData) de quem chama, pra bater com a mesma meia-noite/
  // meio-dia usados no resto do sistema.
  function movimentacaoMaisDeUmMes(movimentacaoDataIso, hoje) {
    const data = dataDaMovimentacao(movimentacaoDataIso);
    if (!data || !hoje) return false;
    const diasCorridos = (hoje.getTime() - data.getTime()) / (24 * 60 * 60 * 1000);
    return diasCorridos > CONFIG.DIAS_MOVIMENTACAO_ANTIGA;
  }

  // Exclusões que já dá pra decidir só com o que a lista mostra -- não
  // precisa visitar ninguém pra isso.
  function filtrarPorRegrasDaLista(candidatos) {
    const sobreviventes = [];
    const excluidos = { dias: 0, diaUm: 0, movimentacaoHoje: 0, semDias: 0 };

    candidatos.forEach((c) => {
      if (c.diasAtraso === null || c.diasAtraso === undefined) {
        excluidos.semDias++;
        return;
      }
      if (c.diasAtraso > CONFIG.DIAS_ATRASO_MAX) {
        excluidos.dias++;
        return;
      }
      if (c.diasAtraso < CONFIG.DIA_ATRASO_MIN_CONSIDERADO) {
        excluidos.diaUm++;
        return;
      }
      if (movimentacaoEhHoje(c.movimentacaoDataIso)) {
        excluidos.movimentacaoHoje++;
        return;
      }
      sobreviventes.push(c);
    });

    return { sobreviventes, excluidos };
  }

  /* ---------------------------------------------------------------------
   * 5. CLASSIFICAÇÃO REAL (fase 2 -- visita cada candidato em aba de fundo)
   * --------------------------------------------------------------------- */
  // Mesma regra do Módulo 4 -- agora centralizada no Módulo 0
  // (window.__smartTableUtil.escolherTituloRepresentativo). ULTIMO_DIA
  // sempre vence, senão a janela de aviso de suspensão SCPC (16-19 dias),
  // senão o título de maior atraso real. Ver histórico completo do bug de
  // priorização no Módulo 0.

  // Espera a aba de fundo carregar os módulos necessários pra classificar
  // (Módulo 1 pronto pra simular() + Módulo 6 já com __contextoAdicional
  // calculado, mesmo que tenha caído no fallback de erro -- o que importa
  // é não ler pela metade).
  function esperarAbaPronta(janela, timeoutMs, intervaloMs) {
    return new Promise((resolve) => {
      const prazoFinal = Date.now() + timeoutMs;
      (function tentar() {
        if (janela.closed) return resolve(false);
        let pronto = false;
        try {
          pronto = !!(
            janela.__avisoCobranca &&
            typeof janela.__avisoCobranca.simular === 'function' &&
            janela.__contextoAdicional &&
            janela.__alertaGrupo
          );
        } catch (erro) {
          return resolve(false); // cross-origin ou janela em estado estranho
        }
        if (pronto) return resolve(true);
        if (Date.now() >= prazoFinal) return resolve(false);
        setTimeout(tentar, intervaloMs);
      })();
    });
  }

  // Primeira faixa que se aplicar vence -- por isso a ordem de checagem
  // aqui segue exatamente a numeração das prioridades (1 a 10).
  //
  // contextoPromessa é o window.__contextoAdicional.promessa da aba de
  // fundo (Módulo 6): { tipo: 'DIA_DA_PROMESSA' | 'QUEBRADA' | 'PARCIAL',
  // promessa } ou null. Vem null quando não há promessa ativa -- inclusive
  // quando o Módulo 6 já considerou a promessa resolvida (título pago) ou
  // quando já houve contato depois do vencimento, que é exatamente quando
  // ela deixa de ser o assunto mais urgente do cliente.
  //
  // movimentacaoDataIso e hoje são opcionais (testes antigos chamam esta
  // função sem eles) -- sem os dois, a faixa 8 simplesmente nunca casa,
  // caindo nas faixas seguintes normalmente (movimentacaoMaisDeUmMes já
  // trata ausência de qualquer um dos dois como "não aplica").
  function determinarPrioridade(escolhido, fluxo, cluster, contextoPromessa, movimentacaoDataIso, hoje) {
    const tipoPromessa = contextoPromessa ? contextoPromessa.tipo : null;

    if (escolhido.situacaoKey === 'ULTIMO_DIA' && fluxo === 'CARTORIO') return 1;
    if ((cluster || '').trim().toLowerCase() === CONFIG.VALOR_CLUSTER_NOVO) return 2;
    if (escolhido.situacaoKey === 'EM_ATRASO' && escolhido.diasAtrasoReal === CONFIG.DIA_PRIORIDADE_SEGUNDO_DIA) return 3;
    if (tipoPromessa === 'DIA_DA_PROMESSA') return 4;
    if (tipoPromessa === 'QUEBRADA' || tipoPromessa === 'PARCIAL') return 5;
    if (escolhido.situacaoKey === 'ULTIMO_DIA' && fluxo === 'SCPC') return 6;
    if (
      escolhido.situacaoKey === 'NEGATIVADO_SCPC' &&
      escolhido.diasAtrasoReal === CONFIG.DIA_ULTIMO_DIA_SUSPENSAO_SCPC
    ) {
      return 7;
    }
    if (movimentacaoMaisDeUmMes(movimentacaoDataIso, hoje)) return 8;
    if (
      escolhido.situacaoKey === 'EM_ATRASO' &&
      CONFIG.DIAS_PRIORIDADE_ATRASO_INICIAL.includes(escolhido.diasAtrasoReal)
    ) {
      return 9;
    }
    return 10;
  }

  // Visita UM candidato: abre a aba, espera ficar pronta, lê situação +
  // fluxo (Módulo 1) e promessas (Módulo 6), fecha a aba, devolve o
  // resultado. Nunca lança -- qualquer falha vira { erro: '...' } pra não
  // travar o restante do lote.
  async function classificarCliente(cliente) {
    const aba = window.open(cliente.url, '_blank');
    if (!aba) {
      console.warn(`[Fila Prioridade] Não consegui abrir aba para "${cliente.label}" -- pop-up bloqueado? Permita pop-ups pra este site e tente de novo.`);
      return { cliente, erro: 'popup-bloqueado' };
    }

    try {
      const pronto = await esperarAbaPronta(aba, CONFIG.TIMEOUT_CLASSIFICACAO_MS, CONFIG.INTERVALO_POLL_MS);
      if (!pronto) {
        console.warn(`[Fila Prioridade] "${cliente.label}" não carregou a tempo -- deixando de fora da lista.`);
        return { cliente, erro: 'timeout' };
      }

      let dadosTitulos;
      try {
        dadosTitulos = aba.__avisoCobranca.simular();
      } catch (erro) {
        console.warn(`[Fila Prioridade] Falha ao ler títulos de "${cliente.label}":`, erro.message);
        return { cliente, erro: 'falha-titulos' };
      }

      // CONFIRMADO com o usuário: cliente com QUALQUER título em "não
      // cobrar" (NAO COBRAR/CARTEIRA no CRM, ou todos os títulos já em
      // cartório -- ver POSICOES_EXCLUIDAS_DE_COBRANCA e o banner
      // avisarSeNaoCobrar no Módulo 1) fica de fora da fila inteira, não só
      // o título específico -- precisa de atenção manual, não de uma
      // automação de urgência. dadosTitulos.naoCobrar já vem pronto do
      // Módulo 1 na mesma simulação, sem custo extra de visita.
      if (dadosTitulos.naoCobrar && dadosTitulos.naoCobrar.length > 0) {
        return { cliente, excluidoPorNaoCobrar: true };
      }

      const escolhido = escolherTituloRepresentativo(dadosTitulos);
      if (!escolhido) {
        return { cliente, erro: 'sem-titulo-representativo' };
      }

      let promessas = [];
      if (aba.__contextoAdicionalDebug && typeof aba.__contextoAdicionalDebug.lerPromessas === 'function') {
        try {
          promessas = aba.__contextoAdicionalDebug.lerPromessas();
        } catch (erro) {
          console.warn(`[Fila Prioridade] Falha ao ler promessas de "${cliente.label}" -- seguindo sem checar promessa futura:`, erro.message);
        }
      }

      const hoje = normalizarData(new Date());
      const temPromessaFutura = promessas.some(
        (p) => p.dataPrometida && p.dataPrometida.getTime() > hoje.getTime()
      );
      if (temPromessaFutura) {
        return { cliente, excluidoPorPromessaFutura: true };
      }

      // Promessa ATIVA calculada pelo Módulo 6 nesta mesma aba de fundo
      // (já esperada por esperarAbaPronta) -- é o que decide as faixas 4 e
      // 5 da régua. Diferente de `promessas` acima (leitura crua, usada só
      // pra excluir quem tem promessa com data futura), aqui já vem a
      // decisão pronta e cruzada com os títulos ainda em aberto.
      const contextoPromessa = (aba.__contextoAdicional && aba.__contextoAdicional.promessa) || null;

      const prioridade = determinarPrioridade(
        escolhido,
        dadosTitulos.fluxo,
        cliente.cluster,
        contextoPromessa,
        cliente.movimentacaoDataIso,
        hoje
      );

      // CONFIRMADO com o usuário: se outra empresa do mesmo grupo econômico
      // também tem título vencido, só UMA representante do grupo deve
      // entrar na fila (a mais urgente) -- as outras já serão cobradas por
      // tabela via essa mesma visita (ver Alt+A/Alt+G, Módulo 4/5). O
      // Módulo 5 já lê a aba "Grupo" de verdade em toda visita à página do
      // cliente (não é o grupoId da lista, que é outro campo, confirmado
      // via diagnóstico ao vivo) -- window.__alertaGrupo já está disponível
      // de graça nesta mesma aba de fundo, sem custo extra de visita.
      const empresasComVencido = (aba.__alertaGrupo && aba.__alertaGrupo.empresasComVencido) || [];

      return { cliente, escolhido, fluxo: dadosTitulos.fluxo, prioridade, empresasComVencido };
    } finally {
      try {
        if (!aba.closed) aba.close();
      } catch (erro) {
        // aba pode já ter sido fechada manualmente -- ignora.
      }
    }
  }

  // Só os dígitos -- mesmo padrão usado em outros pontos do sistema pra
  // comparar CNPJ entre fontes com formatação diferente (o da URL do
  // candidato vem com barra/traço, o lido da tabela "Clientes do grupo"
  // pode vir só com pontuação, etc.).
  function normalizarCnpj(cnpj) {
    return (cnpj || '').replace(/\D/g, '');
  }

  // Mais urgente = prioridade de tier menor primeiro (1 é a mais urgente);
  // empatando o tier, quem tem mais dias de atraso real vence -- mesmo
  // critério de desempate já usado na ordenação final da fila.
  function maisUrgente(a, b) {
    if (a.prioridade !== b.prioridade) return a.prioridade < b.prioridade ? a : b;
    return a.escolhido.diasAtrasoReal >= b.escolhido.diasAtrasoReal ? a : b;
  }

  // CONFIRMADO com o usuário: quando 2+ clientes do MESMO grupo econômico
  // têm título em aberto, só a representante mais urgente do grupo entra
  // na fila -- as demais já serão cobradas por tabela ao atender essa
  // primeira (Alt+G/Alt+A já cobrem "outras razões do grupo" a partir dela).
  // Só dá pra saber quem é do mesmo grupo DEPOIS de classificar cada um
  // (ver empresasComVencido em classificarCliente), por isso roda aqui,
  // depois do laço de classificação, nunca antes.
  //
  // Agrupamento via união por CNPJ cruzado: dois resultados entram no mesmo
  // cluster se o CNPJ de QUALQUER um aparece na lista empresasComVencido do
  // outro (união também nas duas mãos, pra tolerar o caso da tabela do
  // grupo não listar os dois lados de forma simétrica).
  function filtrarPorGrupoEconomico(resultados) {
    const indicePorCnpj = new Map();
    resultados.forEach((r, i) => {
      const cnpj = normalizarCnpj(r.cliente.cnpj);
      if (cnpj) indicePorCnpj.set(cnpj, i);
    });

    // Union-Find simples (path compression) -- número de candidatos por
    // rodada é pequeno (dezenas), não precisa de nada mais sofisticado.
    const pai = resultados.map((_, i) => i);
    function encontrar(i) {
      while (pai[i] !== i) {
        pai[i] = pai[pai[i]];
        i = pai[i];
      }
      return i;
    }
    function unir(i, j) {
      const raizI = encontrar(i);
      const raizJ = encontrar(j);
      if (raizI !== raizJ) pai[raizI] = raizJ;
    }

    resultados.forEach((r, i) => {
      (r.empresasComVencido || []).forEach((empresa) => {
        const j = indicePorCnpj.get(normalizarCnpj(empresa.cnpj));
        if (j !== undefined && j !== i) unir(i, j);
      });
    });

    const clusters = new Map(); // raiz -> array de índices
    resultados.forEach((_, i) => {
      const raiz = encontrar(i);
      if (!clusters.has(raiz)) clusters.set(raiz, []);
      clusters.get(raiz).push(i);
    });

    const sobreviventes = [];
    let excluidosPorGrupo = 0;

    clusters.forEach((indices) => {
      if (indices.length === 1) {
        sobreviventes.push(resultados[indices[0]]);
        return;
      }
      const vencedor = indices.map((i) => resultados[i]).reduce(maisUrgente);
      sobreviventes.push(vencedor);
      excluidosPorGrupo += indices.length - 1;
    });

    return { sobreviventes, excluidosPorGrupo };
  }

  /* ---------------------------------------------------------------------
   * 6. ORQUESTRAÇÃO (Alt+U)
   * --------------------------------------------------------------------- */
  /**
   * Ordena pela régua (1 primeiro; dentro da faixa, mais dias de atraso
   * primeiro).
   */
  function compararPelaRegua(a, b) {
    if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
    return b.escolhido.diasAtrasoReal - a.escolhido.diasAtrasoReal;
  }

  /**
   * Monta a ordem final da fila, com 1 em cada 5 clientes recebendo posição
   * SORTEADA em vez da posição pela faixa (ver Módulo 8).
   *
   * BUG REAL (achado conferindo uma fila de verdade, 92 clientes): a versão
   * anterior sorteava a chave no espaço das FAIXAS -- `1 + sorteio * 9`,
   * gerando um número em [1, 10). Como a faixa 10 vale exatamente 10, nenhum
   * cliente do controle conseguia ser ordenado DEPOIS de um faixa 10. Na
   * fila real, isso tornava 25 dos 92 lugares (27%) inalcançáveis pro
   * controle, e ele caía no terço final da fila só 12% das vezes em vez de
   * 33%. O grupo de controle existe pra medir o efeito de ser chamado CEDO
   * ou TARDE -- se ele quase nunca é chamado tarde, a comparação mede menos
   * do que deveria, e no sentido que favorece a régua.
   *
   * A causa é que as faixas têm tamanhos MUITO diferentes: a faixa 10
   * sozinha era 27% da fila e ocupava 1/10 do espaço de chaves. Sortear
   * uniformemente no espaço das faixas não é sortear uniformemente no
   * espaço das POSIÇÕES, que é o que importa.
   *
   * Correção: cada não-controle recebe um rank igual à sua posição relativa
   * na régua (0 = primeiro, 1 = último), e cada controle recebe um rank
   * sorteado em [0,1). Ordenar por rank espalha o controle uniformemente
   * pelas posições, independente do tamanho de cada faixa. Verificado em
   * simulação com a distribuição real: 33% / 34% / 33% pelos terços.
   *
   * @param {object[]} resultados Candidatos já classificados.
   * @param {object|null} diario window.__diario, ou null se não carregou.
   * @param {number|null} dia Dia do experimento (AAAAMMDD).
   * @returns {object[]} Nova lista, ordenada.
   */
  function ordenarComGrupoControle(resultados, diario, dia) {
    if (!diario) {
      // Sem o Módulo 8 não há experimento: régua pura, como antes dele existir.
      resultados.forEach((r) => { r.controle = false; });
      return resultados.slice().sort(compararPelaRegua);
    }

    resultados.forEach((r) => {
      r.controle = diario.ehGrupoControle(r.cliente.cnpj, dia);
    });

    const regua = resultados.filter((r) => !r.controle).sort(compararPelaRegua);
    regua.forEach((r, i) => {
      r.rank = regua.length > 1 ? i / (regua.length - 1) : 0.5;
    });

    const controle = resultados.filter((r) => r.controle);
    controle.forEach((r) => {
      r.rank = diario.sorteioEstavel(r.cliente.cnpj, dia);
    });

    return [...regua, ...controle].sort((a, b) => a.rank - b.rank);
  }

  async function iniciar() {
    if (classificandoEmAndamento) {
      toast('Já tem uma classificação em andamento -- aguarde terminar.');
      return;
    }

    const candidatos = candidatosEnriquecidos();
    if (candidatos === null) return; // aviso já foi ao console
    if (candidatos.length === 0) {
      toast('⚠️ Nenhum cliente encontrado nesta página com os seletores atuais.');
      return;
    }

    const { sobreviventes, excluidos } = filtrarPorRegrasDaLista(candidatos);
    // Log detalhado (achado real: sem isso, um resultado final baixo não
    // dá pra saber SE é esperado -- ex.: maioria já mexida hoje de verdade
    // -- ou SE é algum filtro errado excluindo demais, sem precisar pedir
    // mais um diagnóstico manual toda vez).
    // JSON.stringify de propósito, não o objeto cru -- achado real: o
    // Chrome mostra objeto cru como só "Object" quando o console é copiado
    // como texto (precisa expandir clicando ali mesmo, o que não sobrevive
    // a um copiar/colar). Como string, o conteúdo aparece direto.
    console.log('[Fila Prioridade] Candidatos após construirFilaAPartirDaPagina:', candidatos.length);
    console.log('[Fila Prioridade] Detalhamento dos filtros da lista:', JSON.stringify({
      sobreviventes: sobreviventes.length,
      excluidos_mais_de_19_dias: excluidos.dias,
      excluidos_dia_1: excluidos.diaUm,
      excluidos_movimentacao_hoje: excluidos.movimentacaoHoje,
      excluidos_sem_dias_reconhecidos: excluidos.semDias,
    }));
    if (sobreviventes.length === 0) {
      toast('Nenhum cliente elegível depois dos filtros (dias de atraso, dia 1, movimentação de hoje).');
      return;
    }

    classificandoEmAndamento = true;
    atualizarIndicadorProgresso(`Classificando 0/${sobreviventes.length}...`);

    const resultados = [];
    let excluidosPorPromessa = 0;
    let excluidosPorNaoCobrar = 0;
    let comPopupBloqueado = 0;
    let comOutroErro = 0;
    let popupsBloqueadosSeguidos = 0;

    // BUG REAL (relatado pelo usuário, primeiro teste ao vivo): a partir da
    // SEGUNDA aba, window.open() já não está mais dentro do gesto original
    // do Alt+U (cada chamada seguinte vem depois de um await) -- o Chrome
    // bloqueia todas elas como pop-up, e o laço varria os 30-60 candidatos
    // inteiros só pra descobrir isso no final, um por um, sem avisar nada
    // no meio do caminho. Com esse disjuntor, 3 bloqueios seguidos já para
    // tudo e avisa na hora -- é inútil continuar tentando abrir aba se o
    // navegador está bloqueando de forma consistente.
    const LIMITE_POPUPS_BLOQUEADOS_SEGUIDOS = 3;

    for (let i = 0; i < sobreviventes.length; i++) {
      const cliente = sobreviventes[i];
      atualizarIndicadorProgresso(`Classificando ${i + 1}/${sobreviventes.length}: ${cliente.label}`);

      const resultado = await classificarCliente(cliente);
      if (resultado.excluidoPorPromessaFutura) {
        excluidosPorPromessa++;
        popupsBloqueadosSeguidos = 0;
      } else if (resultado.excluidoPorNaoCobrar) {
        excluidosPorNaoCobrar++;
        popupsBloqueadosSeguidos = 0;
      } else if (resultado.erro === 'popup-bloqueado') {
        comPopupBloqueado++;
        popupsBloqueadosSeguidos++;
        if (popupsBloqueadosSeguidos >= LIMITE_POPUPS_BLOQUEADOS_SEGUIDOS) {
          removerIndicadorProgresso();
          classificandoEmAndamento = false;
          console.warn(
            `[Fila Prioridade] Parando cedo: ${popupsBloqueadosSeguidos} pop-ups bloqueados seguidos ` +
            `(${i + 1}/${sobreviventes.length} candidatos verificados).`
          );
          toast(
            '⚠️ O navegador está bloqueando as abas de fundo. Permita pop-ups para texhub.texcotton.com.br ' +
            '(ícone na barra de endereço, ou chrome://settings/content/popups) e tente Alt+U de novo.',
            9000
          );
          return;
        }
      } else if (resultado.erro) {
        comOutroErro++;
        popupsBloqueadosSeguidos = 0;
      } else {
        resultados.push(resultado);
        popupsBloqueadosSeguidos = 0;
      }
    }

    removerIndicadorProgresso();
    classificandoEmAndamento = false;

    // Uma chamada só -- a união-find do grupo econômico não é barata.
    // `let` porque a ordenação com grupo de controle devolve uma lista nova.
    const filtradoPorGrupo = filtrarPorGrupoEconomico(resultados);
    const { excluidosPorGrupo } = filtradoPorGrupo;
    let resultadosSemDuplicataDeGrupo = filtradoPorGrupo.sobreviventes;

    console.log('[Fila Prioridade] Detalhamento da classificação (abas de fundo):', JSON.stringify({
      classificados_com_sucesso: resultados.length,
      excluidos_por_promessa_futura: excluidosPorPromessa,
      excluidos_por_nao_cobrar: excluidosPorNaoCobrar,
      pulados_por_popup_bloqueado: comPopupBloqueado,
      com_outro_erro_timeout: comOutroErro,
      excluidos_por_grupo_economico_ja_representado: excluidosPorGrupo,
    }));

    if (resultadosSemDuplicataDeGrupo.length === 0) {
      toast('Classificação terminou, mas nenhum cliente ficou elegível pra fila.', 5000);
      return;
    }

    // Ordena por prioridade (1 primeiro) e, dentro da mesma prioridade,
    // por dias de atraso decrescente -- mesmo critério de urgência que o
    // resto do sistema já usa.
    //
    // GRUPO DE CONTROLE (Módulo 8): 1 em cada 5 clientes recebe uma posição
    // SORTEADA, independente da faixa dele. Sem isso, comparar faixa 3 com
    // faixa 9 não diz nada sobre a régua -- as faixas contêm clientes
    // diferentes por construção (dias de atraso, SCPC, promessa), então quem
    // está 2 dias atrasado pagaria mais que quem está 30 em QUALQUER ordem.
    // Com o controle, dá pra comparar o mesmo tipo de cliente chamado cedo
    // (pela régua) e chamado em posição aleatória, que é o que isola o efeito
    // da ORDEM. O sorteio é determinístico por (cnpj, dia): rodar o Alt+U
    // duas vezes no mesmo dia não remexe o experimento.
    const diario = window.__diario;
    const diaDoExperimento = diario ? diario.chaveDia() : null;
    resultadosSemDuplicataDeGrupo = ordenarComGrupoControle(resultadosSemDuplicataDeGrupo, diario, diaDoExperimento);

    // Registra a ATRIBUIÇÃO do dia: faixa, posição final e grupo. Um lote só,
    // um acesso ao localStorage -- gravar 150 vezes seguidas durante o Alt+U
    // seria desperdício. Se o diário não estiver carregado, segue sem ele.
    if (diario) {
      diario.registrarLote(
        'fila',
        resultadosSemDuplicataDeGrupo.map((r, indice) => ({
          c: r.cliente.cnpj,
          f: r.prioridade,
          p: indice + 1,
          k: r.controle ? 1 : 0,
          s: r.escolhido.situacaoKey,
          a: r.escolhido.diasAtrasoReal,
        }))
      );
    }

    const clientesDaFila = resultadosSemDuplicataDeGrupo.map((r) => Object.assign({}, r.cliente, {
      diasAtraso: r.escolhido.diasAtrasoReal,
      prioridadeTier: r.prioridade,
      prioridadeNome: NOMES_PRIORIDADE[r.prioridade],
      grupoControle: r.controle,
    }));

    // Registra a ATRIBUIÇÃO do dia: faixa, posição final e grupo. Um lote só,
    // um acesso ao localStorage -- gravar 150 vezes seguidas durante o Alt+U
    // seria desperdício. Se o diário não estiver carregado, segue sem ele.
    if (diario) {
      diario.registrarLote(
        'fila',
        resultadosSemDuplicataDeGrupo.map((r, indice) => ({
          c: r.cliente.cnpj,
          f: r.prioridade,
          p: indice + 1,
          k: r.controle ? 1 : 0,
          s: r.escolhido.situacaoKey,
          a: r.escolhido.diasAtrasoReal,
        }))
      );
    }

    const fila = {
      versao: window.filaDebug.CONFIG.VERSAO_SCHEMA,
      clientes: clientesDaFila,
      indiceAtual: -1,
      totalAtendidos: 0,
      totalPulados: 0,
      iniciadoEm: Date.now(),
    };
    window.filaDebug.salvarFila(fila);

    const resumoPartes = [`▶ Fila por prioridade: ${clientesDaFila.length} cliente(s)`];
    if (excluidos.dias || excluidos.diaUm || excluidos.movimentacaoHoje) {
      resumoPartes.push(
        `${excluidos.dias + excluidos.diaUm + excluidos.movimentacaoHoje} excluído(s) pela lista (dias/dia 1/movimentação hoje)`
      );
    }
    if (excluidosPorPromessa) resumoPartes.push(`${excluidosPorPromessa} excluído(s) por promessa futura`);
    if (excluidosPorNaoCobrar) resumoPartes.push(`${excluidosPorNaoCobrar} excluído(s) por alerta de não cobrar`);
    if (comPopupBloqueado) resumoPartes.push(`${comPopupBloqueado} pulado(s) por pop-up bloqueado`);
    if (comOutroErro) resumoPartes.push(`${comOutroErro} com erro/timeout`);
    if (excluidosPorGrupo) resumoPartes.push(`${excluidosPorGrupo} excluído(s) por já ter representante do grupo na fila`);
    const duracaoResumoMs = 6000;
    toast(resumoPartes.join(' -- '), duracaoResumoMs);

    console.log(
      '[Fila Prioridade] Fila montada:',
      JSON.stringify(clientesDaFila.map((c) => ({ label: c.label, diasAtraso: c.diasAtraso, prioridadeTier: c.prioridadeTier, prioridadeNome: c.prioridadeNome })))
    );

    // CORRIGIDO (bug real: o resumo acima mal dava tempo de aparecer antes
    // da navegação apagar a página) -- espera o toast terminar de verdade
    // antes de navegar, em vez dos 400ms que bastavam só pro "fila
    // iniciada" simples do Alt+I (sem nada crítico pra ler ali).
    setTimeout(() => {
      window.location.href = clientesDaFila[0].url;
    }, duracaoResumoMs);
  }

  /* ---------------------------------------------------------------------
   * 7. AVISO DE TROCA DE PRIORIDADE (roda em toda página, como o Módulo 3)
   * --------------------------------------------------------------------- */
  // Só reage a filas montadas por ESTE módulo (clientes com prioridadeTier
  // definido) -- uma fila comum do Alt+I nunca tem esse campo, então isso
  // nunca dispara pra ela. Compara o cliente atual com o anterior na fila;
  // se a prioridade mudou (pra qualquer direção -- avançando ou voltando),
  // avisa. Depende do Módulo 3 já ter rodado sincronizarPosicao() nesta
  // mesma carga de página (é o que atualiza fila.indiceAtual pra bater com
  // a URL atual) -- por isso este módulo precisa vir DEPOIS do Módulo 3 no
  // @require.
  function avisarSeTrocouDePrioridade() {
    if (!window.filaDebug || typeof window.filaDebug.obterFila !== 'function') return;
    const fila = window.filaDebug.obterFila();
    if (!fila || fila.indiceAtual == null || fila.indiceAtual < 0) return;

    const atual = fila.clientes[fila.indiceAtual];
    if (!atual || atual.prioridadeTier == null) return; // não é uma fila por prioridade

    if (fila.indiceAtual === 0) {
      toastTrocaPrioridade('Prioridade', atual.prioridadeTier, atual.prioridadeNome);
      return;
    }

    const anterior = fila.clientes[fila.indiceAtual - 1];
    if (anterior && anterior.prioridadeTier !== atual.prioridadeTier) {
      toastTrocaPrioridade('Entrando na prioridade', atual.prioridadeTier, atual.prioridadeNome);
    }
  }

  /* ---------------------------------------------------------------------
   * 8. INICIALIZAÇÃO
   * --------------------------------------------------------------------- */
  function aoCarregar() {
    // Dá tempo do Módulo 3 rodar sincronizarPosicao() primeiro (mesmo
    // documento, ordem de @require já garante isso na prática, mas o
    // setTimeout(0) é uma rede de segurança barata contra reordenação
    // futura por engano).
    setTimeout(() => {
      try {
        avisarSeTrocouDePrioridade();
      } catch (erro) {
        console.error('[Fila Prioridade] Erro ao checar troca de prioridade -- continuando mesmo assim.', erro);
      }
    }, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aoCarregar);
  } else {
    aoCarregar();
  }

  window.filaPrioridadeDebug = {
    CONFIG,
    NOMES_PRIORIDADE,
    ordenarComGrupoControle,
    compararPelaRegua,
    iniciar,
    candidatosEnriquecidos,
    filtrarPorRegrasDaLista,
    determinarPrioridade,
    movimentacaoMaisDeUmMes,
    filtrarPorGrupoEconomico,
    escolherTituloRepresentativo,
  };
})();
