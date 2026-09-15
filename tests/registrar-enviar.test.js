// Testes do resumo padronizado do Módulo 2 (Registrar e Enviar) -- Módulo 2
// é PROTEGIDO (exige confirmação explícita do usuário pra qualquer edição),
// então NÃO ganha um hook de depuração permanente. Em vez disso, o texto
// carregado por este teste recebe uma linha extra só em memória (nunca
// escrita no arquivo real) expondo calcularResumoPadronizado -- ver
// helpers/dom-env.js.
const { JSDOM } = require('jsdom');
const { textoDoModulo } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('registrar-enviar');

const CODIGO = textoDoModulo('modulo2-registrar-enviar.js', '\nwindow.__testarResumoPadronizado = calcularResumoPadronizado;\n');

// Mirroring pro global do Node é necessário -- window.eval() por si só não
// basta pra identificadores livres (`window`, `document`) resolverem
// dentro do código avaliado (mesmo padrão dos outros helpers de teste).
function mirrorGlobals(dom) {
  global.window = dom.window;
  global.document = dom.window.document;
  global.location = dom.window.location;
  global.MutationObserver = dom.window.MutationObserver;
  dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.requestAnimationFrame = dom.window.requestAnimationFrame;
}

function novaJanela(registros) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=AAA' });
  mirrorGlobals(dom);
  dom.window.__avisoCobranca = { simular: () => ({ registros }) };
  dom.window.eval(CODIGO);
  return dom.window;
}

function registro(situacaoKey, diasAtrasoReal) {
  return { situacaoKey, diasAtrasoReal, tituloCompleto: '90001/1', vencimentoTexto: '01/09/2026' };
}

// 1. Sem window.__avisoCobranca -- degrada pro resumo genérico
(function () {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://texhub.texcotton.com.br/crm/clientes' });
  mirrorGlobals(dom);
  dom.window.eval(CODIGO);
  const resumoTexto = dom.window.__testarResumoPadronizado();
  checar('sem window.__avisoCobranca -> resumo genérico', resumoTexto === 'Enviado cobrança.', resumoTexto);
})();

// 2. Sem títulos vencidos -- resumo genérico
(function () {
  const w = novaJanela([]);
  checar('sem registros -> resumo genérico', w.__testarResumoPadronizado() === 'Enviado cobrança.');
})();

// 3. ULTIMO_DIA sempre vence sobre qualquer outro título mais atrasado
(function () {
  const w = novaJanela([registro('EM_CARTORIO', 30), registro('ULTIMO_DIA', 6)]);
  checar('ULTIMO_DIA vence sobre EM_CARTORIO mais atrasado', w.__testarResumoPadronizado() === 'Enviado cobrança 6º dia.', w.__testarResumoPadronizado());
})();

// 4. BUG REAL corrigido: janela de aviso SCPC (16-19 dias) vence sobre
//    título mais atrasado em EM_CARTORIO quando não há ULTIMO_DIA
[16, 17, 18, 19].forEach((dias) => {
  const w = novaJanela([registro('EM_CARTORIO', 45), registro('NEGATIVADO_SCPC', dias)]);
  const texto = w.__testarResumoPadronizado();
  checar(`janela de aviso SCPC (dia ${dias}) vence sobre EM_CARTORIO 45 dias`, texto === `Enviado cobrança ${dias}º dia.`, texto);
});

// 5. Fora da janela (dia 25) -- volta a valer "maior atraso real"
(function () {
  const w = novaJanela([registro('EM_CARTORIO', 45), registro('NEGATIVADO_SCPC', 25)]);
  const texto = w.__testarResumoPadronizado();
  checar('fora da janela de aviso SCPC, vence o maior atraso real (45)', texto === 'Enviado cobrança 45º dia.', texto);
})();

resumo();
