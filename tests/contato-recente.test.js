// Testes de calcularContextoContato (Módulo 6) -- detecção de "contato
// recente" (dia útil anterior) e do sinalizador recontatoConsecutivo, que
// evita omitir o relatório por 2+ dias seguidos quando o cliente não
// responde (pedido do usuário). Roda contra o código REAL de
// modulos/modulo6-contexto-adicional.js via window.__contextoAdicionalDebug.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('contato-recente');

const SPECS = [{ arquivo: 'modulo0-utilitarios-compartilhados.js' }, { arquivo: 'modulo6-contexto-adicional.js' }];

function contatoItem(dataTexto, efetivo) {
  return `<div class="contato-item" data-data="${dataTexto}" data-efetivo="${efetivo}"></div>`;
}

function abrirPagina(itensContato) {
  const bodyHtml = '<div id="content-promessas"></div><div id="content-contatos">' + itensContato.join('') + '</div>';
  return novaJanela({
    url: 'https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=AAA',
    bodyHtml,
    specs: SPECS,
  });
}

// Terça-feira 15/09/2026 -- dia útil anterior é segunda 14/09; o dia útil
// anterior a essa segunda é sexta 11/09 (pula o fim de semana).
const HOJE = new Date(2026, 8, 15);

// 1. Só um contato (ontem) -- primeiro recontato, sem streak.
(function () {
  const w = abrirPagina([contatoItem('14/09/2026 10:00', 'true')]);
  const ctx = w.__contextoAdicionalDebug.calcularContextoContato(HOJE);
  checar('contatoRecente é reconhecido (contato foi ontem)', ctx !== null, ctx);
  checar('recontatoConsecutivo=false quando não há contato antes de ontem', ctx && ctx.recontatoConsecutivo === false, ctx);
})();

// 2. Contato ontem (segunda) E no dia útil anterior a ontem (sexta) --
// ontem já era, ele próprio, um recontato -- streak de 2+ dias.
(function () {
  const w = abrirPagina([
    contatoItem('11/09/2026 10:00', 'true'),
    contatoItem('14/09/2026 10:00', 'true'),
  ]);
  const ctx = w.__contextoAdicionalDebug.calcularContextoContato(HOJE);
  checar('BUG REAL: recontatoConsecutivo=true quando já houve contato no dia útil anterior a ontem também', ctx && ctx.recontatoConsecutivo === true, ctx);
})();

// 3. Contato ontem, mas o contato anterior a esse foi há MAIS de 1 dia
// útil de distância (não exatamente no dia útil anterior a ontem) --
// não é um streak consecutivo.
(function () {
  const w = abrirPagina([
    contatoItem('08/09/2026 10:00', 'true'), // terça da semana anterior -- não é o dia útil antes de 14/09
    contatoItem('14/09/2026 10:00', 'true'),
  ]);
  const ctx = w.__contextoAdicionalDebug.calcularContextoContato(HOJE);
  checar('recontatoConsecutivo=false quando o contato anterior não foi no dia útil imediatamente anterior a ontem', ctx && ctx.recontatoConsecutivo === false, ctx);
})();

// 4. Sem nenhum contato -- calcularContextoContato retorna null (sem
// recontatoConsecutivo pra verificar, não deve lançar exceção).
(function () {
  const w = abrirPagina([]);
  let excecao = null;
  let ctx;
  try {
    ctx = w.__contextoAdicionalDebug.calcularContextoContato(HOJE);
  } catch (e) {
    excecao = e;
  }
  checar('sem nenhum contato, não lança exceção', excecao === null, excecao && excecao.message);
  checar('sem nenhum contato, retorna null', ctx === null);
})();

// 5. Contato não efetivo (efetivo=false) -- calcularContextoContato já
// ignora isso ANTES de chegar no cálculo de recontatoConsecutivo.
(function () {
  const w = abrirPagina([contatoItem('14/09/2026 10:00', 'false')]);
  const ctx = w.__contextoAdicionalDebug.calcularContextoContato(HOJE);
  checar('contato não efetivo é ignorado (retorna null, mesmo comportamento de antes)', ctx === null);
})();

// 6. Contato há 2 dias úteis (não ontem) -- calcularContextoContato
// retorna null antes mesmo de calcular recontatoConsecutivo.
(function () {
  const w = abrirPagina([contatoItem('11/09/2026 10:00', 'true')]); // sexta, não segunda
  const ctx = w.__contextoAdicionalDebug.calcularContextoContato(HOJE);
  checar('contato de 2 dias úteis atrás (não ontem) continua retornando null', ctx === null);
})();

resumo();
