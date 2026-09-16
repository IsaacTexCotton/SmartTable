// Testes de composição de mensagem do Módulo 4 (Alt+A) -- portados de
// fuzz-mensagens/harness.js (bateria combinatória criada com o
// /playwright-expert e depois estendida via /debugging-wizard), rodando
// contra o código REAL de modulos/modulo4-atalhos-teclado.js via
// window.__atalhosDebug.montarMensagemPersonalizada.
const { novaJanela } = require('./helpers/dom-env');

const SPECS = [{ arquivo: 'modulo0-utilitarios-compartilhados.js' }, { arquivo: 'modulo4-atalhos-teclado.js' }];

const window = novaJanela({
  url: 'https://texhub.texcotton.com.br/crm/clientes/grupo/1?cnpj=11111111%2F0001-11',
  specs: SPECS,
});

const montar = window.__atalhosDebug && window.__atalhosDebug.montarMensagemPersonalizada;
if (typeof montar !== 'function') {
  console.error('FALHA: window.__atalhosDebug.montarMensagemPersonalizada não foi exposta.');
  process.exitCode = 1;
  return;
}

// ---------------------------------------------------------------------
// Helpers pra montar cenários realistas
// ---------------------------------------------------------------------
function registro(situacaoKey, opcoes) {
  return Object.assign({
    titulo: '90001',
    parcela: '1',
    tituloCompleto: '90001/1',
    razaoSocial: 'CLIENTE TESTE LTDA',
    vencimentoTexto: '01/09/2026',
    saldoTexto: 'R$ 1.000,00',
    diasAtrasoReal: 3,
    diasInformados: 3,
    divergenciaDias: false,
    situacaoKey,
  }, opcoes || {});
}

function ctxBase(overrides) {
  return Object.assign({
    promessa: null,
    contatoRecente: null,
    houvePromessaNoUltimoContato: false,
    houveTituloPagoDesdeUltimaVisita: false,
    titulosPagosDesdeUltimaVisita: [],
    semContatoAnterior: false,
    contatoAntigo: false,
    nuncaContatadoPorMim: false,
    // Nome do negociador logado (Módulo 6 deriva do código do CRM).
    nomeNegociador: 'Isaac',
    calcularTitulosPendentes: (t) => t,
  }, overrides || {});
}

const contatoRecenteOntem = {
  data: new Date(2026, 8, 14),
  dataTexto: '14/09/2026',
  ehOntemLiteral: true,
  diaSemanaTexto: 'segunda-feira',
};

// ---------------------------------------------------------------------
// Matriz de cenários
// ---------------------------------------------------------------------
const situacoesBase = ['EM_ATRASO', 'PRAZO_FINAL', 'ULTIMO_DIA', 'EM_CARTORIO'];
const scpcDias = [3, 10, 15, 16, 17, 18, 19, 20, 25];
const promessaTipos = [
  null,
  { tipo: 'DIA_DA_PROMESSA', promessa: { titulos: ['90001/1'] } },
  { tipo: 'QUEBRADA', promessa: { dataPrometidaTexto: '10/09/2026', titulos: ['90001/1'] } },
  { tipo: 'PARCIAL', promessa: { dataPrometidaTexto: '10/09/2026', titulos: ['90001/1', '90002/1'] } },
];
const contatoRecenteOpcoes = [null, contatoRecenteOntem];
const grupoOpcoes = [false, true];
const houveTituloPagoOpcoes = [false, true];
// Vira dimensão da matriz (achado da revisão de código): como bloco
// isolado, essa flag só era testada com contatoRecente=null -- foi
// exatamente a combinação NÃO testada (outro negociador falou ontem +
// eu nunca falei) que produziu mensagem contraditória em produção.
const nuncaContatadoPorMimOpcoes = [false, true];

let total = 0;
const achados = [];

