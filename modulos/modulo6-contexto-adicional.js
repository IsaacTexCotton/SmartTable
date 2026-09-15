/* =========================================================================
 * MÓDULO 6: CONTEXTO ADICIONAL (Promessas + Contato Recente) — CRM TexCotton
 * -------------------------------------------------------------------------
 * O que faz: ao entrar na página do cliente, lê as abas "Promessas" e
 * "Contatos" (que já vêm pré-carregadas no HTML, confirmado -- não precisa
 * abrir aba igual ao Módulo 5) e calcula:
 *
 *   1. Se hoje é o dia combinado de alguma promessa de pagamento (status
 *      ainda "Pendente").
 *   2. Se alguma promessa já venceu (status "Pendente" vencida, "Quebrada"
 *      ou "Parcial" -- pro cliente dá na mesma: o pagamento combinado não
 *      foi identificado) E ainda não houve NENHUM contato registrado desde
 *      o vencimento. CONFIRMADO com o usuário: a mensagem é só no primeiro
 *      contato depois que a promessa vence -- não um dia específico (nem
 *      precisa ser dia útil), e sem limite de quantos dias já se passaram.
 *      Não repete em toda visita seguinte, só até o primeiro contato
 *      registrado depois do vencimento.
 *   3. Se o contato mais recente do cliente foi no último dia útil (e foi
 *      efetivo), pra permitir uma linha de "retomando o contato de ontem".
 *
 * O resultado fica em window.__contextoAdicional, pronto pra ser consultado
 * pelo Alt+A (Módulo 4) sem precisar trocar de aba na hora do atalho.
 *
 * Onde colar: anexado ao FINAL do smart-table.js, depois dos módulos 1 a 5.
 * Depende só de window.__avisoCobranca (Módulo 1) pra feriados e pra cruzar
 * títulos pendentes -- se ele não estiver carregado, degrada com avisos no
 * console em vez de quebrar.
 *
 * PREMISSAS AINDA NÃO CONFIRMADAS COM O USUÁRIO (documentadas de propósito,
 * revisar se o comportamento real divergir):
 *   - "Já houve contato desde o vencimento" conta QUALQUER contato
 *     registrado (efetivo ou não) com data posterior à data prometida --
 *     não só contato efetivo. Decisão: uma tentativa de contato já
 *     registrada é suficiente pra não repetir o lembrete, mesmo sem
 *     resposta do cliente. Revisar se o usuário preferir outro critério.
 *   - "Título pendente" no caso Parcial é calculado por cruzamento: título
 *     da promessa que já não aparece mais na lista de abertos do Módulo 1
 *     é considerado pago. Isso também classificaria como "pago" um título
 *     renegociado/cancelado por outro motivo -- risco aceito, não há como
 *     diferenciar com o dado disponível hoje.
 * ========================================================================= */
