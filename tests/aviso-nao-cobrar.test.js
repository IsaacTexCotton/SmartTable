// Testes do banner de "não cobrar" (Módulo 1) -- Módulo 1 é PROTEGIDO
// (exige confirmação explícita do usuário pra qualquer edição, já obtida
// pra esta mudança visual específica). Como os demais testes de módulos
// protegidos, não ganha hook de depuração permanente -- o texto carregado
// por este teste recebe uma linha extra só em memória (nunca escrita no
// arquivo real) expondo avisarSeNaoCobrar.
const { JSDOM } = require('jsdom');
const { textoDoModulo } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('aviso-nao-cobrar');

const CODIGO = textoDoModulo('modulo1-aviso-cobranca.js', '\nwindow.__testarAvisoNaoCobrar = avisarSeNaoCobrar;\n');

function linhaTabela({ titulo, razaoSocial, vencimento, posicao, valor, dias, portador, seq }) {
  return `<tr><td>${titulo}</td><td>${razaoSocial}</td><td>${vencimento}</td><td>${posicao}</td><td>${valor}</td><td>${dias}</td><td>${portador}</td><td>${seq}</td></tr>`;
}

function abrirPagina(linhasHtml, scpc) {
  const bodyHtml = `
    <div id="tabela-titulos-ds"><table>
      <thead><tr>
        <th data-key="numeroTitulo">Titulo</th><th data-key="razaoSocial">Razao</th>
        <th data-key="dataVencimento">Vencimento</th><th data-key="posicaoDescricao">Posicao</th>
        <th data-key="valorEmAberto">Valor</th><th data-key="diasAtraso">Dias</th>
        <th data-key="portadorDescricao">Portador</th><th data-key="sequencia">Seq</th>
      </tr></thead>
      <tbody>${linhasHtml.join('')}</tbody>
    </table></div>
    <p class="text-sm text-gray-700 mt-1"><span>SCPC:</span><span>${scpc || 'n'}</span></p>
  `;
  const dom = new JSDOM(`<!doctype html><body>${bodyHtml}</body></html>`, { url: 'https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=AAA' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.location = dom.window.location;
  global.MutationObserver = dom.window.MutationObserver;
  dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.requestAnimationFrame = dom.window.requestAnimationFrame;
  dom.window.eval(CODIGO);
  return dom.window;
}

// 1. Título em CARTEIRA (não cobrar) -- banner aparece com o título certo.
(function () {
  const w = abrirPagina([
    linhaTabela({ titulo: '90001', razaoSocial: 'CLIENTE TESTE LTDA', vencimento: '01/09/2026', posicao: 'CARTEIRA', valor: 'R$ 500,00', dias: '10', portador: 'ITAU', seq: '1' }),
  ]);
  w.__testarAvisoNaoCobrar();
  const banner = w.document.getElementById('aviso-nao-cobrar-banner');
  checar('banner aparece quando há título em CARTEIRA', !!banner);
  checar('banner menciona "Não cobrar este cliente"', banner && /não cobrar este cliente/i.test(banner.textContent), banner && banner.textContent);
  checar('banner cita o título certo (90001/1)', banner && /90001\/1/.test(banner.textContent), banner && banner.textContent);
  checar('banner NÃO tem botão de fechar (de propósito)', banner && !banner.querySelector('button'));
})();

// 2. Sem nenhum título em naoCobrar -- banner NÃO aparece. Usa um
// vencimento recente (poucos dias de atraso, dentro da faixa EM_ATRASO) e
// um portador fora de PORTADORES_CARTORIO_LENTO_PARA_ATUALIZAR pra não
// cair sem querer em EM_CARTORIO (o que ativaria a regra "todos os
// títulos já em cartório" e faria o banner aparecer por um motivo
// diferente do que este teste quer isolar).
(function () {
  const hoje = new Date();
  const doisDiasAtras = new Date(hoje.getTime() - 2 * 86400000);
  const vencimentoTexto = String(doisDiasAtras.getDate()).padStart(2, '0') + '/' + String(doisDiasAtras.getMonth() + 1).padStart(2, '0') + '/' + doisDiasAtras.getFullYear();
  const w = abrirPagina([
    linhaTabela({ titulo: '90002', razaoSocial: 'CLIENTE TESTE LTDA', vencimento: vencimentoTexto, posicao: 'COBRANCA', valor: 'R$ 500,00', dias: '2', portador: 'BB', seq: '1' }),
  ]);
  w.__testarAvisoNaoCobrar();
  checar('banner NÃO aparece sem título em naoCobrar', !w.document.getElementById('aviso-nao-cobrar-banner'));
})();

// 3. Chamar duas vezes não duplica o banner.
(function () {
  const w = abrirPagina([
    linhaTabela({ titulo: '90003', razaoSocial: 'CLIENTE TESTE LTDA', vencimento: '01/09/2026', posicao: 'NAO COBRAR', valor: 'R$ 500,00', dias: '10', portador: 'ITAU', seq: '1' }),
  ]);
  w.__testarAvisoNaoCobrar();
  w.__testarAvisoNaoCobrar();
  const banners = w.document.querySelectorAll('#aviso-nao-cobrar-banner');
  checar('chamar duas vezes não duplica o banner', banners.length === 1, banners.length);
})();

// 4. Múltiplos títulos em naoCobrar -- todos citados, separados por vírgula.
(function () {
  const w = abrirPagina([
    linhaTabela({ titulo: '90004', razaoSocial: 'CLIENTE TESTE LTDA', vencimento: '01/09/2026', posicao: 'CARTEIRA', valor: 'R$ 500,00', dias: '10', portador: 'ITAU', seq: '1' }),
    linhaTabela({ titulo: '90005', razaoSocial: 'CLIENTE TESTE LTDA', vencimento: '02/09/2026', posicao: 'NAO COBRAR', valor: 'R$ 300,00', dias: '9', portador: 'BB', seq: '1' }),
  ]);
  w.__testarAvisoNaoCobrar();
  const banner = w.document.getElementById('aviso-nao-cobrar-banner');
  checar('banner cita os dois títulos', banner && /90004\/1/.test(banner.textContent) && /90005\/1/.test(banner.textContent), banner && banner.textContent);
})();

resumo();