function checarIncongruencias(msg, cenario) {
  const problemas = [];

  if (!msg) return problemas; // null é esperado em alguns casos (VERIFICAR_POSICAO), tratado à parte

  if (/\{\{[a-zA-Z0-9_.]+\}\}/.test(msg)) {
    const vars = msg.match(/\{\{[a-zA-Z0-9_.]+\}\}/g);
    problemas.push(`Variável não resolvida na mensagem: ${vars.join(', ')}`);
  }

  if (/ainda não obtivemos retorno/.test(msg)) {
    if (/Notamos que o pagamento combinado/.test(msg) || /Identificamos o pagamento parcial/.test(msg) || /hoje é o dia combinado/.test(msg)) {
      problemas.push('Diz "ainda não obtivemos retorno" JUNTO com linguagem de promessa/pagamento na mesma mensagem.');
    }
  }

  // BUG REAL (achado na revisão de código): se apresentar como primeira vez
  // E dizer "retomando o contato de X" na mesma mensagem é contraditório --
  // acontecia quando OUTRO negociador falou ontem e este nunca falou.
  if (/Sou [A-Za-zÀ-ÿ]+ do financeiro/.test(msg) && /Retomando o contato de/.test(msg)) {
    problemas.push('Se apresenta como primeiro contato E diz "Retomando o contato de..." na mesma mensagem.');
  }

  const mencionaRelatorioAbaixo = /no relatório abaixo/.test(msg);
  const enviouRelatorio = /Segue o relatório/.test(msg);
  if (mencionaRelatorioAbaixo && !enviouRelatorio) {
    problemas.push('Menciona "no relatório abaixo" mas a mensagem NÃO inclui a linha "Segue o relatório...".');
  }

  const corpoSemSaudacaoParaPergunta = msg.replace(/^(Bom dia|Boa tarde|Boa noite), tudo bem\?\n*/, '');
  if (!/\?/.test(corpoSemSaudacaoParaPergunta)) {
    problemas.push('Mensagem NÃO tem nenhuma pergunta/pedido de ação além da saudação.');
  }

  const semSaudacao = msg.replace(/^(Bom dia|Boa tarde|Boa noite), tudo bem\?\n*/, '').trim();
  if (semSaudacao.length < 15 && !cenario.semContatoAnterior) {
    problemas.push(`Mensagem quase vazia além da saudação: "${semSaudacao}"`);
  }

  if (cenario.situacaoEscolhida === 'EM_CARTORIO' && /antes de ser(em)? encaminhados? (ao SCPC|para cartório)/.test(msg)) {
    problemas.push('Situação já é EM_CARTORIO mas a mensagem avisa que o título "vai ser encaminhado" (como se ainda não tivesse sido).');
  }

  if (['ULTIMO_DIA', 'EM_CARTORIO'].includes(cenario.situacaoEscolhida) && /Podemos agendar para hoje o pagamento do débito em aberto\?/.test(msg)) {
    problemas.push(`Situação avançada (${cenario.situacaoEscolhida}) mas usa o CTA genérico "Podemos agendar..." em vez do CTA escalado.`);
  }

  if (cenario.houvePromessaNoUltimoContato && /Retomando o contato/.test(msg)) {
    problemas.push('houvePromessaNoUltimoContato=true mas a linha "Retomando o contato..." ainda apareceu.');
  }

  if (cenario.temPromessaAtiva && /Retomando o contato/.test(msg)) {
    problemas.push('Promessa ativa (ctx.promessa) mas a linha "Retomando o contato..." ainda apareceu.');
  }

  if (/Recebemos a baixa/.test(msg) && /ainda não obtivemos retorno/.test(msg)) {
    problemas.push('Agradece pagamento ("Recebemos a baixa...") e diz "ainda não obtivemos retorno" na mesma mensagem.');
  }

  if (
    cenario.houveTituloPago &&
    !cenario.temPromessaAtiva &&
    cenario.contatoRecenteAtivo &&
    !/Recebemos a baixa/.test(msg)
  ) {
    problemas.push('houveTituloPago=true sem promessa ativa e dentro da janela de contatoRecente, mas a mensagem não agradece o pagamento.');
  }

  return problemas;
}

function rodarCenario(cenario) {
  total++;
  let msg;
  let erro = null;
  try {
    msg = montar(cenario.dados);
  } catch (e) {
    erro = e;
  }

  if (erro) {
    achados.push({ cenario: cenario.descricao, erro: erro.message, stack: erro.stack });
    return;
  }

  const problemas = checarIncongruencias(msg, cenario);
  if (problemas.length > 0) {
    achados.push({ cenario: cenario.descricao, problemas, mensagem: msg });
  }
}

// --- Gera a matriz -------------------------------------------------------
situacoesBase.forEach((sit) => {
  contatoRecenteOpcoes.forEach((contatoRecente) => {
    promessaTipos.forEach((promessa) => {
      grupoOpcoes.forEach((temGrupo) => {
        houveTituloPagoOpcoes.forEach((houveTituloPago) => {
          nuncaContatadoPorMimOpcoes.forEach((nuncaContatadoPorMim) => {
            window.__alertaGrupo = temGrupo
              ? { empresasComVencido: [{ cnpj: '2', razaoSocial: 'OUTRA RAZAO', vencido: 'R$ 500,00', url: 'https://x' }] }
              : { empresasComVencido: [] };

            const registros = [registro(sit)];
            const dados = { registros, fluxo: 'CARTORIO' };
            window.__contextoAdicional = ctxBase({
              promessa,
              contatoRecente,
              houvePromessaNoUltimoContato: false,
              houveTituloPagoDesdeUltimaVisita: houveTituloPago,
              titulosPagosDesdeUltimaVisita: houveTituloPago ? ['90099/1'] : [],
              nuncaContatadoPorMim,
            });

            rodarCenario({
              descricao: `sit=${sit} contatoRecente=${!!contatoRecente} promessa=${promessa ? promessa.tipo : 'null'} grupo=${temGrupo} titPago=${houveTituloPago} nuncaContatadoPorMim=${nuncaContatadoPorMim}`,
              dados,
              situacaoEscolhida: sit,
              houvePromessaNoUltimoContato: false,
              temPromessaAtiva: !!promessa,
              semContatoAnterior: false,
              houveTituloPago,
              contatoRecenteAtivo: !!contatoRecente,
            });
          });
        });
      });
    });
  });
});

// --- SCPC: varia os dias de atraso especificamente ------------------------
scpcDias.forEach((dias) => {
  contatoRecenteOpcoes.forEach((contatoRecente) => {
    window.__alertaGrupo = { empresasComVencido: [] };
    const registros = [registro('NEGATIVADO_SCPC', { diasAtrasoReal: dias, diasInformados: dias })];
    const dados = { registros, fluxo: 'SCPC' };
    window.__contextoAdicional = ctxBase({ contatoRecente });
    rodarCenario({
      descricao: `SCPC dias=${dias} contatoRecente=${!!contatoRecente}`,
      dados,
      situacaoEscolhida: 'NEGATIVADO_SCPC',
      houvePromessaNoUltimoContato: false,
      temPromessaAtiva: false,
      semContatoAnterior: false,
    });
  });
});