(function () {
  'use strict';

  if (window.__contextoAdicionalCarregado) return;
  window.__contextoAdicionalCarregado = true;

  // Utilitários compartilhados (Módulo 0) -- precisa estar carregado ANTES
  // deste arquivo no @require do wrapper.
  const { normalizarData } = window.__smartTableUtil;

  // Confirmação visual de que a versão certa carregou -- resposta direta pro
  // problema de "o Tampermonkey atualizou mesmo?" que já causou confusão
  // (o wrapper pode estar em @version novo enquanto os @require ainda estão
  // em cache antigo). MANTER SINCRONIZADO MANUALMENTE com @version em
  // smart-table.user.js a cada bump -- é o único módulo que faz esse aviso,
  // de propósito, pra não repetir o toast em cada um dos 6 módulos.
  const VERSAO_SMARTTABLE = '1.0.55';

  function avisarVersaoCarregada() {
    console.log(
      `%c[SmartTable] v${VERSAO_SMARTTABLE} carregado (7 módulos)`,
      'color:#16232F;font-weight:bold;font-size:12px;'
    );

    if (!document.body) return; // segurança extra, não deveria acontecer em document-idle

    const el = document.createElement('div');
    el.textContent = `SmartTable v${VERSAO_SMARTTABLE} ✓`;
    Object.assign(el.style, {
      position: 'fixed',
      top: '16px',
      left: '16px',
      background: '#16232F',
      color: '#fff',
      padding: '6px 12px',
      borderRadius: '8px',
      boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
      fontSize: '12px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      zIndex: 999999,
      opacity: '0',
      transition: 'opacity .25s ease',
      pointerEvents: 'none',
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 4000);
  }

  avisarVersaoCarregada();

  const CONFIG_CONTEXTO = {
    SELETOR_ITEM_PROMESSA: '#content-promessas .promessa-item',
    SELETOR_ITEM_CONTATO: '#content-contatos .contato-item',
    STATUS_DIA_DA_PROMESSA: 'PENDENTE',
    // Qualquer um destes remete a "não pagamento" pro cliente -- CONFIRMADO
    // com o usuário que "Pendente" vencida entra junto de "Quebrada" e
    // "Parcial" (o CRM às vezes não atualiza o status a tempo, mas o
    // pagamento combinado segue sem ser identificado do mesmo jeito).
    // "Cumprida"/"Cumprida Parcial" ficam de fora de propósito (resolvidas).
    STATUS_NAO_PAGAMENTO: ['PENDENTE', 'QUEBRADA', 'PARCIAL'],
    // CONFIRMADO com o usuário: cliente com pelo menos um contato registrado,
    // mas cujo contato mais recente é ANTERIOR a essa data (ou seja, todos
    // os contatos são anteriores -- checar só o mais recente já cobre isso),
    // recebe uma linha de apresentação extra na mensagem (ver contatoAntigo).
    DATA_CORTE_CONTATO_ANTIGO: { ano: 2026, mes: 8, dia: 10 }, // 10/08/2026
  };

  /* ---------------------------------------------------------------------
   * 1. CALENDÁRIO -- reaproveita feriados do Módulo 1 (window.__avisoCobranca),
   * mas precisa da direção "dia útil ANTERIOR", que não existe lá (Módulo 1
   * só tem "a partir de"/"próximo", sempre pra frente no tempo).
   * --------------------------------------------------------------------- */
  function chaveData(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return ano + '-' + mes + '-' + dia;
  }

  function adicionarDias(data, quantidade) {
    const d = new Date(data);
    d.setDate(d.getDate() + quantidade);
    return normalizarData(d);
  }

  function mesmaData(a, b) {
    return !!(a && b && chaveData(a) === chaveData(b));
  }

  function obterFeriadosDoAno(ano) {
    if (window.__avisoCobranca && typeof window.__avisoCobranca.feriados === 'function') {
      try {
        return window.__avisoCobranca.feriados(ano);
      } catch (erro) {
        console.warn('[Contexto Adicional] Falha ao obter feriados do Módulo 1:', erro.message);
      }
    }
    return [];
  }

  function ehDiaUtil(data) {
    const diaSemana = data.getDay();
    if (diaSemana === 0 || diaSemana === 6) return false;
    return obterFeriadosDoAno(data.getFullYear()).indexOf(chaveData(data)) === -1;
  }

  // Sempre estritamente ANTES da data informada -- direção nova que o
  // Módulo 1 não tem (só anda pra frente no tempo).
  function diaUtilAnterior(data) {
    let d = adicionarDias(data, -1);
    let guarda = 0;
    while (!ehDiaUtil(d)) {
      d = adicionarDias(d, -1);
      if (++guarda > 30) throw new Error('Não encontrei o dia útil anterior a ' + chaveData(data));
    }
    return d;
  }

  function formatarDataBr(data) {
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    return dia + '/' + mes + '/' + data.getFullYear();
  }

  const NOMES_DIA_SEMANA = [
    'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
    'quinta-feira', 'sexta-feira', 'sábado',
  ];

  function nomeDiaSemana(data) {
    return NOMES_DIA_SEMANA[data.getDay()];
  }

  function converterDataBr(texto) {
    // Aceita "26/08/2026" (promessa) ou "10/09/2026 16:08" (contato) --
    // usa só a parte da data, ignora hora se vier.
    const m = (texto || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return null;
    const [, dia, mes, ano] = m;
    return normalizarData(new Date(Number(ano), Number(mes) - 1, Number(dia)));
  }

  /* ---------------------------------------------------------------------
   * 2. LEITURA: PROMESSAS
   * --------------------------------------------------------------------- */
  function lerTitulosDoItem(item) {
    // Procura o container pelo texto do rótulo ("Títulos:"), não pela
    // classe Tailwind -- mais resistente a mudança de estilo, mesmo
    // princípio já usado nos módulos 4 e 5 pra achar elemento por texto.
    const containerTitulos = Array.from(item.querySelectorAll('div')).find((d) => {
      const rotulo = d.querySelector('span');
      return rotulo && rotulo.textContent.trim() === 'Títulos:';
    });
    if (!containerTitulos) return [];
    return Array.from(containerTitulos.querySelectorAll('span.bg-gray-100')).map((s) => s.textContent.trim());
  }

  function lerPromessas() {
    const itens = document.querySelectorAll(CONFIG_CONTEXTO.SELETOR_ITEM_PROMESSA);
    return Array.from(itens)
      .map((item) => {
        // CONFIRMADO com outerHTML real: "data-status" não está no próprio
        // ".promessa-item", está num filho (<div class="flex-1 cursor-pointer"
        // data-status="PENDENTE" ...>). Ler item.dataset.status direto sempre
        // dava vazio -- por isso a linha de promessa nunca aparecia, mesmo com
        // data e títulos lidos certinho.
        const elementoComStatus = item.querySelector('[data-status]');
        const status = ((elementoComStatus && elementoComStatus.dataset.status) || '').toUpperCase();
        const spanData = item.querySelector('p.text-xs.text-gray-500 span');
        const dataPrometidaTexto = spanData ? spanData.textContent.trim() : null;
        return {
          status,
          dataPrometidaTexto,
          dataPrometida: dataPrometidaTexto ? converterDataBr(dataPrometidaTexto) : null,
          titulos: lerTitulosDoItem(item),
        };
      })
      .filter((p) => p.dataPrometida); // descarta se não conseguiu ler a data
  }

  /* ---------------------------------------------------------------------
   * 3. LEITURA: CONTATO MAIS RECENTE
   * --------------------------------------------------------------------- */
  // Varre TODOS os ".contato-item" e escolhe o de data mais recente, em vez
  // de confiar que o primeiro do DOM já é o mais novo -- essa suposição não
  // era confirmada (ver nota no cabeçalho do arquivo) e causava inconsistência
  // real: clientes contatados em dias diferentes (ex.: quinta e sexta)
  // acabavam recebendo a mesma linha "contato de ontem", porque o item
  // pego não era de fato o contato mais recente de cada um.
  function lerContatoMaisRecente() {
    const itens = document.querySelectorAll(CONFIG_CONTEXTO.SELETOR_ITEM_CONTATO);
    let maisRecente = null;

    itens.forEach((item) => {
      const data = converterDataBr(item.dataset.data); // ex.: "10/09/2026 16:08"
      if (!data) return;
      if (!maisRecente || data.getTime() > maisRecente.data.getTime()) {
        maisRecente = { data, efetivo: item.dataset.efetivo === 'true' };
      }
    });

    return maisRecente;
  }

  // Histórico completo (não só o mais recente) -- necessário pra saber se
  // JÁ houve algum contato depois do vencimento de uma promessa, não só
  // qual foi o último. Inclui contatos não efetivos de propósito (ver nota
  // "PREMISSA AINDA NÃO CONFIRMADA" no cabeçalho do arquivo).
  function lerTodosContatos() {
    const itens = document.querySelectorAll(CONFIG_CONTEXTO.SELETOR_ITEM_CONTATO);
    return Array.from(itens)
      .map((item) => ({
        data: converterDataBr(item.dataset.data),
        efetivo: item.dataset.efetivo === 'true',
      }))
      .filter((c) => c.data);
  }

  /* ---------------------------------------------------------------------
   * 4. CÁLCULO DO CONTEXTO DE HOJE
   * --------------------------------------------------------------------- */
  function calcularContextoPromessa(hoje) {
    const promessas = lerPromessas();

    // Prioridade 1: alguma promessa é justamente pra hoje (e ainda não foi
    // resolvida antes da hora -- só faz sentido lembrar se ainda pendente).
    const paraHoje = promessas.find(
      (p) => mesmaData(hoje, p.dataPrometida) && p.status === CONFIG_CONTEXTO.STATUS_DIA_DA_PROMESSA
    );
    if (paraHoje) return { tipo: 'DIA_DA_PROMESSA', promessa: paraHoje };

    // Prioridade 2: alguma promessa já venceu (data prometida no passado) e
    // continua sem pagamento identificado (Pendente vencida, Quebrada ou
    // Parcial). CONFIRMADO com o usuário: não é "só no dia útil seguinte" --
    // é "só no primeiro contato depois do vencimento", não importa quantos
    // dias (úteis ou não) já se passaram. Por isso cobra se NENHUM contato
    // foi registrado com data posterior ao vencimento; assim que o primeiro
    // contato pós-vencimento é registrado, a mensagem para de aparecer nas
    // visitas seguintes (mesmo que a promessa continue sem resolução no CRM).
    const contatos = lerTodosContatos();
    const vencidasSemPagamento = promessas
      .filter(
        (p) =>
          CONFIG_CONTEXTO.STATUS_NAO_PAGAMENTO.indexOf(p.status) !== -1 &&
          p.dataPrometida.getTime() < hoje.getTime()
      )
      // Promessa mais antiga primeiro -- a que está esperando resposta há
      // mais tempo é a mais relevante quando há mais de uma vencida.
      .sort((a, b) => a.dataPrometida.getTime() - b.dataPrometida.getTime());

    for (const p of vencidasSemPagamento) {
      const jaContatadoDepoisDoVencimento = contatos.some(
        (c) => c.data.getTime() > p.dataPrometida.getTime()
      );
      if (!jaContatadoDepoisDoVencimento) {
        // "Pendente" vencida usa a mesma frase de "Quebrada" -- pro cliente
        // é a mesma situação (pagamento combinado não identificado), o CRM
        // só não atualizou o status ainda.
        const tipo = p.status === 'PARCIAL' ? 'PARCIAL' : 'QUEBRADA';
        return { tipo, promessa: p };
      }
    }

    return null;
  }

  // REVERTIDO (confirmado com o usuário): a tentativa de reconhecer
  // recontato com intervalo maior que "ontem" (dia útil anterior) estava
  // puxando datas velhas demais, sem relação com a cobrança atual --
  // "retomando nosso contato de [data antiga]" ficava estranho e
  // desconectado do que estava sendo cobrado agora. Volta a valer só
  // quando o contato mais recente foi EXATAMENTE o dia útil anterior.
  function calcularContextoContato(hoje) {
    const contato = lerContatoMaisRecente();
    if (!contato || !contato.data || !contato.efetivo) return null;

    let diaAnterior;
    try {
      diaAnterior = diaUtilAnterior(hoje);
    } catch (erro) {
      return null;
    }

    if (!mesmaData(contato.data, diaAnterior)) return null;

    // "Ontem" só é literalmente verdade quando o dia útil anterior cai no
    // dia de calendário anterior (terça a sexta, sem feriado no meio). Numa
    // segunda-feira -- ou terça após feriado na segunda -- o dia útil
    // anterior pula um fim de semana e "ontem" fica incorreto; nesses casos
    // o Módulo 4 usa diaSemanaTexto (ex.: "sexta-feira") em vez de "ontem".
    const ontemCalendario = adicionarDias(hoje, -1);
    return {
      data: contato.data,
      dataTexto: formatarDataBr(contato.data),
      ehOntemLiteral: mesmaData(contato.data, ontemCalendario),
      diaSemanaTexto: nomeDiaSemana(contato.data),
    };
  }

  // Cruza os títulos de uma promessa com os títulos que AINDA aparecem em
  // aberto no Módulo 1 -- o que sumiu da lista, presumimos pago (ver
  // ressalva no cabeçalho do arquivo sobre esse presumível).
  function calcularTitulosPendentes(titulosDaPromessa) {
    if (!window.__avisoCobranca || typeof window.__avisoCobranca.simular !== 'function') {
      return titulosDaPromessa; // sem dado do Módulo 1, assume tudo pendente
    }
    try {
      const dados = window.__avisoCobranca.simular();
      const abertos = new Set(dados.registros.map((r) => r.tituloCompleto));
      return titulosDaPromessa.filter((t) => abertos.has(t));
    } catch (erro) {
      console.warn('[Contexto Adicional] Não foi possível cruzar títulos pendentes:', erro.message);
      return titulosDaPromessa;
    }
  }

  /* ---------------------------------------------------------------------
   * 4b. DETECÇÃO DE PAGAMENTO SEM PROMESSA (retrato de títulos vencidos)
   * -----------------------------------------------------------------
   * CONFIRMADO com o usuário: se um título sumiu da lista de vencidos
   * desde a última vez que esta página foi aberta (bem provavelmente
   * porque foi pago), o relatório deve continuar sendo enviado no
   * recontato -- deveOmitirRelatorio (Módulo 4) só detectava título
   * NOVO, não título que sumiu.
   *
   * Não há como ler a coluna "Dt. pagamento" direto do CRM sem trocar o
   * filtro visível da tabela de títulos pra "Pagos" (investigado com o
   * usuário: a tabela é RECONSTRUÍDA por filtro, não é só esconder
   * linhas -- mexer nisso trocaria o que está na tela do operador).
   * Alternativa combinada com o usuário: guardamos no localStorage, por
   * CNPJ, quais títulos estavam vencidos na última vez que a página foi
   * aberta, e comparamos com a visita atual.
   *
   * RISCO ACEITO (avisado ao usuário): só funciona neste navegador/
   * computador -- não sincroniza entre máquinas -- e é uma inferência (o
   * título pode ter sumido por outro motivo, não só pagamento -- ex.:
   * renegociação, baixa manual). Mas nunca gera informação financeira
   * ERRADA: isso só decide SE o relatório é reenviado -- o conteúdo do
   * relatório em si sempre é montado com os dados ao vivo da página no
   * momento do envio, nunca a partir do retrato salvo.
   * --------------------------------------------------------------------- */
  const CHAVE_SNAPSHOT_TITULOS = 'smarttable_snapshot_titulos_v1';
  // Entradas de clientes não revisitados há mais que isso são descartadas
  // a cada gravação -- sem isso, o objeto no localStorage só cresce.
  const DIAS_EXPIRACAO_SNAPSHOT_TITULOS = 30;

  function obterCnpjDaPagina() {
    try {
      return new URLSearchParams(location.search).get('cnpj');
    } catch (erro) {
      return null;
    }
  }

  function lerSnapshotsTitulos() {
    try {
      const raw = localStorage.getItem(CHAVE_SNAPSHOT_TITULOS);
      const dados = raw ? JSON.parse(raw) : {};
      return dados && typeof dados === 'object' ? dados : {};
    } catch (erro) {
      console.warn('[Contexto Adicional] Não consegui ler o retrato de títulos do localStorage -- tratando como vazio.', erro);
      return {};
    }
  }

  function salvarSnapshotsTitulos(snapshots) {
    try {
      localStorage.setItem(CHAVE_SNAPSHOT_TITULOS, JSON.stringify(snapshots));
    } catch (erro) {
      console.warn('[Contexto Adicional] Não consegui salvar o retrato de títulos no localStorage.', erro);
    }
  }

  // Compara com o retrato salvo da visita anterior (se houver) ANTES de
  // sobrescrever com o retrato atual -- sempre roda as duas coisas juntas,
  // nessa ordem. Aproveita a gravação pra descartar entradas antigas de
  // outros clientes.
  // Retorna { houve, titulos } -- titulos é a lista dos tituloCompleto que
  // sumiram desde o retrato anterior (provavelmente pagos), pra dar pra
  // agradecer o pagamento pelo número certo em vez de só um boolean genérico
  // (ver obterLinhaAgradecimentoPagamento no Módulo 4).
  function verificarESalvarSnapshotTitulos() {
    const cnpj = obterCnpjDaPagina();
    if (!cnpj) return { houve: false, titulos: [] };
    if (!window.__avisoCobranca || typeof window.__avisoCobranca.simular !== 'function') {
      return { houve: false, titulos: [] };
    }

    let dados;
    try {
      dados = window.__avisoCobranca.simular();
    } catch (erro) {
      return { houve: false, titulos: [] }; // tabela de títulos ainda não carregou nesta visita -- sem dado pra comparar
    }

    const titulosAtuais = dados.registros.map((r) => r.tituloCompleto);
    const snapshots = lerSnapshotsTitulos();
    const anterior = snapshots[cnpj];

    const titulosSumidos =
      anterior && Array.isArray(anterior.titulos)
        ? anterior.titulos.filter((t) => titulosAtuais.indexOf(t) === -1)
        : [];

    const agora = Date.now();
    const limiteMs = DIAS_EXPIRACAO_SNAPSHOT_TITULOS * 24 * 60 * 60 * 1000;
    const snapshotsLimpos = {};
    Object.keys(snapshots).forEach((chaveCnpj) => {
      const entrada = snapshots[chaveCnpj];
      if (entrada && typeof entrada.salvoEm === 'number' && (agora - entrada.salvoEm) < limiteMs) {
        snapshotsLimpos[chaveCnpj] = entrada;
      }
    });
    snapshotsLimpos[cnpj] = { titulos: titulosAtuais, salvoEm: agora };
    salvarSnapshotsTitulos(snapshotsLimpos);

    return { houve: titulosSumidos.length > 0, titulos: titulosSumidos };
  }

  // true quando há pelo menos um contato registrado, mas o mais recente
  // deles é anterior à data de corte -- checar só o mais recente já cobre
  // "todos são anteriores", já que por definição nenhum outro pode ser
  // mais novo que ele.
  function calcularContatoAntigo(totalContatos) {
    if (totalContatos === 0) return false;
    const maisRecente = lerContatoMaisRecente();
    if (!maisRecente) return false;
    const { ano, mes, dia } = CONFIG_CONTEXTO.DATA_CORTE_CONTATO_ANTIGO;
    const dataCorte = normalizarData(new Date(ano, mes - 1, dia));
    return maisRecente.data.getTime() < dataCorte.getTime();
  }

  // CONFIRMADO com o usuário (bug real): se existe uma promessa datada
  // pro mesmo dia do último contato -- INDEPENDENTE do status atual dela
  // (mesmo já paga/resolvida, então fora de calcularContextoPromessa) --
  // é porque o cliente retornou naquele contato. "Retomando o contato de
  // ontem, já que ainda não obtivemos retorno" fica errado nesse caso.
  function houvePromessaNaDataDoUltimoContato(contatoRecente) {
    if (!contatoRecente || !contatoRecente.data) return false;
    const promessas = lerPromessas();
    return promessas.some((p) => mesmaData(p.dataPrometida, contatoRecente.data));
  }

  function calcularContexto() {
    const hoje = normalizarData(new Date());
    const totalContatos = document.querySelectorAll(CONFIG_CONTEXTO.SELETOR_ITEM_CONTATO).length;
    const contatoRecente = calcularContextoContato(hoje);
    const infoPagamento = verificarESalvarSnapshotTitulos();
    return {
      promessa: calcularContextoPromessa(hoje),
      contatoRecente,
      houvePromessaNoUltimoContato: houvePromessaNaDataDoUltimoContato(contatoRecente),
      houveTituloPagoDesdeUltimaVisita: infoPagamento.houve,
      titulosPagosDesdeUltimaVisita: infoPagamento.titulos,
      semContatoAnterior: totalContatos === 0,
      contatoAntigo: calcularContatoAntigo(totalContatos),
      calcularTitulosPendentes,
    };
  }

  /* ---------------------------------------------------------------------
   * 5. INICIALIZAÇÃO
   * --------------------------------------------------------------------- */
  function montarEExpor() {
    try {
      window.__contextoAdicional = calcularContexto();
      console.log('[Contexto Adicional] Calculado:', window.__contextoAdicional);
    } catch (erro) {
      console.warn('[Contexto Adicional] Falha ao calcular -- Alt+A segue funcionando sem essas linhas extras:', erro.message);
      window.__contextoAdicional = { promessa: null, contatoRecente: null, houvePromessaNoUltimoContato: false, houveTituloPagoDesdeUltimaVisita: false, titulosPagosDesdeUltimaVisita: [], semContatoAnterior: false, contatoAntigo: false, calcularTitulosPendentes };
    }
  }

  function aguardarConteudoEExecutar() {
    // Confirmado com o usuário: Promessas/Contatos já vêm pré-carregados no
    // HTML (diferente do Grupo, no Módulo 5) -- na maioria das vezes isso já
    // resolve na primeira checagem. O observer é só rede de segurança pro
    // instante inicial de carregamento da página.
    if (document.getElementById('content-promessas') && document.getElementById('content-contatos')) {
      montarEExpor();
      return;
    }

    const observer = new MutationObserver(() => {
      if (document.getElementById('content-promessas') && document.getElementById('content-contatos')) {
        observer.disconnect();
        montarEExpor();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      if (!window.__contextoAdicional) {
        console.warn(
          '[Contexto Adicional] Containers de Promessas/Contatos não encontrados nesta página -- normal fora da tela de cliente.'
        );
        window.__contextoAdicional = { promessa: null, contatoRecente: null, houvePromessaNoUltimoContato: false, houveTituloPagoDesdeUltimaVisita: false, titulosPagosDesdeUltimaVisita: [], semContatoAnterior: false, contatoAntigo: false, calcularTitulosPendentes };
      }
    }, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aguardarConteudoEExecutar);
  } else {
    aguardarConteudoEExecutar();
  }

  // Hooks de depuração (mesmo padrão do window.filaDebug no Módulo 3 e do
  // window.__avisoCobranca no Módulo 1). Rodar no console, na página do
  // cliente, pra diagnosticar sem precisar copiar HTML manualmente:
  //   window.__contextoAdicionalDebug.lerPromessas()
  //     -> mostra o que foi de fato extraído de cada .promessa-item (status,
  //        data lida, títulos). Array vazio ou dataPrometida:null aqui
  //        indica que os seletores (baseados em classes Tailwind nunca
  //        confirmadas com HTML real) não bateram com a estrutura da
  //        página -- não é problema de data/status, é de leitura do DOM.
  //   window.__contextoAdicionalDebug.calcularContextoPromessa(new Date())
  //     -> roda a decisão final (DIA_DA_PROMESSA / QUEBRADA / PARCIAL / null)
  //        com a data de agora, sem esperar o carregamento da página.
  window.__contextoAdicionalDebug = {
    lerPromessas,
    lerContatoMaisRecente,
    lerTodosContatos,
    calcularContextoPromessa,
    calcularContatoAntigo,
    CHAVE_SNAPSHOT_TITULOS,
    DIAS_EXPIRACAO_SNAPSHOT_TITULOS,
    lerSnapshotsTitulos,
    salvarSnapshotsTitulos,
    verificarESalvarSnapshotTitulos,
    obterCnpjDaPagina,
  };
})();
