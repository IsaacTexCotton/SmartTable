/* =========================================================================
 * MÓDULO 8: DIÁRIO DE COBRANÇA — CRM TexCotton
 * -------------------------------------------------------------------------
 * Registra o que aconteceu, pra permitir responder uma pergunta que hoje
 * ninguém consegue responder: a régua de prioridade do Alt+U funciona?
 *
 * O QUE ELE GRAVA (três tipos de evento):
 *   - 'fila'    : um por candidato, a cada rodada do Alt+U. Guarda a faixa
 *                 calculada, a POSIÇÃO final na fila e se o cliente caiu no
 *                 grupo de controle daquele dia.
 *   - 'contato' : quando a cobrança REALMENTE saiu (Módulo 3 confirma que o
 *                 WhatsApp abriu), com a hora -- é ela que diz se ser chamado
 *                 cedo muda alguma coisa.
 *   - 'baixa'   : quando o Módulo 6 detecta título que sumiu da lista.
 *
 * O QUE ELE NÃO É: não é prova de causa. Ver a seção "LIMITES" no fim deste
 * cabeçalho -- está lá de propósito, pra ninguém ler o relatório como se
 * fosse mais do que é.
 *
 * SEGURANÇA: isto é instrumentação em cima de uma ferramenta de cobrança em
 * produção. NADA aqui pode derrubar o fluxo -- toda gravação é try/catch, e
 * falha vira aviso no console, nunca exceção que suba pro chamador.
 *
 * ARMAZENAMENTO: uma chave de localStorage POR DIA
 * ("smarttable_diario_v1_20260917"). Com ~290 eventos/dia, um array único
 * exigiria JSON.parse + stringify de megabytes A CADA evento -- inviável
 * durante uma rodada de Alt+U que grava 150 de uma vez. Por dia, cada blob
 * fica na casa das dezenas de KB. Limpeza é apagar chave antiga, sem
 * reescrever nada.
 *
 * Onde colar: logo depois do Módulo 0 -- os módulos 3, 6 e 7 dependem dele.
 *
 * LIMITES (ler antes de tirar conclusão):
 *   1. "Pagou" é INFERÊNCIA. O que o sistema vê é título que sumiu da lista
 *      de vencidos. Renegociação, baixa manual e mudança pra NÃO COBRAR
 *      produzem o mesmo sinal.
 *   2. Comparar faixa 3 com faixa 9 NÃO diz se a régua é boa. As faixas
 *      contêm clientes diferentes por construção (dias de atraso, SCPC,
 *      promessa). Quem está 2 dias atrasado paga mais que quem está 30 em
 *      qualquer ordem. Por isso existe o GRUPO DE CONTROLE: só a comparação
 *      controle vs. régua isola o efeito da ORDEM.
 *   3. Cada negociador tem seu próprio localStorage. Os dados não se juntam
 *      sozinhos -- use exportar() nos dois e junte fora.
 * ========================================================================= */
