// Fixtures de window.__contextoAdicional produzidas pelo código REAL do
// Módulo 6, em vez de escritas à mão nos testes.
//
// POR QUE ISTO EXISTE (achado de revisão, bug real em produção):
// mensagens.test.js montava o objeto `contatoRecente` à mão, com a data
// construída à MEIA-NOITE (`new Date(2026, 8, 14)`). O Módulo 6 real
// normaliza toda data ao MEIO-DIA. O Módulo 4 também construía a data do
// vencimento à meia-noite -- então, DENTRO do teste, os dois lados batiam e
// o teste de regressão "título vencido no mesmo dia do último contato"
// passava verde, enquanto em produção a comparação era 00:00 >= 12:00
// (false) e o relatório era omitido indevidamente.
//
// Regra que fica: fixture de contexto SAI do módulo que produz o contexto.
// Se o contrato do Módulo 6 mudar, os testes do Módulo 4 mudam junto, em
// vez de continuarem verdes sobre um contrato que não existe mais.
const { novaJanela } = require('./dom-env');

const SPECS = [
  { arquivo: 'modulo0-utilitarios-compartilhados.js' },
  { arquivo: 'modulo6-contexto-adicional.js' },
];

const URL_CLIENTE = 'https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=11111111000111';

/**
 * Calcula um `contatoRecente` REAL, do jeito que o Módulo 6 entrega pro
 * Módulo 4 em produção.
 *
 * Determinístico: `hoje` é passado explicitamente pra
 * calcularContextoContato, então o resultado não depende do relógio da
 * máquina que roda o teste.
 *
 * @param {object} opcoes
 * @param {string} opcoes.dataContatoTexto Data do contato, "dd/mm/aaaa".
 * @param {Date} opcoes.hoje Data tratada como "hoje" no cálculo.
 * @param {string[]} [opcoes.outrosContatosTexto] Datas de contatos anteriores
 *   ("dd/mm/aaaa"), pra exercitar recontatoConsecutivo.
 * @returns {object} O objeto contatoRecente real (nunca null).
 * @throws {Error} Se o Módulo 6 não reconhecer esse contato como recente --
 *   sinal de que a data escolhida não é o dia útil anterior a `hoje`, e que
 *   a fixture está errada (falha alto, em vez de devolver null em silêncio).
 */
function contatoRecenteReal({ dataContatoTexto, hoje, outrosContatosTexto = [] }) {
  const itens = [dataContatoTexto, ...outrosContatosTexto]
    .map((d) => `<div class="contato-item" data-data="${d} 16:08" data-efetivo="true" data-usuario="ISAAC.03876"></div>`)
    .join('');

  const w = novaJanela({
    url: URL_CLIENTE,
    bodyHtml: `<div id="content-promessas"></div><div id="content-contatos">${itens}</div>`,
    specs: SPECS,
  });

  const { calcularContextoContato } = w.__contextoAdicionalDebug;
  const contato = calcularContextoContato(w.__smartTableUtil.normalizarData(hoje));
  if (!contato) {
    throw new Error(
      `Fixture inválida: o Módulo 6 não considerou ${dataContatoTexto} um "contato recente" ` +
      `em relação a ${hoje.toDateString()}. Confira se essa data é mesmo o dia útil anterior.`
    );
  }
  return contato;
}

module.exports = { contatoRecenteReal };
