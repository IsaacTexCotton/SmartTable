// Testes de calcularContextoPromessa (Módulo 6) -- BUG REAL relatado pelo
// usuário: cliente cumpriu a promessa (título já tinha sumido da lista de
// abertos do Módulo 1, baixa lançada), mas a frase de agradecimento
// (obterLinhaAgradecimentoPagamento, Módulo 4) não apareceu -- porque o
// status da promessa no CRM ("Pendente") ainda não tinha sido atualizado
// pra "Cumprida" no instante da mensagem, e essa promessa "tecnicamente
// pendente" continuava sendo tratada como ativa (ctx.promessa truthy),
// bloqueando o agradecimento e, pior, teria mostrado "hoje é o dia
// combinado" ou "pagamento não identificado" pra um título já pago.
// Roda contra o código REAL de modulos/modulo6-contexto-adicional.js via
// window.__contextoAdicionalDebug.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('contexto-promessa');

const SPECS = [{ arquivo: 'modulo0-utilitarios-compartilhados.js' }, { arquivo: 'modulo6-contexto-adicional.js' }];

function itemPromessaHtml({ status, dataTexto, titulos }) {
  const spansTitulos = titulos.map((t) => `<span class="bg-gray-100">${t}</span>`).join('');
  return `<div class="promessa-item">
    <div data-status="${status}">
      <p class="text-xs text-gray-500"><span>${dataTexto}</span></p>
    </div>
    <div><span>Títulos:</span>${spansTitulos}</div>
  </div>`;
}

function abrirPagina(itensPromessaHtml) {
  const bodyHtml = `
    <div id="content-promessas">${(itensPromessaHtml || []).join('')}</div>
    <div id="content-contatos"></div>
  `;
  return novaJanela({
    url: 'https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=AAA',
    bodyHtml,
    specs: SPECS,
  });
}