// --- houvePromessaNoUltimoContato=true, SEM ctx.promessa (promessa já paga)
situacoesBase.forEach((sit) => {
  window.__alertaGrupo = { empresasComVencido: [] };
  const registros = [registro(sit)];
  const dados = { registros, fluxo: 'CARTORIO' };
  window.__contextoAdicional = ctxBase({
    contatoRecente: contatoRecenteOntem,
    promessa: null,
    houvePromessaNoUltimoContato: true,
  });
  rodarCenario({
    descricao: `houvePromessaNoUltimoContato=true sit=${sit}`,
    dados,
    situacaoEscolhida: sit,
    houvePromessaNoUltimoContato: true,
    temPromessaAtiva: false,
    semContatoAnterior: false,
  });
});

// --- múltiplos títulos com situações diferentes (escolherTituloRepresentativo em ação)
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const registros = [
    registro('EM_ATRASO', { titulo: 'A', tituloCompleto: 'A/1', vencimentoTexto: '13/09/2026', diasAtrasoReal: 2 }),
    registro('ULTIMO_DIA', { titulo: 'B', tituloCompleto: 'B/1', vencimentoTexto: '09/09/2026', diasAtrasoReal: 6 }),
    registro('EM_CARTORIO', { titulo: 'C', tituloCompleto: 'C/1', vencimentoTexto: '01/09/2026', diasAtrasoReal: 14 }),
  ];
  const dados = { registros, fluxo: 'CARTORIO' };
  window.__contextoAdicional = ctxBase({ contatoRecente: contatoRecenteOntem });
  rodarCenario({
    descricao: 'múltiplos títulos (EM_ATRASO+ULTIMO_DIA+EM_CARTORIO), contato ontem, sem título novo desde ontem',
    dados,
    situacaoEscolhida: 'ULTIMO_DIA',
    houvePromessaNoUltimoContato: false,
    temPromessaAtiva: false,
    semContatoAnterior: false,
  });
}

// --- semContatoAnterior (primeiro contato)
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = { registros: [registro('EM_ATRASO')], fluxo: 'CARTORIO' };
  window.__contextoAdicional = ctxBase({ semContatoAnterior: true });
  rodarCenario({
    descricao: 'semContatoAnterior (primeiro contato)',
    dados,
    situacaoEscolhida: 'EM_ATRASO',
    houvePromessaNoUltimoContato: false,
    temPromessaAtiva: false,
    semContatoAnterior: true,
  });
}

// --- contatoAntigo
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = { registros: [registro('ULTIMO_DIA')], fluxo: 'SCPC' };
  window.__contextoAdicional = ctxBase({ contatoAntigo: true });
  rodarCenario({
    descricao: 'contatoAntigo=true, situação ULTIMO_DIA',
    dados,
    situacaoEscolhida: 'ULTIMO_DIA',
    houvePromessaNoUltimoContato: false,
    temPromessaAtiva: false,
    semContatoAnterior: false,
  });
}

// --- nuncaContatadoPorMim (PEDIDO DO USUÁRIO): cliente já contatado por
// outro negociador, mas nunca por este -- recebe a mesma linha de
// apresentação, por um motivo diferente do contatoAntigo.
{
  window.__alertaGrupo = { empresasComVencido: [] };
  situacoesBase.forEach((sit) => {
    const dados = { registros: [registro(sit)], fluxo: 'CARTORIO' };
    window.__contextoAdicional = ctxBase({ nuncaContatadoPorMim: true });
    rodarCenario({
      descricao: `nuncaContatadoPorMim=true, sit=${sit}`,
      dados,
      situacaoEscolhida: sit,
      houvePromessaNoUltimoContato: false,
      temPromessaAtiva: false,
      semContatoAnterior: false,
    });
  });
}

// --- Variante "dia útil anterior mas não ontem de calendário" (segunda após sexta)
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const contatoSexta = { data: new Date(2026, 8, 11), dataTexto: '11/09/2026', ehOntemLiteral: false, diaSemanaTexto: 'sexta-feira' };
  situacoesBase.forEach((sit) => {
    const dados = { registros: [registro(sit)], fluxo: 'CARTORIO' };
    window.__contextoAdicional = ctxBase({ contatoRecente: contatoSexta });
    rodarCenario({
      descricao: `contato foi sexta (não é "ontem" de calendário), sit=${sit}`,
      dados, situacaoEscolhida: sit, houvePromessaNoUltimoContato: false, temPromessaAtiva: false, semContatoAnterior: false,
    });
  });
}

// --- Regressão: título vencido EXATAMENTE no dia do último contato (bug do ">=" corrigido)
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = { registros: [registro('EM_ATRASO', { vencimentoTexto: '14/09/2026', diasAtrasoReal: 1 })], fluxo: 'CARTORIO' };
  window.__contextoAdicional = ctxBase({ contatoRecente: contatoRecenteOntem });
  const msg = montar(dados);
  total++;
  if (!msg || !/Segue o relatório/.test(msg)) {
    achados.push({ cenario: 'REGRESSÃO: título vencido no mesmo dia do último contato deve contar como novo', problemas: ['Relatório foi omitido -- bug do ">=" pode ter regredido.'], mensagem: msg });
  }
}