(function () {
  'use strict';

  if (window.__diarioCarregado) return;
  window.__diarioCarregado = true;

  const CONFIG_DIARIO = {
    PREFIXO_CHAVE: 'smarttable_diario_v1_',
    // Quantos dias de evento cru manter. Com ~290 eventos/dia a ~90 bytes,
    // 120 dias ficam perto de 3 MB -- dentro do orçamento típico de 5 MB do
    // localStorage, já contando o que os Módulos 3 e 6 guardam.
    DIAS_RETENCAO: 120,
    // A partir daqui, avisa no console pra exportar e limpar.
    LIMITE_AVISO_BYTES: 3_500_000,
    // LIGA/DESLIGA o grupo de controle (a parte que reordena 20% da fila).
    //
    // DESLIGADO por decisão do usuário. O raciocínio: gravar é de graça e não
    // tem risco, mas reordenar tem um custo que se paga TODO DIA -- ~18 dos
    // ~92 clientes da fila são chamados fora da ordem da régua -- enquanto o
    // benefício só chega em semanas, e só se alguma decisão for tomada a
    // partir do resultado. Somando a isso que o desenho do sorteio já saiu
    // errado uma vez (a chave era sorteada no espaço das faixas, e o controle
    // nunca alcançava o fim da fila -- achado só quando o usuário mandou uma
    // fila real), a conta não fechava ainda.
    //
    // Com isso desligado, o diário continua gravando tudo e responde as
    // perguntas DESCRITIVAS (quanto da fila é atendido, quais faixas nunca
    // são chamadas, o que cai em "Demais dias"). O que se perde é a pergunta
    // CAUSAL -- "a ordem da régua ajuda?" -- que só o grupo de controle
    // responde.
    //
    // Pra religar: true aqui, e window.__diario.limpar() antes, pra não
    // misturar período com e sem experimento na mesma análise.
    ATIVAR_GRUPO_CONTROLE: false,
    // 1 em cada 5 clientes entra no grupo de controle (posição sorteada em
    // vez de posição pela régua). Confirmado com o usuário.
    PROPORCAO_CONTROLE: 5,
  };

  /* ---------------------------------------------------------------------
   * 1. DATA E CHAVE
   * --------------------------------------------------------------------- */
  /**
   * Data no formato compacto AAAAMMDD, que é como as chaves são nomeadas e
   * como o campo `d` de cada evento é gravado.
   *
   * @param {Date} [data] Padrão: agora.
   * @returns {number} Ex.: 20260917.
   */
  function chaveDia(data) {
    const d = data ?? new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  function nomeDaChave(diaNumerico) {
    return CONFIG_DIARIO.PREFIXO_CHAVE + diaNumerico;
  }

  /** Todas as chaves do diário hoje presentes no localStorage. */
  function chavesExistentes() {
    const chaves = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CONFIG_DIARIO.PREFIXO_CHAVE)) chaves.push(k);
      }
    } catch (erro) {
      console.warn('[Diário] Não consegui listar o localStorage.', erro);
    }
    return chaves.sort();
  }

  function diaDaChave(chave) {
    return Number(chave.slice(CONFIG_DIARIO.PREFIXO_CHAVE.length));
  }

  /* ---------------------------------------------------------------------
   * 2. LEITURA E ESCRITA (nunca lançam)
   * --------------------------------------------------------------------- */
  function lerDia(diaNumerico) {
    try {
      const bruto = localStorage.getItem(nomeDaChave(diaNumerico));
      if (!bruto) return [];
      const lista = JSON.parse(bruto);
      return Array.isArray(lista) ? lista : [];
    } catch (erro) {
      console.warn(`[Diário] Dia ${diaNumerico} ilegível -- tratando como vazio.`, erro);
      return [];
    }
  }

  function gravarDia(diaNumerico, eventos) {
    try {
      localStorage.setItem(nomeDaChave(diaNumerico), JSON.stringify(eventos));
      return true;
    } catch (erro) {
      // Cota estourada é o caso esperado aqui. Não pode derrubar a cobrança:
      // avisa, sugere o caminho de saída e segue.
      console.warn(
        '[Diário] Não consegui gravar (cota do localStorage?). O registro deste evento foi perdido, ' +
        'mas a cobrança segue normal. Rode window.__diario.exportar() e depois window.__diario.limpar().',
        erro
      );
      return false;
    }
  }

  /**
   * Apaga dias além da janela de retenção. Roda uma vez por carregamento de
   * página, não a cada evento -- varrer o localStorage 150 vezes durante uma
   * rodada de Alt+U seria desperdício puro.
   */
  function limparAntigos() {
    const limite = chaveDia(new Date(Date.now() - CONFIG_DIARIO.DIAS_RETENCAO * 86400000));
    chavesExistentes().forEach((chave) => {
      if (diaDaChave(chave) < limite) {
        try {
          localStorage.removeItem(chave);
        } catch (erro) {
          /* sem drama -- tenta de novo no próximo carregamento */
        }
      }
    });
  }

  /* ---------------------------------------------------------------------
   * 3. REGISTRO
   * --------------------------------------------------------------------- */
  /**
   * Grava um evento no dia de hoje.
   *
   * Campos curtos de propósito: com ~290 eventos por dia, nome de chave é
   * volume. `t` tipo, `d` dia, `h` hora (minutos desde a meia-noite), `c`
   * cnpj, `n` negociador -- o resto vem de `dados`.
   *
   * @param {'fila'|'contato'|'baixa'} tipo
   * @param {object} dados Campos específicos do tipo.
   * @returns {boolean} true se gravou.
   */
  function registrar(tipo, dados) {
    try {
      const agora = new Date();
      const dia = chaveDia(agora);
      const evento = Object.assign(
        {
          t: tipo,
          d: dia,
          h: agora.getHours() * 60 + agora.getMinutes(),
          n: window.__contextoAdicional?.nomeNegociador ?? '',
        },
        dados ?? {}
      );
      const eventos = lerDia(dia);
      eventos.push(evento);
      return gravarDia(dia, eventos);
    } catch (erro) {
      console.warn('[Diário] Falha inesperada ao registrar evento -- ignorando.', erro);
      return false;
    }
  }

  /**
   * Grava vários eventos de uma vez, num único acesso ao localStorage.
   * É o caminho do Alt+U: 150 candidatos numa rodada só.
   *
   * @param {'fila'|'contato'|'baixa'} tipo
   * @param {object[]} listaDeDados
   * @returns {number} Quantos foram gravados (0 se a gravação falhou).
   */
  function registrarLote(tipo, listaDeDados) {
    if (!Array.isArray(listaDeDados) || listaDeDados.length === 0) return 0;
    try {
      const agora = new Date();
      const dia = chaveDia(agora);
      const h = agora.getHours() * 60 + agora.getMinutes();
      const n = window.__contextoAdicional?.nomeNegociador ?? '';
      const eventos = lerDia(dia);
      listaDeDados.forEach((dados) => eventos.push(Object.assign({ t: tipo, d: dia, h, n }, dados)));
      return gravarDia(dia, eventos) ? listaDeDados.length : 0;
    } catch (erro) {
      console.warn('[Diário] Falha inesperada ao registrar lote -- ignorando.', erro);
      return 0;
    }
  }

  /* ---------------------------------------------------------------------
   * 4. GRUPO DE CONTROLE (o que torna a medição interpretável)
   * --------------------------------------------------------------------- */
  /**
   * Hash determinístico e estável de string (variante de cyrb53, sem
   * dependência externa). Mesma entrada, mesmo número, sempre -- inclusive
   * entre recarregamentos e entre máquinas.
   *
   * @param {string} texto
   * @returns {number} Inteiro não negativo.
   */
  function hashEstavel(texto) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < texto.length; i += 1) {
      const ch = texto.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }

  /**
   * Decide se um cliente entra no grupo de controle NESTE dia.
   *
   * Determinístico por (cnpj, dia): rodar o Alt+U duas vezes no mesmo dia dá
   * o mesmo sorteio, então reprocessar não contamina o experimento. Muda de
   * um dia pro outro, então nenhum cliente fica preso no controle pra sempre.
   *
   * @param {string} cnpj
   * @param {number} [dia] AAAAMMDD; padrão hoje.
   * @returns {boolean}
   */
  function ehGrupoControle(cnpj, dia) {
    // Lido em tempo de chamada, não no carregamento: assim dá pra ligar e
    // desligar pelo console (window.__diario.CONFIG_DIARIO.ATIVAR_GRUPO_CONTROLE)
    // sem recarregar a página.
    if (!CONFIG_DIARIO.ATIVAR_GRUPO_CONTROLE) return false;
    const chave = `${cnpj}|${dia ?? chaveDia()}`;
    return hashEstavel(chave) % CONFIG_DIARIO.PROPORCAO_CONTROLE === 0;
  }

  /**
   * Número pseudoaleatório em [0,1), estável por (cnpj, dia). Usado pra dar
   * ao cliente de controle uma posição na fila INDEPENDENTE da faixa dele --
   * que é justamente o que torna a comparação capaz de isolar o efeito da
   * ordem.
   *
   * @param {string} cnpj
   * @param {number} [dia]
   * @returns {number}
   */
  function sorteioEstavel(cnpj, dia) {
    return (hashEstavel(`pos|${cnpj}|${dia ?? chaveDia()}`) % 1000000) / 1000000;
  }

  /* ---------------------------------------------------------------------
   * 5. LEITURA PRA ANÁLISE
   * --------------------------------------------------------------------- */
  /**
   * Todos os eventos guardados, do mais antigo pro mais recente.
   *
   * @param {object} [filtro]
   * @param {'fila'|'contato'|'baixa'} [filtro.tipo]
   * @param {number} [filtro.ultimosDias]
   * @returns {object[]}
   */
  function eventos(filtro = {}) {
    const limite = filtro.ultimosDias
      ? chaveDia(new Date(Date.now() - filtro.ultimosDias * 86400000))
      : 0;

    return chavesExistentes()
      .map(diaDaChave)
      .filter((dia) => dia >= limite)
      .flatMap((dia) => lerDia(dia))
      .filter((e) => !filtro.tipo || e.t === filtro.tipo);
  }

  /** Tamanho aproximado do diário em bytes. */
  function tamanho() {
    return chavesExistentes().reduce((total, chave) => {
      try {
        return total + (localStorage.getItem(chave) ?? '').length;
      } catch (erro) {
        return total;
      }
    }, 0);
  }

  /** Baixa o diário inteiro como JSON, pra juntar os dados de duas pessoas. */
  function exportar() {
    const dados = { exportadoEm: new Date().toISOString(), eventos: eventos() };
    const blob = new Blob([JSON.stringify(dados)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diario-smarttable-${chaveDia()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    console.log(`[Diário] Exportados ${dados.eventos.length} eventos.`);
  }

  /** Apaga TUDO. Pede confirmação, porque dado de medição não volta. */
  function limpar() {
    const total = eventos().length;
    if (!window.confirm(`Apagar o diário inteiro (${total} eventos)? Isso não tem volta.`)) return;
    chavesExistentes().forEach((chave) => {
      try {
        localStorage.removeItem(chave);
      } catch (erro) {
        /* ignora */
      }
    });
    console.log('[Diário] Diário apagado.');
  }

  /* ---------------------------------------------------------------------
   * 6. ANÁLISE
   * --------------------------------------------------------------------- */
  /**
   * Cruza os três tipos de evento e devolve os números crus.
   *
   * A junção é por (cnpj, dia): pra cada atribuição de fila, procura um
   * contato no MESMO dia e uma baixa dentro da janela de acompanhamento.
   *
   * @param {object} [opcoes]
   * @param {number} [opcoes.ultimosDias] Recorte da análise.
   * @param {number} [opcoes.janelaBaixaDias] Dias após a cobrança em que uma
   *   baixa ainda é atribuída a ela. Padrão 7.
   * @returns {object} Linhas por faixa e o par régua/controle.
   */
  function analisar(opcoes = {}) {
    const janela = opcoes.janelaBaixaDias ?? 7;
    const todos = eventos({ ultimosDias: opcoes.ultimosDias });

    // DEDUPLICA por (cnpj, dia): o mesmo cliente pode ter VÁRIAS atribuições
    // no mesmo dia, e contar todas infla "na fila" e derruba a taxa de
    // contato pela metade -- números descritivos errados, justamente os que
    // sobraram depois do grupo de controle ser desligado.
    //
    // Duas causas, uma delas legítima:
    //   1. BUG (corrigido): o Módulo 7 chamava registrarLote duas vezes por
    //      rodada, sobra de um refactor. Achado num relatório real do usuário,
    //      onde as posições 1-36 apareciam repetidas.
    //   2. LEGÍTIMA: rodar o Alt+U mais de uma vez no dia. A fila encolhe
    //      conforme o dia passa (quem já teve movimentação hoje sai), então
    //      92 de manhã viram 36 à tarde -- e quem estava nas duas aparece
    //      duas vezes, com posições diferentes.
    //
    // Fica a PRIMEIRA atribuição do dia: é ela que reflete a ordem com que o
    // dia foi planejado, sobre a fila inteira. As rodadas seguintes são
    // recálculos sobre o que sobrou, com posições que não correspondem à
    // decisão de ordem que de fato valeu.
    const vistos = new Set();
    const filas = [];
    let atribuicoesRepetidas = 0;
    todos.filter((e) => e.t === 'fila').forEach((e) => {
      const chave = `${e.c}|${e.d}`;
      if (vistos.has(chave)) { atribuicoesRepetidas += 1; return; }
      vistos.add(chave);
      filas.push(e);
    });
    const contatos = new Set(todos.filter((e) => e.t === 'contato').map((e) => `${e.c}|${e.d}`));

    // Baixas indexadas por cnpj, em ordem de dia, pra procurar dentro da janela.
    const baixasPorCnpj = new Map();
    todos.filter((e) => e.t === 'baixa').forEach((e) => {
      if (!baixasPorCnpj.has(e.c)) baixasPorCnpj.set(e.c, []);
      baixasPorCnpj.get(e.c).push(e.d);
    });

    /** Distância em dias entre dois AAAAMMDD (aproximada via Date). */
    function distanciaEmDias(de, ate) {
      const d1 = new Date(Math.floor(de / 10000), (Math.floor(de / 100) % 100) - 1, de % 100);
      const d2 = new Date(Math.floor(ate / 10000), (Math.floor(ate / 100) % 100) - 1, ate % 100);
      return Math.round((d2 - d1) / 86400000);
    }

    /** Primeira baixa do cliente dentro da janela depois da cobrança. */
    function diasAteBaixa(cnpj, diaFila) {
      const dias = baixasPorCnpj.get(cnpj) ?? [];
      const candidatos = dias
        .map((d) => distanciaEmDias(diaFila, d))
        .filter((delta) => delta >= 0 && delta <= janela);
      return candidatos.length > 0 ? Math.min(...candidatos) : null;
    }

    const linhas = filas.map((e) => ({
      faixa: e.f,
      posicao: e.p,
      controle: e.k === 1,
      contatado: contatos.has(`${e.c}|${e.d}`),
      diasAteBaixa: diasAteBaixa(e.c, e.d),
    }));

    /** Agrega um conjunto de linhas em contadores legíveis. */
    function resumir(conjunto) {
      const contatados = conjunto.filter((l) => l.contatado);
      const comBaixa = conjunto.filter((l) => l.diasAteBaixa !== null);
      const prazos = comBaixa.map((l) => l.diasAteBaixa).sort((a, b) => a - b);
      return {
        atribuicoes: conjunto.length,
        contatados: contatados.length,
        taxaContato: conjunto.length ? contatados.length / conjunto.length : 0,
        comBaixa: comBaixa.length,
        taxaBaixa: conjunto.length ? comBaixa.length / conjunto.length : 0,
        medianaDiasAteBaixa: prazos.length ? prazos[Math.floor(prazos.length / 2)] : null,
        posicaoMediana: conjunto.length
          ? conjunto.map((l) => l.posicao).sort((a, b) => a - b)[Math.floor(conjunto.length / 2)]
          : null,
      };
    }

    const porFaixa = {};
    for (let faixa = 1; faixa <= 10; faixa += 1) {
      const doTier = linhas.filter((l) => l.faixa === faixa);
      if (doTier.length > 0) porFaixa[faixa] = resumir(doTier);
    }

    return {
      janelaBaixaDias: janela,
      totalAtribuicoes: linhas.length,
      atribuicoesRepetidas,
      porFaixa,
      // A comparação que de fato isola o efeito da ORDEM.
      regua: resumir(linhas.filter((l) => !l.controle)),
      controle: resumir(linhas.filter((l) => l.controle)),
    };
  }

  const pct = (v) => `${(v * 100).toFixed(1)}%`;

  /**
   * Imprime a análise no console, com os limites de interpretação junto --
   * não separados num documento que ninguém abre na hora de decidir.
   *
   * @param {object} [opcoes] Mesmas de analisar().
   */
  function relatorio(opcoes = {}) {
    const a = analisar(opcoes);

    if (a.totalAtribuicoes === 0) {
      console.log('[Diário] Nenhuma atribuição de fila registrada ainda. Rode o Alt+U por alguns dias.');
      return a;
    }

    console.log(`\n=== DIÁRIO DE COBRANÇA — ${a.totalAtribuicoes} atribuições de fila ===`);
    console.log(`Janela para atribuir uma baixa à cobrança: ${a.janelaBaixaDias} dias.`);
    if (a.atribuicoesRepetidas > 0) {
      console.log(
        `${a.atribuicoesRepetidas} atribuição(ões) repetida(s) foram agrupadas -- normal quando o Alt+U ` +
        'roda mais de uma vez no mesmo dia; vale a primeira rodada do dia.'
      );
    }
    console.log('');

    console.log('--- Por faixa da régua (OBSERVACIONAL — ver aviso no fim) ---');
    console.table(
      Object.fromEntries(
        Object.entries(a.porFaixa).map(([faixa, r]) => [
          `${faixa}. ${window.filaPrioridadeDebug?.NOMES_PRIORIDADE?.[faixa] ?? ''}`.trim(),
          {
            'na fila': r.atribuicoes,
            'contatados': `${r.contatados} (${pct(r.taxaContato)})`,
            'com baixa': `${r.comBaixa} (${pct(r.taxaBaixa)})`,
            'mediana dias p/ baixa': r.medianaDiasAteBaixa ?? '—',
          },
        ])
      )
    );

    if (!CONFIG_DIARIO.ATIVAR_GRUPO_CONTROLE && a.controle.atribuicoes === 0) {
      console.log(
        '\n--- Régua vs. Controle: DESLIGADO ---\n' +
        '  O grupo de controle está desativado, então a fila sai 100% na ordem da régua.\n' +
        '  Sem ele não dá pra responder "a ordem da régua ajuda?" -- as faixas contêm\n' +
        '  clientes diferentes por construção, e comparar uma com a outra mede o cliente,\n' +
        '  não a régua. A tabela acima continua valendo pra COBERTURA (quem nunca é\n' +
        '  chamado, o que cai em "Demais dias").\n' +
        '  Pra ligar: window.__diario.CONFIG_DIARIO.ATIVAR_GRUPO_CONTROLE = true\n' +
        '  (rode window.__diario.limpar() antes, pra não misturar os dois períodos).'
      );
      return a;
    }

    console.log('\n--- Régua vs. Controle (é ESTA comparação que responde a pergunta) ---');
    console.table({
      'Ordenado pela régua': {
        'na fila': a.regua.atribuicoes,
        'posição mediana': a.regua.posicaoMediana ?? '—',
        'contatados': pct(a.regua.taxaContato),
        'com baixa': pct(a.regua.taxaBaixa),
        'mediana dias p/ baixa': a.regua.medianaDiasAteBaixa ?? '—',
      },
      'Posição sorteada (controle)': {
        'na fila': a.controle.atribuicoes,
        'posição mediana': a.controle.posicaoMediana ?? '—',
        'contatados': pct(a.controle.taxaContato),
        'com baixa': pct(a.controle.taxaBaixa),
        'mediana dias p/ baixa': a.controle.medianaDiasAteBaixa ?? '—',
      },
    });

    const MINIMO_PRA_COMPARAR = 300;
    if (a.controle.atribuicoes < MINIMO_PRA_COMPARAR) {
      console.warn(
        `[Diário] Ainda são só ${a.controle.atribuicoes} casos no controle. Abaixo de ~${MINIMO_PRA_COMPARAR} ` +
        'a diferença entre os dois grupos é ruído com aparência de resultado. Deixe acumular antes de concluir.'
      );
    }

    console.log(
      '\n%cComo ler isto:%c\n' +
      '  • A tabela POR FAIXA não diz se a régua é boa. As faixas contêm clientes\n' +
      '    diferentes por construção -- quem está 2 dias atrasado paga mais que quem\n' +
      '    está 30 em qualquer ordem. Ela serve pra ver cobertura (quem nunca é chamado).\n' +
      '  • A comparação RÉGUA vs CONTROLE é a que isola o efeito da ordem, porque o\n' +
      '    controle tem posição sorteada, independente da faixa.\n' +
      '  • "com baixa" é INFERÊNCIA: título que sumiu da lista de vencidos. Renegociação\n' +
      '    e baixa manual produzem o mesmo sinal.\n' +
      '  • Os dados são deste navegador. Use exportar() em cada máquina e junte fora.',
      'font-weight:bold', 'font-weight:normal'
    );

    return a;
  }

  /* ---------------------------------------------------------------------
   * 7. INICIALIZAÇÃO
   * --------------------------------------------------------------------- */
  limparAntigos();

  const bytes = tamanho();
  if (bytes > CONFIG_DIARIO.LIMITE_AVISO_BYTES) {
    console.warn(
      `[Diário] Já são ~${(bytes / 1_000_000).toFixed(1)} MB guardados. ` +
      'Rode window.__diario.exportar() e depois window.__diario.limpar() pra não esbarrar na cota do navegador.'
    );
  }

  if (CONFIG_DIARIO.ATIVAR_GRUPO_CONTROLE) {
    console.log(
      `%c[Diário] Grupo de controle LIGADO -- 1 em cada ${CONFIG_DIARIO.PROPORCAO_CONTROLE} clientes recebe posição sorteada na fila.`,
      'color:#8A2A16;font-weight:bold;'
    );
  }

  window.__diario = {
    registrar,
    registrarLote,
    analisar,
    relatorio,
    ehGrupoControle,
    sorteioEstavel,
    eventos,
    tamanho,
    exportar,
    limpar,
    chaveDia,
    hashEstavel,
    CONFIG_DIARIO,
  };
})();
