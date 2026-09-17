// Testes de deveOmitirRelatorio (Módulo 4) -- a regra de "recontato em dias
// seguidos sem título novo não reenvia o relatório".
//
// POR QUE ESTE ARQUIVO EXISTE: a função estava exposta em
// window.__atalhosDebug e não tinha NENHUM teste direto -- só era exercitada
// de lado, através de montarMensagemPersonalizada. Foi nessa sombra que
// sobreviveu um bug real: converterDataBrParaDate construía a data do
// vencimento à MEIA-NOITE enquanto o Módulo 6 entrega contatoRecente.data ao
// MEIO-DIA, então a comparação ">=" (que existe justamente pra tratar o caso
// de igualdade) comparava 00:00 >= 12:00 e dava false.
//
// A fixture de contexto vem do Módulo 6 REAL (helpers/contexto-real.js), não
// de um objeto escrito à mão -- era a fixture à mão, também à meia-noite, que
// fazia os dois erros se cancelarem dentro do teste.
const { novaJanela } = require('./helpers/dom-env');
const { contatoRecenteReal } = require('./helpers/contexto-real');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('omitir-relatorio');

// Contexto real primeiro: novaJanela repõe os globals do Node a cada
// chamada, e a última tem que ser a janela do Módulo 4.
const HOJE = new Date(2026, 8, 15); // terça
const DIA_DO_CONTATO = '14/09/2026'; // segunda -- dia útil anterior
const contatoOntem = contatoRecenteReal({ dataContatoTexto: DIA_DO_CONTATO, hoje: HOJE });

const w = novaJanela({
  url: 'https://texhub.texcotton.com.br/crm/clientes/grupo/1?cnpj=11111111000111',
  specs: [{ arquivo: 'modulo0-utilitarios-compartilhados.js' }, { arquivo: 'modulo4-atalhos-teclado.js' }],
});

const { deveOmitirRelatorio } = w.__atalhosDebug;

function registro(vencimentoTexto) {
  return {
    tituloCompleto: '90001/1',
    situacaoKey: 'EM_ATRASO',
    diasAtrasoReal: 3,
    saldoTexto: 'R$ 1.000,00',
    razaoSocial: 'CLIENTE TESTE LTDA',
    vencimentoTexto,
  };
}

function comContexto(overrides) {
  w.__contextoAdicional = Object.assign(
    {
      promessa: null,
      contatoRecente: contatoOntem,
      houvePromessaNoUltimoContato: false,
      houveTituloPagoDesdeUltimaVisita: false,
      titulosPagosDesdeUltimaVisita: [],
      semContatoAnterior: false,
      contatoAntigo: false,
      nuncaContatadoPorMim: false,
      nomeNegociador: 'Isaac',
      calcularTitulosPendentes: (t) => t,
    },
    overrides || {}
  );
}

// =====================================================================
// CONTRATO DE DATA -- trava a convenção que o bug violava.
// =====================================================================
checar(
  'Módulo 6 entrega contatoRecente.data ao MEIO-DIA (convenção do Módulo 0)',
  contatoOntem.data.getHours() === 12,
  `getHours()=${contatoOntem.data.getHours()}`
);

// =====================================================================
// A COMPARAÇÃO EM SI: antes / igual / depois da data do último contato.
// =====================================================================
comContexto();
checar(
  'título vencido ANTES do último contato -> nada novo, omite o relatório',
  deveOmitirRelatorio({ registros: [registro('13/09/2026')] }) === true
);

// REGRESSÃO DO BUG: um título só entra na lista a partir de 1 dia de atraso
// (DIAS_ATRASO_MIN no Módulo 1), então um título vencido NO DIA do contato
// ainda não aparecia naquele dia -- só passou a aparecer hoje. É novo.
checar(
  'título vencido NO MESMO DIA do último contato -> é novo, NÃO omite',
  deveOmitirRelatorio({ registros: [registro(DIA_DO_CONTATO)] }) === false
);

checar(
  'título vencido DEPOIS do último contato -> é novo, NÃO omite',
  deveOmitirRelatorio({ registros: [registro('15/09/2026')] }) === false
);

checar(
  'um título velho + um vencido no dia do contato -> basta um novo pra NÃO omitir',
  deveOmitirRelatorio({ registros: [registro('01/09/2026'), registro(DIA_DO_CONTATO)] }) === false
);

// =====================================================================
// OUTROS CAMINHOS DE SAÍDA.
// =====================================================================
comContexto({ contatoRecente: null });
checar(
  'sem contato recente (não é recontato) -> nunca omite',
  deveOmitirRelatorio({ registros: [registro('01/09/2026')] }) === false
);

comContexto({ houveTituloPagoDesdeUltimaVisita: true });
checar(
  'título pago desde a última visita é informação nova -> NÃO omite',
  deveOmitirRelatorio({ registros: [registro('01/09/2026')] }) === false
);

comContexto({ contatoRecente: Object.assign({}, contatoOntem, { recontatoConsecutivo: true }) });
checar(
  'ontem já era recontato -> não omite 2+ dias seguidos',
  deveOmitirRelatorio({ registros: [registro('01/09/2026')] }) === false
);

comContexto();
checar(
  'vencimento em formato inesperado não conta como título novo',
  deveOmitirRelatorio({ registros: [registro('sem data')] }) === true
);

checar(
  'lista de títulos vazia -> nenhum título novo, omite',
  deveOmitirRelatorio({ registros: [] }) === true
);

// Sem o Módulo 6 carregado, a regra inteira fica desligada.
w.__contextoAdicional = undefined;
checar(
  'sem window.__contextoAdicional -> nunca omite',
  deveOmitirRelatorio({ registros: [registro('01/09/2026')] }) === false
);

resumo();