// --- Regressão: EM_ATRASO + omitir relatório + sem promessa -- mensagem degenerada (deve manter pergunta final)
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = { registros: [registro('EM_ATRASO', { vencimentoTexto: '01/09/2026', diasAtrasoReal: 13 })], fluxo: 'CARTORIO' };
  window.__contextoAdicional = ctxBase({ contatoRecente: contatoRecenteOntem });
  const msg = montar(dados);
  total++;
  const corpo = (msg || '').replace(/^(Bom dia|Boa tarde|Boa noite), tudo bem\?\n*/, '');
  if (!/\?/.test(corpo)) {
    achados.push({ cenario: 'REGRESSÃO: EM_ATRASO + relatório omitido + sem promessa deve manter a pergunta final', problemas: ['Mensagem degenerada sem pergunta -- proteção pode ter regredido.'], mensagem: msg });
  }
}

// --- NEGATIVADO_SCPC em todas as janelas de dias, COM contato recente
scpcDias.forEach((dias) => {
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = { registros: [registro('NEGATIVADO_SCPC', { vencimentoTexto: '01/08/2026', diasAtrasoReal: dias })], fluxo: 'SCPC' };
  window.__contextoAdicional = ctxBase({ contatoRecente: contatoRecenteOntem });
  rodarCenario({
    descricao: `SCPC dias=${dias} COM contato recente (relatório provavelmente omitido)`,
    dados, situacaoEscolhida: 'NEGATIVADO_SCPC', houvePromessaNoUltimoContato: false, temPromessaAtiva: false, semContatoAnterior: false,
  });
});

// --- BUG REAL: título em NEGATIVADO_SCPC na janela de aviso de suspensão
// (16-19 dias) tem que vencer a escolha do título representante mesmo com
// outro título do mesmo cliente já em EM_CARTORIO com mais dias de atraso.
[16, 17, 18, 19].forEach((diasScpc) => {
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = {
    registros: [
      registro('EM_CARTORIO', { tituloCompleto: 'VELHO/1', diasAtrasoReal: 45, vencimentoTexto: '01/07/2026' }),
      registro('NEGATIVADO_SCPC', { tituloCompleto: 'SCPC/1', diasAtrasoReal: diasScpc, vencimentoTexto: '20/08/2026' }),
    ],
    fluxo: 'SCPC',
  };
  window.__contextoAdicional = ctxBase({});
  const msg = montar(dados);
  total++;
  const problemas = checarIncongruencias(msg, { situacaoEscolhida: 'NEGATIVADO_SCPC', temPromessaAtiva: false, houvePromessaNoUltimoContato: false, semContatoAnterior: false });
  const mencionaSuspensao = /suspens/i.test(msg);
  if (!mencionaSuspensao) {
    problemas.push(`Cliente tem título em NEGATIVADO_SCPC dia ${diasScpc} (janela de aviso) MAIS outro título velho em EM_CARTORIO, mas a mensagem não menciona a suspensão do cadastro -- escolheu o título errado como representante.`);
  }
  if (problemas.length > 0) {
    achados.push({ cenario: `BUG REAL: SCPC dia ${diasScpc} (janela de aviso) + outro título em EM_CARTORIO (45 dias)`, problemas, mensagem: msg });
  }
});

// --- Regressão: ULTIMO_DIA continua vencendo a ESCOLHA do título
// representante sobre a janela de aviso SCPC (o título escolhido decide o
// CTA/pergunta final e a linha principal) -- MAS, desde a correção do bug
// de informação faltando, a mensagem também passa a mencionar a suspensão
// do outro título (ver bloco "BUG REAL" logo abaixo, que testa isso
// diretamente). Antes dessa correção, esperava-se NÃO mencionar suspensão
// aqui -- isso mudou de propósito.
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = {
    registros: [
      registro('NEGATIVADO_SCPC', { tituloCompleto: 'SCPC/1', diasAtrasoReal: 19, vencimentoTexto: '20/08/2026' }),
      registro('ULTIMO_DIA', { tituloCompleto: 'ULT/1', diasAtrasoReal: 6, vencimentoTexto: '09/09/2026' }),
    ],
    fluxo: 'SCPC',
  };
  window.__contextoAdicional = ctxBase({});
  const msg = montar(dados);
  total++;
  if (!/encaminhad/i.test(msg) || !/consegue regularizar hoje para evitarmos o encaminhamento/i.test(msg)) {
    achados.push({
      cenario: 'REGRESSÃO: ULTIMO_DIA deve continuar vencendo a escolha do título representante (linha principal + CTA) mesmo com NEGATIVADO_SCPC dia 19 no mesmo cliente',
      problemas: ['Mensagem deveria ter a linha principal e o CTA de ULTIMO_DIA (prazo final/encaminhamento), não os de NEGATIVADO_SCPC.'],
      mensagem: msg,
    });
  }
}

// --- BUG REAL (relatado pelo usuário, achado ao auditar sistematicamente
// outras combinações após o bug do EM_CARTORIO): título em ULTIMO_DIA
// escolhido como representante + OUTRO título já NEGATIVADO_SCPC no último
// dia antes da suspensão (dia 19) -- a mensagem tinha esse aviso
// inteiramente omitido, mesmo o título aparecendo destacado (índigo) no
// relatório.
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = {
    registros: [
      registro('NEGATIVADO_SCPC', { tituloCompleto: 'SCPC/1', diasAtrasoReal: 19, vencimentoTexto: '20/08/2026' }),
      registro('ULTIMO_DIA', { tituloCompleto: 'ULT/1', diasAtrasoReal: 6, vencimentoTexto: '09/09/2026' }),
    ],
    fluxo: 'SCPC',
  };
  window.__contextoAdicional = ctxBase({});
  const msg = montar(dados);
  total++;
  if (!msg || !/suspens/i.test(msg)) {
    achados.push({
      cenario: 'BUG REAL: ULTIMO_DIA escolhido como representante + outro título já NEGATIVADO_SCPC dia 19 (último dia antes da suspensão)',
      problemas: ['Mensagem não menciona a suspensão do outro título (índigo) além do título escolhido (ULTIMO_DIA).'],
      mensagem: msg,
    });
  }
}