function dataBr(data) {
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${data.getFullYear()}`;
}

const HOJE = new Date(2026, 8, 16); // 16/09/2026 (mesma "hoje" usada nos outros testes desta sessão)
const ONTEM = new Date(2026, 8, 15);
const HOJE_TEXTO = dataBr(HOJE);
const ONTEM_TEXTO = dataBr(ONTEM);

function comAvisoCobranca(w, tituloCompletos) {
  w.__avisoCobranca = { simular: () => ({ registros: tituloCompletos.map((t) => ({ tituloCompleto: t })) }) };
}

// =====================================================================
// 1-2. DIA_DA_PROMESSA -- caso normal (ainda aberto) continua funcionando
// =====================================================================
(function () {
  const w = abrirPagina([itemPromessaHtml({ status: 'PENDENTE', dataTexto: HOJE_TEXTO, titulos: ['90001/1'] })]);
  comAvisoCobranca(w, ['90001/1']); // título ainda aberto
  const resultado = w.__contextoAdicionalDebug.calcularContextoPromessa(HOJE);
  checar('promessa PENDENTE pra hoje com título ainda aberto -> DIA_DA_PROMESSA', resultado && resultado.tipo === 'DIA_DA_PROMESSA', JSON.stringify(resultado));
})();

// 2. BUG REAL CORRIGIDO: mesma promessa, mas o título já sumiu da lista de
// abertos (pago) -- não deve mais ser tratada como ativa.
(function () {
  const w = abrirPagina([itemPromessaHtml({ status: 'PENDENTE', dataTexto: HOJE_TEXTO, titulos: ['90001/1'] })]);
  comAvisoCobranca(w, []); // título já pago -- sumiu da lista de abertos
  const resultado = w.__contextoAdicionalDebug.calcularContextoPromessa(HOJE);
  checar(
    'BUG REAL CORRIGIDO: promessa PENDENTE pra hoje mas com título já pago -> null (não trata mais como ativa)',
    resultado === null,
    JSON.stringify(resultado)
  );
})();

// =====================================================================
// 3-4. QUEBRADA -- caso normal (ainda aberto) continua funcionando
// =====================================================================
(function () {
  const w = abrirPagina([itemPromessaHtml({ status: 'QUEBRADA', dataTexto: ONTEM_TEXTO, titulos: ['90002/1'] })]);
  comAvisoCobranca(w, ['90002/1']); // título ainda aberto
  const resultado = w.__contextoAdicionalDebug.calcularContextoPromessa(HOJE);
  checar('promessa QUEBRADA vencida com título ainda aberto -> QUEBRADA', resultado && resultado.tipo === 'QUEBRADA', JSON.stringify(resultado));
})();

// 4. BUG REAL CORRIGIDO: promessa QUEBRADA, mas o título já foi pago (CRM
// não atualizou o status a tempo) -- resolvida, não deve mais aparecer.
(function () {
  const w = abrirPagina([itemPromessaHtml({ status: 'QUEBRADA', dataTexto: ONTEM_TEXTO, titulos: ['90002/1'] })]);
  comAvisoCobranca(w, []); // já pago
  const resultado = w.__contextoAdicionalDebug.calcularContextoPromessa(HOJE);
  checar(
    'BUG REAL CORRIGIDO: promessa QUEBRADA com título já pago -> null (tratada como resolvida)',
    resultado === null,
    JSON.stringify(resultado)
  );
})();

// =====================================================================
// 5-6. PARCIAL -- comportamento correto preservado (só unifica quando
// realmente sobra 0 título aberto; com 1+ ainda aberto, PARCIAL continua)
// =====================================================================
(function () {
  const w = abrirPagina([itemPromessaHtml({ status: 'PARCIAL', dataTexto: ONTEM_TEXTO, titulos: ['90003/1', '90003/2'] })]);
  comAvisoCobranca(w, ['90003/2']); // só um dos dois ainda aberto -- parcial de verdade
  const resultado = w.__contextoAdicionalDebug.calcularContextoPromessa(HOJE);
  checar('promessa PARCIAL com 1 dos 2 títulos ainda aberto -> continua PARCIAL', resultado && resultado.tipo === 'PARCIAL', JSON.stringify(resultado));
})();

// 6. BUG REAL CORRIGIDO: PARCIAL mas os dois títulos já foram pagos (CRM
// não atualizou pra "Cumprida") -- totalmente resolvida.
(function () {
  const w = abrirPagina([itemPromessaHtml({ status: 'PARCIAL', dataTexto: ONTEM_TEXTO, titulos: ['90003/1', '90003/2'] })]);
  comAvisoCobranca(w, []); // os dois já pagos
  const resultado = w.__contextoAdicionalDebug.calcularContextoPromessa(HOJE);
  checar(
    'BUG REAL CORRIGIDO: promessa PARCIAL com os 2 títulos já pagos -> null (totalmente resolvida)',
    resultado === null,
    JSON.stringify(resultado)
  );
})();

// =====================================================================
// 7. Defensivo: sem window.__avisoCobranca disponível, calcularTitulosPendentes
// degrada assumindo tudo pendente (mesmo fallback de sempre) -- continua
// tratando a promessa como ativa, não quebra o comportamento pré-existente
// quando o Módulo 1 não está disponível por algum motivo.
// =====================================================================
(function () {
  const w = abrirPagina([itemPromessaHtml({ status: 'PENDENTE', dataTexto: HOJE_TEXTO, titulos: ['90004/1'] })]);
  // Não define w.__avisoCobranca de propósito.
  const resultado = w.__contextoAdicionalDebug.calcularContextoPromessa(HOJE);
  checar(
    'sem window.__avisoCobranca disponível, ainda trata a promessa como ativa (fallback seguro)',
    resultado && resultado.tipo === 'DIA_DA_PROMESSA',
    JSON.stringify(resultado)
  );
})();

// =====================================================================
// 8. Duas promessas vencidas: a mais antiga já paga (pulada) e a mais
// recente ainda aberta -- confirma que o laço continua pra próxima em vez
// de desistir no primeiro "já paga".
// =====================================================================
(function () {
  const anteontem = new Date(2026, 8, 14);
  const w = abrirPagina([
    itemPromessaHtml({ status: 'QUEBRADA', dataTexto: dataBr(anteontem), titulos: ['90005/1'] }), // mais antiga, já paga
    itemPromessaHtml({ status: 'QUEBRADA', dataTexto: ONTEM_TEXTO, titulos: ['90005/2'] }), // mais recente, ainda aberta
  ]);
  comAvisoCobranca(w, ['90005/2']); // só a segunda continua aberta
  const resultado = w.__contextoAdicionalDebug.calcularContextoPromessa(HOJE);
  checar(
    'promessa mais antiga já paga é pulada, laço continua e acha a próxima vencida ainda aberta',
    resultado && resultado.tipo === 'QUEBRADA' && resultado.promessa.titulos[0] === '90005/2',
    JSON.stringify(resultado)
  );
})();

resumo();
