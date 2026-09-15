// Carrega módulos REAIS de modulos/*.js num DOM simulado (jsdom), na mesma
// ordem de dependência do @require em smart-table.user.js. Nunca reescreve
// arquivos do repositório: pra módulos protegidos (Módulo 1 e 2, que exigem
// confirmação explícita do usuário pra qualquer edição) que ainda não expõem
// um hook de depuração, `exposicaoExtra` injeta uma linha extra só no TEXTO
// carregado por este processo de teste, nunca no arquivo em disco.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const MODULOS_DIR = path.join(__dirname, '..', '..', 'modulos');

function textoDoModulo(nomeArquivo, exposicaoExtra) {
  const caminho = path.join(MODULOS_DIR, nomeArquivo);
  let texto = fs.readFileSync(caminho, 'utf8');
  if (exposicaoExtra) {
    const idx = texto.lastIndexOf('})();');
    if (idx === -1) {
      throw new Error(`Não encontrei o fechamento do IIFE ("})();") em ${nomeArquivo} pra injetar hook de teste.`);
    }
    texto = texto.slice(0, idx) + exposicaoExtra + '\n' + texto.slice(idx);
  }
  return texto;
}

// specs: lista de { arquivo, exposicaoExtra? }, na ordem de carregamento.
// clientes: se informado, vira window.CLIENTES ANTES de carregar os módulos
// (alguns módulos leem window.CLIENTES no momento em que rodam suas rotinas
// de inicialização síncrona).
function novaJanela({ url, bodyHtml, clientes, specs }) {
  const dom = new JSDOM(`<!doctype html><body>${bodyHtml || ''}</body></html>`, {
    url: url || 'https://texhub.texcotton.com.br/crm/clientes',
  });
  const { window } = dom;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);

  // Espelha no global do Node -- mesmo padrão já validado nos harnesses ad
  // hoc desta sessão de desenvolvimento (necessário pra identificadores
  // livres como `document`/`location`/`MutationObserver`, sem o prefixo
  // `window.`, resolverem certo dentro do código avaliado).
  global.window = window;
  global.document = window.document;
  global.localStorage = window.localStorage;
  global.location = window.location;
  global.URL = window.URL;
  global.URLSearchParams = window.URLSearchParams;
  global.MutationObserver = window.MutationObserver;
  global.requestAnimationFrame = window.requestAnimationFrame;

  if (clientes !== undefined) window.CLIENTES = clientes;

  specs.forEach(({ arquivo, exposicaoExtra }) => {
    window.eval(textoDoModulo(arquivo, exposicaoExtra));
    // jsdom pode reportar document.readyState='loading' no instante do eval
    // (o parsing do documento ainda não terminou de forma síncrona) -- nesse
    // caso a inicialização do módulo só roda via listener de
    // DOMContentLoaded, então disparamos manualmente pra simular o
    // carregamento real da página (@run-at document-idle).
    if (window.document.readyState === 'loading') {
      window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
    }
  });

  return window;
}

module.exports = { novaJanela, textoDoModulo, MODULOS_DIR };