// --- Mesmo bug, janela de aviso (16-18) em vez do dia 19 exato.
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = {
    registros: [
      registro('NEGATIVADO_SCPC', { tituloCompleto: 'SCPC/1', diasAtrasoReal: 17, vencimentoTexto: '20/08/2026' }),
      registro('ULTIMO_DIA', { tituloCompleto: 'ULT/1', diasAtrasoReal: 6, vencimentoTexto: '09/09/2026' }),
    ],
    fluxo: 'SCPC',
  };
  window.__contextoAdicional = ctxBase({});
  const msg = montar(dados);
  total++;
  if (!msg || !/suspens/i.test(msg)) {
    achados.push({
      cenario: 'BUG REAL: ULTIMO_DIA escolhido como representante + outro título já NEGATIVADO_SCPC dia 17 (janela de aviso)',
      problemas: ['Mensagem não menciona o aviso de suspensão do outro título (índigo) além do título escolhido (ULTIMO_DIA).'],
      mensagem: msg,
    });
  }
}

// --- Mesmo bug, mas com EM_CARTORIO (mais atraso) escolhido como
// representante e NEGATIVADO_SCPC fora da janela de aviso coexistindo.
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = {
    registros: [
      registro('EM_CARTORIO', { tituloCompleto: 'CART/1', vencimentoTexto: '01/07/2026', diasAtrasoReal: 45 }),
      registro('NEGATIVADO_SCPC', { tituloCompleto: 'SCPC/1', vencimentoTexto: '20/07/2026', diasAtrasoReal: 25 }),
    ],
    fluxo: 'SCPC',
  };
  window.__contextoAdicional = ctxBase({});
  const msg = montar(dados);
  total++;
  if (!msg || !/negativad/i.test(msg)) {
    achados.push({
      cenario: 'BUG REAL: EM_CARTORIO escolhido como representante + outro título já NEGATIVADO_SCPC fora da janela de aviso',
      problemas: ['Mensagem não menciona a negativação SCPC do outro título além do título escolhido (EM_CARTORIO).'],
      mensagem: msg,
    });
  }
}

// --- Três situações simultâneas: ULTIMO_DIA (escolhido) + EM_CARTORIO +
// NEGATIVADO_SCPC (janela de aviso) -- a mensagem precisa mencionar as três.
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = {
    registros: [
      registro('EM_CARTORIO', { tituloCompleto: 'CART/1', vencimentoTexto: '01/06/2026', diasAtrasoReal: 60 }),
      registro('NEGATIVADO_SCPC', { tituloCompleto: 'SCPC/1', vencimentoTexto: '20/08/2026', diasAtrasoReal: 18 }),
      registro('ULTIMO_DIA', { tituloCompleto: 'ULT/1', vencimentoTexto: '09/09/2026', diasAtrasoReal: 6 }),
    ],
    fluxo: 'SCPC',
  };
  window.__contextoAdicional = ctxBase({});
  const msg = montar(dados);
  total++;
  if (!msg || !/encaminhad/i.test(msg) || !/amarelo/i.test(msg) || !/suspens/i.test(msg)) {
    achados.push({
      cenario: 'BUG REAL: 3 situações simultâneas (ULTIMO_DIA + EM_CARTORIO + NEGATIVADO_SCPC janela) devem aparecer todas na mensagem',
      problemas: ['Mensagem deveria mencionar prazo final, cartório (amarelo) e suspensão SCPC, todos juntos.'],
      mensagem: msg,
    });
  }
}

// --- Regressão: só NEGATIVADO_SCPC (sem outra situação concorrendo) não
// deve mudar de comportamento -- continua a linha principal sozinha.
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = { registros: [registro('NEGATIVADO_SCPC', { diasAtrasoReal: 25 })], fluxo: 'SCPC' };
  window.__contextoAdicional = ctxBase({});
  const msg = montar(dados);
  total++;
  const ocorrencias = (msg.match(/negativad/gi) || []).length;
  if (ocorrencias !== 1) {
    achados.push({
      cenario: 'REGRESSÃO: só NEGATIVADO_SCPC (sem outra situação concorrendo) não deve duplicar a linha',
      problemas: [`Esperava 1 menção a "negativad", achou ${ocorrencias}.`],
      mensagem: msg,
    });
  }
}

// --- Regressão: fora da janela de aviso SCPC (dia 25), volta a valer "maior atraso real"
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = {
    registros: [
      registro('EM_CARTORIO', { tituloCompleto: 'VELHO/1', diasAtrasoReal: 45, vencimentoTexto: '01/07/2026' }),
      registro('NEGATIVADO_SCPC', { tituloCompleto: 'SCPC/1', diasAtrasoReal: 25, vencimentoTexto: '20/08/2026' }),
    ],
    fluxo: 'SCPC',
  };
  window.__contextoAdicional = ctxBase({});
  const msg = montar(dados);
  total++;
  if (/suspens/i.test(msg)) {
    achados.push({
      cenario: 'REGRESSÃO: fora da janela de aviso SCPC (dia 25), não deveria priorizar o título SCPC sobre o mais atrasado',
      problemas: ['Mensagem menciona suspensão mesmo com o título SCPC fora da janela de aviso (16-19 dias).'],
      mensagem: msg,
    });
  }
}

