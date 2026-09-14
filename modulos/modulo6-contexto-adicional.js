/* =========================================================================
 * MÓDULO 6: CONTEXTO ADICIONAL (Promessas + Contato Recente) — CRM TexCotton
 * -------------------------------------------------------------------------
 * O que faz: ao entrar na página do cliente, lê as abas "Promessas" e
 * "Contatos" (que já vêm pré-carregadas no HTML, confirmado -- não precisa
 * abrir aba igual ao Módulo 5) e calcula:
 *
 *   1. Se hoje é o dia combinado de alguma promessa de pagamento, ou o
 *      primeiro dia útil depois dela com status "Quebrada"/"Parcial".
 *   2. Se o contato mais recente do cliente foi no último dia útil (e foi
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
 *   - Promessa "Pendente" no dia útil seguinte (prazo passou mas o CRM
 *     ainda não marcou Quebrada/Parcial) não tem frase aprovada -- é
 *     ignorada de propósito, não por esquecimento.
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

  const CONFIG_CONTEXTO = {
    SELETOR_ITEM_PROMESSA: '#content-promessas .promessa-item',
    SELETOR_ITEM_CONTATO: '#content-contatos .contato-item',
    STATUS_DIA_DA_PROMESSA: 'PENDENTE',
    STATUS_COM_FRASE_NO_DIA_SEGUINTE: ['QUEBRADA', 'PARCIAL'],
  };

  /* ---------------------------------------------------------------------
   * 1. CALENDÁRIO -- reaproveita feriados do Módulo 1 (window.__avisoCobranca),
   * mas precisa da direção "dia útil ANTERIOR", que não existe lá (Módulo 1
   * só tem "a partir de"/"próximo", sempre pra frente no tempo).
   * --------------------------------------------------------------------- */
  function normalizarData(data) {
    const d = new Date(data);
    d.setHours(12, 0, 0, 0);
    return d;
  }

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

  // Sempre estritamente DEPOIS da data informada -- espelha proximoDiaUtil()
  // do Módulo 1 (não exposto em window.__avisoCobranca).
  function proximoDiaUtil(data) {
    let d = adicionarDias(data, 1);
    let guarda = 0;
    while (!ehDiaUtil(d)) {
      d = adicionarDias(d, 1);
      if (++guarda > 30) throw new Error('Não encontrei o próximo dia útil a partir de ' + chaveData(data));
    }
    return d;
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
        const status = (item.dataset.status || '').toUpperCase();
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

    // Prioridade 2: hoje é o 1º dia útil depois de alguma promessa que ficou
    // Quebrada ou Parcial. "Pendente" nesse mesmo dia (CRM ainda não
    // atualizou) fica de fora de propósito -- sem frase aprovada pra isso.
    for (const p of promessas) {
      let diaSeguinte;
      try {
        diaSeguinte = proximoDiaUtil(p.dataPrometida);
      } catch (erro) {
        continue;
      }
      if (mesmaData(hoje, diaSeguinte) && CONFIG_CONTEXTO.STATUS_COM_FRASE_NO_DIA_SEGUINTE.indexOf(p.status) !== -1) {
        return { tipo: p.status, promessa: p }; // 'QUEBRADA' ou 'PARCIAL'
      }
    }

    return null;
  }

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

  function calcularContexto() {
    const hoje = normalizarData(new Date());
    const totalContatos = document.querySelectorAll(CONFIG_CONTEXTO.SELETOR_ITEM_CONTATO).length;
    return {
      promessa: calcularContextoPromessa(hoje),
      contatoRecente: calcularContextoContato(hoje),
      semContatoAnterior: totalContatos === 0,
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
      window.__contextoAdicional = { promessa: null, contatoRecente: null, semContatoAnterior: false, calcularTitulosPendentes };
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
        window.__contextoAdicional = { promessa: null, contatoRecente: null, semContatoAnterior: false, calcularTitulosPendentes };
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
    calcularContextoPromessa,
  };
})();