// --- BUG REAL (relatado pelo usuário): título já EM_CARTORIO tem MUITO
// mais dias de atraso que outro título ainda evitável -- a prioridade de
// pagamento (e por isso o CTA da mensagem) tem que mirar o título FORA de
// cartório, não o que já foi pra lá só por ter mais dias.
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = {
    registros: [
      registro('EM_CARTORIO', { tituloCompleto: 'CART/1', vencimentoTexto: '01/07/2026', diasAtrasoReal: 45 }),
      registro('EM_ATRASO', { tituloCompleto: 'AT/1', vencimentoTexto: '12/09/2026', diasAtrasoReal: 3 }),
    ],
    fluxo: 'CARTORIO',
  };
  window.__contextoAdicional = ctxBase({});
  const msg = montar(dados);
  total++;
  // CTA de EM_CARTORIO ("confirmar a baixa da restrição") não pode
  // aparecer aqui -- o título escolhido tem que ser o EM_ATRASO (CTA
  // genérico "Podemos agendar..."), mas a informação de cartório ainda
  // precisa aparecer como nota complementar.
  if (!msg || /confirmar a baixa da restrição/i.test(msg) || !/também já está em cartório/i.test(msg)) {
    achados.push({
      cenario: 'BUG REAL: EM_CARTORIO com muito mais dias não pode virar o CTA quando há título fora de cartório',
      problemas: ['CTA deveria ser sobre o título fora de cartório (ainda evitável), com o cartório só como nota complementar.'],
      mensagem: msg,
    });
  }
}

// --- Mesmo bug, mas o título fora de cartório é NEGATIVADO_SCPC (fora da
// janela de aviso) em vez de EM_ATRASO -- também deve vencer o EM_CARTORIO
// mais atrasado.
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = {
    registros: [
      registro('EM_CARTORIO', { tituloCompleto: 'CART/1', vencimentoTexto: '01/07/2026', diasAtrasoReal: 45 }),
      registro('NEGATIVADO_SCPC', { tituloCompleto: 'SCPC/1', vencimentoTexto: '20/07/2026', diasAtrasoReal: 25 }),
    ],
    fluxo: 'SCPC',
  };
  window.__contextoAdicional = ctxBase({});
  const msg = montar(dados);
  total++;
  if (!msg || !/regularização dos débitos negativados/i.test(msg) || !/também já está em cartório/i.test(msg)) {
    achados.push({
      cenario: 'BUG REAL: EM_CARTORIO com mais dias não pode vencer NEGATIVADO_SCPC fora de cartório na escolha do representante',
      problemas: ['CTA/linha principal deveria ser sobre o título NEGATIVADO_SCPC (fora de cartório), com o cartório como nota complementar.'],
      mensagem: msg,
    });
  }
}

// --- Regressão: quando TODOS os títulos já estão em cartório, o cliente
// nem chega até aqui de verdade (naoCobrar no Módulo 1) -- mas, se
// chegasse, a escolha ainda precisa funcionar sem travar (defensivo).
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = { registros: [registro('EM_CARTORIO', { diasAtrasoReal: 10 }), registro('EM_CARTORIO', { tituloCompleto: 'CART/2', diasAtrasoReal: 30 })], fluxo: 'CARTORIO' };
  window.__contextoAdicional = ctxBase({});
  const msg = montar(dados);
  total++;
  if (!msg || !/já estão em cartório/i.test(msg)) {
    achados.push({
      cenario: 'REGRESSÃO: com TODOS os títulos em cartório (caso defensivo), ainda gera mensagem válida sobre cartório',
      problemas: ['Mensagem deveria continuar funcionando normalmente com a linha principal de EM_CARTORIO.'],
      mensagem: msg,
    });
  }
}

// --- VERIFICAR_POSICAO (não deve gerar mensagem)
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = { registros: [registro('VERIFICAR_POSICAO')], fluxo: 'CARTORIO' };
  window.__contextoAdicional = ctxBase({});
  const msg = montar(dados);
  total++;
  if (msg !== null) {
    achados.push({ cenario: 'VERIFICAR_POSICAO deveria retornar null', problemas: [`Retornou mensagem em vez de null: "${msg}"`] });
  }
}

// --- BUG REAL (relatado pelo usuário): cliente com título em ULTIMO_DIA
// (escolhido como representante) MAIS outro título já em EM_CARTORIO --
// a mensagem só falava do primeiro, nunca explicava por que existem linhas
// amarelas no relatório também.
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = {
    registros: [
      registro('EM_CARTORIO', { tituloCompleto: 'CART/1', vencimentoTexto: '01/07/2026', diasAtrasoReal: 40 }),
      registro('ULTIMO_DIA', { tituloCompleto: 'ULT/1', vencimentoTexto: '09/09/2026', diasAtrasoReal: 6 }),
    ],
    fluxo: 'CARTORIO',
  };
  window.__contextoAdicional = ctxBase({});
  const msg = montar(dados);
  total++;
  if (!msg || !/grifado em amarelo/i.test(msg) || !/j[áa] est[áa] em cart[óo]rio/i.test(msg)) {
    achados.push({
      cenario: 'BUG REAL: ULTIMO_DIA escolhido como representante + outro título já EM_CARTORIO',
      problemas: ['Mensagem não menciona os títulos já em cartório (amarelo) além do título escolhido (ULTIMO_DIA).'],
      mensagem: msg,
    });
  }
}

// --- Mesmo bug, mas com NEGATIVADO_SCPC dia 19 (janela de aviso) como
// escolhido, coexistindo com outro título já EM_CARTORIO.
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = {
    registros: [
      registro('EM_CARTORIO', { tituloCompleto: 'CART/1', vencimentoTexto: '01/06/2026', diasAtrasoReal: 60 }),
      registro('NEGATIVADO_SCPC', { tituloCompleto: 'SCPC/1', vencimentoTexto: '20/08/2026', diasAtrasoReal: 19 }),
    ],
    fluxo: 'SCPC',
  };
  window.__contextoAdicional = ctxBase({});
  const msg = montar(dados);
  total++;
  if (!msg || !/grifado em amarelo/i.test(msg)) {
    achados.push({
      cenario: 'BUG REAL: NEGATIVADO_SCPC dia 19 escolhido + outro título já EM_CARTORIO',
      problemas: ['Mensagem não menciona os títulos já em cartório (amarelo) além do título escolhido (SCPC dia 19).'],
      mensagem: msg,
    });
  }
}

// --- Regressão: quando EM_CARTORIO já É a situação escolhida (sem
// ULTIMO_DIA/SCPC concorrendo), a linha principal continua igual -- não
// deve duplicar "também".
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = { registros: [registro('EM_CARTORIO', { diasAtrasoReal: 40 })], fluxo: 'CARTORIO' };
  window.__contextoAdicional = ctxBase({});
  const msg = montar(dados);
  total++;
  if (!msg || /também/i.test(msg)) {
    achados.push({
      cenario: 'REGRESSÃO: só EM_CARTORIO (sem outra situação concorrendo) não deve dizer "também"',
      problemas: ['Mensagem deveria usar só a linha principal de EM_CARTORIO, sem a linha adicional.'],
      mensagem: msg,
    });
  }
}

// --- MELHORIA (pedido do usuário): recontato sem título novo, mas ONTEM
// já foi, ele próprio, um recontato (recontatoConsecutivo=true, vindo do
// Módulo 6) -- não repete a omissão do relatório por 2+ dias seguidos.
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = { registros: [registro('EM_ATRASO', { vencimentoTexto: '01/09/2026', diasAtrasoReal: 13 })], fluxo: 'CARTORIO' };
  window.__contextoAdicional = ctxBase({
    contatoRecente: Object.assign({}, contatoRecenteOntem, { recontatoConsecutivo: true }),
  });
  const msg = montar(dados);
  total++;
  if (!msg || !/Segue o relatório/.test(msg)) {
    achados.push({
      cenario: 'MELHORIA: ontem já era recontato (recontatoConsecutivo=true) -- relatório deve voltar a ser enviado hoje',
      problemas: ['Relatório continua omitido mesmo com 2+ dias seguidos de recontato sem título novo.'],
      mensagem: msg,
    });
  }
}

// --- Regressão: mesmo cenário, mas recontatoConsecutivo=false (só o
// primeiro recontato) -- continua omitindo o relatório, comportamento
// original preservado.
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = { registros: [registro('EM_ATRASO', { vencimentoTexto: '01/09/2026', diasAtrasoReal: 13 })], fluxo: 'CARTORIO' };
  window.__contextoAdicional = ctxBase({
    contatoRecente: Object.assign({}, contatoRecenteOntem, { recontatoConsecutivo: false }),
  });
  const msg = montar(dados);
  total++;
  if (!msg || /Segue o relatório/.test(msg)) {
    achados.push({
      cenario: 'REGRESSÃO: primeiro recontato (recontatoConsecutivo=false) continua omitindo o relatório',
      problemas: ['Relatório não deveria ser reenviado no primeiro recontato sem título novo.'],
      mensagem: msg,
    });
  }
}

// --- Regressão: recontatoConsecutivo=true, mas título pago desde a última
// visita -- já entra pelo caminho houveTituloPagoDesdeUltimaVisita, então
// o relatório também é enviado (comportamento já esperado, sem conflito).
{
  window.__alertaGrupo = { empresasComVencido: [] };
  const dados = { registros: [registro('EM_ATRASO', { vencimentoTexto: '01/09/2026', diasAtrasoReal: 13 })], fluxo: 'CARTORIO' };
  window.__contextoAdicional = ctxBase({
    contatoRecente: Object.assign({}, contatoRecenteOntem, { recontatoConsecutivo: true }),
    houveTituloPagoDesdeUltimaVisita: true,
    titulosPagosDesdeUltimaVisita: ['90099/1'],
  });
  const msg = montar(dados);
  total++;
  if (!msg || !/Segue o relatório/.test(msg) || !/Recebemos a baixa/i.test(msg)) {
    achados.push({
      cenario: 'REGRESSÃO: recontatoConsecutivo=true + título pago -- relatório enviado e agradecimento presente juntos',
      problemas: ['Esperava relatório enviado E agradecimento de pagamento juntos, sem conflito entre as duas melhorias.'],
      mensagem: msg,
    });
  }
}

// --- PEDIDO DO USUÁRIO: a linha de apresentação sai pelos DOIS motivos
// (contatoAntigo e nuncaContatadoPorMim), nunca duplicada quando os dois
// valem ao mesmo tempo, e continua fora quando nenhum dos dois vale.
{
  const APRESENTACAO = "Sou <nome> do financeiro da Tex Cotton";
  const contarApresentacoes = (msg) => (msg.match(/Sou [A-Za-zÀ-ÿ]+ do financeiro da Tex Cotton/g) || []).length;

  const casos = [
    { descricao: 'nuncaContatadoPorMim=true -> linha de apresentação presente', ctx: { nuncaContatadoPorMim: true }, esperado: 1 },
    { descricao: 'contatoAntigo=true -> linha de apresentação presente (sem regressão)', ctx: { contatoAntigo: true }, esperado: 1 },
    { descricao: 'os dois motivos juntos -> apresentação aparece UMA vez só', ctx: { contatoAntigo: true, nuncaContatadoPorMim: true }, esperado: 1 },
    { descricao: 'nenhum dos dois -> sem linha de apresentação', ctx: {}, esperado: 0 },
    // BUG REAL (achado na revisão de código): outro negociador falou ontem,
    // eu nunca falei -- a apresentação sai, mas sem "retomando o contato".
    { descricao: 'outro negociador falou ontem + eu nunca falei -> apresentação sai', ctx: { nuncaContatadoPorMim: true, contatoRecente: contatoRecenteOntem }, esperado: 1 },
  ];

  casos.forEach((caso) => {
    window.__alertaGrupo = { empresasComVencido: [] };
    window.__contextoAdicional = ctxBase(caso.ctx);
    const dados = { registros: [registro('EM_ATRASO')], fluxo: 'CARTORIO' };
    const msg = montar(dados);
    total++;
    const quantidade = msg ? contarApresentacoes(msg) : -1;
    if (quantidade !== caso.esperado) {
      achados.push({
        cenario: caso.descricao,
        problemas: [`Esperava ${caso.esperado} ocorrência(s) de "${APRESENTACAO}", achei ${quantidade}.`],
        mensagem: msg,
      });
    }
  });

  // PEDIDO DO USUÁRIO: o nome na apresentação segue o negociador logado,
  // não um nome fixo no código. Sem artigo antes do nome de propósito --
  // "Sou o Bianca" sairia errado e o código não tem como saber o gênero.
  [
    { nome: 'Isaac', esperado: 'Sou Isaac do financeiro da Tex Cotton' },
    { nome: 'Bianca', esperado: 'Sou Bianca do financeiro da Tex Cotton' },
  ].forEach(({ nome, esperado }) => {
    window.__alertaGrupo = { empresasComVencido: [] };
    window.__contextoAdicional = ctxBase({ nuncaContatadoPorMim: true, nomeNegociador: nome });
    const msgNome = montar({ registros: [registro('EM_ATRASO')], fluxo: 'CARTORIO' });
    total++;
    if (!msgNome || !msgNome.includes(esperado)) {
      achados.push({
        cenario: `apresentação usa o nome do negociador logado ("${nome}")`,
        problemas: [`Esperava "${esperado}" na mensagem.`],
        mensagem: msgNome,
      });
    }
  });

  // Mesma coisa na mensagem de PRIMEIRO CONTATO (cliente sem nenhum
  // registro), que tem texto próprio e também se apresenta.
  window.__alertaGrupo = { empresasComVencido: [] };
  window.__contextoAdicional = ctxBase({ semContatoAnterior: true, nomeNegociador: 'Bianca' });
  const msgPrimeiro = montar({ registros: [registro('EM_ATRASO')], fluxo: 'CARTORIO' });
  total++;
  if (!msgPrimeiro || !msgPrimeiro.includes('Sou Bianca do financeiro da Tex Cotton')) {
    achados.push({
      cenario: 'mensagem de primeiro contato também usa o nome do negociador logado',
      problemas: ['Esperava "Sou Bianca do financeiro da Tex Cotton" na mensagem de primeiro contato.'],
      mensagem: msgPrimeiro,
    });
  }

  // BUG REAL (achado na revisão de código): com a apresentação na mensagem,
  // "Retomando o contato de ontem" (de OUTRA pessoa) não pode aparecer.
  window.__alertaGrupo = { empresasComVencido: [] };
  window.__contextoAdicional = ctxBase({ nuncaContatadoPorMim: true, contatoRecente: contatoRecenteOntem });
  const msgCombo = montar({ registros: [registro('EM_ATRASO')], fluxo: 'CARTORIO' });
  total++;
  if (!msgCombo || !/Sou [A-Za-zÀ-ÿ]+ do financeiro/.test(msgCombo) || /Retomando o contato de/.test(msgCombo)) {
    achados.push({
      cenario: 'BUG REAL: outro negociador falou ontem + eu nunca falei -- apresentação sim, "retomando o contato" não',
      problemas: ['Esperava a apresentação SEM a linha "Retomando o contato de..." na mesma mensagem.'],
      mensagem: msgCombo,
    });
  }
}

console.log(`[mensagens] ${total - achados.length}/${total} cenários passaram (${achados.length} achado(s)).`);
achados.forEach((a, i) => {
  console.log(`  FALHA ${i + 1}: ${a.cenario}`);
  if (a.erro) {
    console.log('    ERRO/EXCEÇÃO:', a.erro);
  } else {
    console.log('    Problemas:', a.problemas.join(' | '));
  }
});
if (achados.length > 0) process.exitCode = 1;
