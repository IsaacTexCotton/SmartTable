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

const CODIGO = textoDoModulo('modulo2-registrar-enviar.js', `
window.__testarResumoPadronizado = calcularResumoPadronizado;
window.__testarAgendamentoRapido = {
  criarBotoesAgendamentoRapido,
  aoClicarAgendamentoRapido,
  dataDeHojeIso,
  FRASES_AGENDAMENTO_RAPIDO,
};
window.__testarAbrirWhatsApp = {
  abrirWhatsAppSemNovaAba,
  construirUrlProtocoloWhatsApp,
};
`);

// Mirroring pro global do Node é necessário -- window.eval() por si só não
// basta pra identificadores livres (`window`, `document`) resolverem
// dentro do código avaliado (mesmo padrão dos outros helpers de teste).
function mirrorGlobals(dom) {
  global.window = dom.window;
  global.document = dom.window.document;
  global.location = dom.window.location;
  global.MutationObserver = dom.window.MutationObserver;
  // jsdom valida dispatchEvent() contra a SUA PRÓPRIA classe Event -- o
  // Event global do Node (disponível desde o Node 15+) não serve, mesmo
  // parecendo compatível (mesmo bug já visto com MouseEvent noutro teste).
  global.Event = dom.window.Event;
  // abrirWhatsAppSemNovaAba usa `new URL(...)` -- mesmo motivo do Event
  // acima, precisa ser a classe URL do jsdom, não a do Node.
  global.URL = dom.window.URL;
  dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.requestAnimationFrame = dom.window.requestAnimationFrame;
}

function novaJanela(registros, contextoAdicional) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=AAA' });
  mirrorGlobals(dom);
  dom.window.__avisoCobranca = { simular: () => ({ registros }) };
  if (contextoAdicional) dom.window.__contextoAdicional = contextoAdicional;
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

// 5. Fora da janela (dia 25) -- entre os que sobraram, título fora de
//    cartório (NEGATIVADO_SCPC) vence o título em cartório, mesmo com
//    menos dias -- ver checagens 6-8 abaixo pra regra completa.
(function () {
  const w = novaJanela([registro('EM_CARTORIO', 45), registro('NEGATIVADO_SCPC', 25)]);
  const texto = w.__testarResumoPadronizado();
  checar('fora da janela de aviso SCPC, título fora de cartório (25) vence o de cartório (45)', texto === 'Enviado cobrança 25º dia.', texto);
})();

// 6. BUG REAL (relatado pelo usuário): título já EM_CARTORIO tem MUITO
//    mais dias que outro título ainda evitável -- a nota do CRM (e a
//    mensagem real enviada, que precisa bater com ela) tem que citar o
//    título fora de cartório, não o que já foi pra lá.
(function () {
  const w = novaJanela([registro('EM_CARTORIO', 45), registro('EM_ATRASO', 3)]);
  const texto = w.__testarResumoPadronizado();
  checar('EM_CARTORIO com muito mais dias (45) NÃO vence título fora de cartório com poucos dias (3)', texto === 'Enviado cobrança 3º dia.', texto);
})();

// 7. Mesmo bug com PRAZO_FINAL em vez de EM_ATRASO
(function () {
  const w = novaJanela([registro('EM_CARTORIO', 45), registro('PRAZO_FINAL', 8)]);
  const texto = w.__testarResumoPadronizado();
  checar('EM_CARTORIO com muito mais dias (45) NÃO vence PRAZO_FINAL fora de cartório (8)', texto === 'Enviado cobrança 8º dia.', texto);
})();

// 8. Defensivo: com TODOS os títulos em cartório, ainda escolhe um válido
//    (caso raro -- um cliente assim nem deveria chegar até aqui, ver
//    avisarSeNaoCobrar no Módulo 1)
(function () {
  const w = novaJanela([registro('EM_CARTORIO', 10), registro('EM_CARTORIO', 30)]);
  const texto = w.__testarResumoPadronizado();
  checar('com TODOS os títulos em cartório, ainda escolhe o de maior atraso entre eles (defensivo)', texto === 'Enviado cobrança 30º dia.', texto);
})();

// =====================================================================
// 8b. PEDIDO DO USUÁRIO: cliente sem nenhum contato registrado ainda não
// está em régua de cobrança -- a nota do CRM registra "Primeiro contato -
// Tentativa" em vez do dia de atraso do título (que não é o dia de
// cobrança do cliente). Bate com a mensagem que o Alt+A já manda nesse
// caso (só apresentação + confirmação do responsável).
// =====================================================================
(function () {
  const w = novaJanela([registro('ULTIMO_DIA', 6)], { semContatoAnterior: true });
  const texto = w.__testarResumoPadronizado();
  checar('primeiro contato -> "Primeiro contato - Tentativa" (não o dia de atraso)', texto === 'Primeiro contato - Tentativa', texto);
})();

(function () {
  // Mesmo com título em situação "urgente", primeiro contato continua
  // sendo primeiro contato -- a exceção vem ANTES de qualquer regra de
  // priorização de título.
  const w = novaJanela([registro('EM_CARTORIO', 45), registro('NEGATIVADO_SCPC', 19)], { semContatoAnterior: true });
  const texto = w.__testarResumoPadronizado();
  checar('primeiro contato vence sobre qualquer priorização de título', texto === 'Primeiro contato - Tentativa', texto);
})();

(function () {
  // Cliente COM contato anterior mantém o resumo de sempre.
  const w = novaJanela([registro('ULTIMO_DIA', 6)], { semContatoAnterior: false });
  const texto = w.__testarResumoPadronizado();
  checar('cliente com contato anterior mantém "Enviado cobrança Xº dia."', texto === 'Enviado cobrança 6º dia.', texto);
})();

(function () {
  // Sem Módulo 6 disponível (window.__contextoAdicional indefinido), cai
  // no comportamento de sempre -- o Módulo 2 nunca dependeu dele.
  const w = novaJanela([registro('ULTIMO_DIA', 6)]);
  const texto = w.__testarResumoPadronizado();
  checar('sem window.__contextoAdicional (Módulo 6 ausente), mantém o resumo de sempre', texto === 'Enviado cobrança 6º dia.', texto);
})();

(function () {
  // Primeiro contato sem título nenhum classificado também não vira o
  // genérico "Enviado cobrança." -- a exceção é checada antes disso.
  const w = novaJanela([], { semContatoAnterior: true });
  const texto = w.__testarResumoPadronizado();
  checar('primeiro contato sem títulos ainda registra "Primeiro contato - Tentativa"', texto === 'Primeiro contato - Tentativa', texto);
})();

// =====================================================================
// 8c. PEDIDO DO USUÁRIO (2ª tentativa -- a 1ª, reaproveitar a aba por
// nome, resolvia "acumular" mas não o problema de verdade: mesmo
// reaproveitada, a aba sempre rouba o foco, então o Alt-Tab ainda caía
// nela em vez de voltar pro CRM). abrirWhatsAppCliente() (função própria
// da página) sempre chama window.open(url, '_blank', ...) com a URL do
// wa.me pronta. Interceptamos essa chamada e, em vez de abrir QUALQUER
// aba, navegamos a própria aba do CRM pro protocolo do WhatsApp Desktop
// (whatsapp://send?phone=...&text=...) -- confirmado AO VIVO com o
// usuário que isso não navega a página (não é http/https), só entrega
// pro sistema operacional abrir o app.
// =====================================================================
function novaJanelaWhatsApp() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=AAA' });
  mirrorGlobals(dom);
  dom.window.eval(CODIGO);
  return dom.window;
}

// Mesma construção de URL que a abrirWhatsAppCliente() real faz
// (confirmada com o usuário): https://wa.me/<telefone>?text=<mensagem>.
function urlWaMe(telefone, mensagem) {
  return 'https://wa.me/' + telefone + '?text=' + encodeURIComponent(mensagem);
}

// construirUrlProtocoloWhatsApp é uma função pura (URL do wa.me -> URL do
// protocolo do WhatsApp Desktop) -- testada isoladamente, sem depender da
// navegação de verdade acontecer. jsdom não implementa navegação pra
// protocolos não-http(s) (nem deveria: no navegador real, confirmado com
// o usuário, a própria aba TAMBÉM não muda de local.href quando não há
// pra onde navegar -- é só um "handoff" pro sistema operacional). Por
// isso os testes abaixo checam a URL CONSTRUÍDA, não location.href.
(function () {
  const w = novaJanelaWhatsApp();
  const resultado = w.__testarAbrirWhatsApp.construirUrlProtocoloWhatsApp(urlWaMe('5511999999999', 'Olá, tudo bem?'));

  checar(
    'PEDIDO DO USUÁRIO: URL do protocolo do WhatsApp Desktop montada certa a partir da URL do wa.me',
    resultado === 'whatsapp://send?phone=5511999999999&text=' + encodeURIComponent('Olá, tudo bem?'),
    resultado
  );
})();

(function () {
  // Telefone com caracteres especiais na mensagem (espaço, acento, "&",
  // quebra de linha) sobrevive ao ciclo decodificar/recodificar.
  const w = novaJanelaWhatsApp();
  const mensagem = 'Oi! Tudo bem?\nSeu título de R$ 100,00 & juros venceu.';
  const resultado = w.__testarAbrirWhatsApp.construirUrlProtocoloWhatsApp(urlWaMe('5511988887777', mensagem));

  checar(
    'mensagem com caracteres especiais chega intacta no protocolo do WhatsApp',
    resultado === 'whatsapp://send?phone=5511988887777&text=' + encodeURIComponent(mensagem),
    resultado
  );
})();

(function () {
  // Confirma que abrirWhatsAppSemNovaAba() de fato ATRIBUI o resultado a
  // window.location.href (o efeito colateral em si) -- não dá pra
  // verificar o valor final por causa da limitação de navegação do jsdom
  // citada acima, mas dá pra confirmar que NENHUMA aba nova foi criada
  // (window.open nunca chega a abrir de verdade -- é substituído durante
  // a chamada).
  const w = novaJanelaWhatsApp();
  let abriuAbaDeVerdade = false;
  const openOriginal = w.open;
  w.open = function (...args) { abriuAbaDeVerdade = true; return openOriginal.apply(this, args); };
  w.abrirWhatsAppCliente = function () {
    return w.open(urlWaMe('5511999999999', 'oi'), '_blank', 'noopener,noreferrer');
  };

  w.__testarAbrirWhatsApp.abrirWhatsAppSemNovaAba();

  checar('PEDIDO DO USUÁRIO: nenhuma aba nova é aberta de verdade', abriuAbaDeVerdade === false);
})();

(function () {
  // window.open é restaurado depois da chamada -- não pode "vazar" a
  // interceptação pro resto da página.
  const w = novaJanelaWhatsApp();
  const openOriginal = w.open;
  w.abrirWhatsAppCliente = function () { return w.open(urlWaMe('5511999999999', 'oi'), '_blank', ''); };

  w.__testarAbrirWhatsApp.abrirWhatsAppSemNovaAba();

  checar('window.open é restaurado ao original depois da chamada', w.open === openOriginal);
})();

(function () {
  // Defensivo: se abrirWhatsAppCliente() lançar (bug da própria página,
  // fora do nosso controle), window.open ainda é restaurado (finally).
  const w = novaJanelaWhatsApp();
  const openOriginal = w.open;
  w.abrirWhatsAppCliente = function () { throw new Error('falha simulada'); };

  let excecaoPropagada = null;
  try {
    w.__testarAbrirWhatsApp.abrirWhatsAppSemNovaAba();
  } catch (e) {
    excecaoPropagada = e;
  }

  checar('exceção de abrirWhatsAppCliente() propaga (quem chama já trata com try/catch)', excecaoPropagada !== null && excecaoPropagada.message === 'falha simulada');
  checar('mesmo com exceção, window.open é restaurado ao original', w.open === openOriginal);
})();

(function () {
  // Defensivo: abrirWhatsAppCliente() pode retornar cedo (mensagem vazia,
  // telefone inválido) sem chamar window.open nenhuma vez -- não pode
  // quebrar, e a aba não deve navegar pra lugar nenhum nesse caso.
  const w = novaJanelaWhatsApp();
  const hrefAntes = w.location.href;
  let chamouOpen = false;
  w.open = () => { chamouOpen = true; return { closed: false }; };
  w.abrirWhatsAppCliente = function () { /* retorna sem chamar window.open (ex.: mensagem vazia) */ };

  let excecao = null;
  try {
    w.__testarAbrirWhatsApp.abrirWhatsAppSemNovaAba();
  } catch (e) {
    excecao = e;
  }

  checar('abrirWhatsAppCliente() sem chamar window.open não lança exceção', excecao === null, excecao && excecao.message);
  checar('window.open realmente não foi chamado nesse caso', chamouOpen === false);
  checar('aba não navega pra lugar nenhum quando abrirWhatsAppCliente() não chama window.open', w.location.href === hrefAntes, w.location.href);
})();

// =====================================================================
// 9-15. Agendamento rápido (observação + data de hoje) -- PEDIDO DO
// USUÁRIO: 3 botões logo abaixo do card "Atenção" (fora da seção de
// Promessa) que inserem uma frase pronta na observação e selecionam a
// data de hoje no campo "Data Prometida", num clique só.
// =====================================================================
function novaJanelaModalContato() {
  const dom = new JSDOM(
    `<!doctype html><body>
      <div id="modal-contato">
        <div>
          <label>Resultado do Contato</label>
          <div class="grid grid-cols-3 gap-2">
            <button type="button" id="btn-resultado-PROMESSA_PAGAMENTO">Promessa de Pagamento</button>
          </div>
          <button type="button" id="btn-resultado-ATENCAO">Atenção</button>
        </div>
        <div>
          <div id="frases-padrao-lista">
            <button type="button" class="btn-inserir-frase" title="Cliente enviou comprovante de pagamento."></button>
            <button type="button" class="btn-inserir-frase" title="Cliente informou que pagou"></button>
            <button type="button" class="btn-inserir-frase" title="Cliente agendou o pagamento."></button>
          </div>
          <textarea name="resumo" id="contato-resumo"></textarea>
        </div>
        <div id="secao-promessa" class="hidden">
          <input type="date" name="dataPromessa" id="input-data-promessa">
        </div>
      </div>
    </body></html>`,
    { url: 'https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=AAA' }
  );
  mirrorGlobals(dom);
  dom.window.eval(CODIGO);
  return dom.window;
}

function iso(data) {
  return data.getFullYear() + '-' + String(data.getMonth() + 1).padStart(2, '0') + '-' + String(data.getDate()).padStart(2, '0');
}

// 9. dataDeHojeIso() bate com a data real, no formato certo pro <input type="date">
(function () {
  const w = novaJanelaModalContato();
  const esperado = iso(new Date());
  checar('dataDeHojeIso() retorna a data de hoje no formato YYYY-MM-DD', w.__testarAgendamentoRapido.dataDeHojeIso() === esperado, w.__testarAgendamentoRapido.dataDeHojeIso());
})();

// 10. Os botões são criados logo abaixo do card "Atenção" (fora da seção de promessa)
(function () {
  const w = novaJanelaModalContato();
  w.__testarAgendamentoRapido.criarBotoesAgendamentoRapido();
  const wrap = w.document.getElementById('agendamento-rapido-wrap');
  checar('cria o wrap dos botões', !!wrap);
  checar('inserido logo depois do botão Atenção, no mesmo pai', wrap && wrap.previousElementSibling && wrap.previousElementSibling.id === 'btn-resultado-ATENCAO');
  checar('fica fora de #secao-promessa (não é descendente dela)', wrap && !w.document.getElementById('secao-promessa').contains(wrap));
  checar('cria os 3 botões esperados', wrap && wrap.querySelectorAll('button').length === 3, wrap && wrap.innerHTML);
})();

// 11. Chamar duas vezes não duplica
(function () {
  const w = novaJanelaModalContato();
  w.__testarAgendamentoRapido.criarBotoesAgendamentoRapido();
  w.__testarAgendamentoRapido.criarBotoesAgendamentoRapido();
  checar('não duplica ao chamar duas vezes', w.document.querySelectorAll('#agendamento-rapido-wrap').length === 1);
})();

// 12. Defensivo: sem #btn-resultado-ATENCAO, não lança exceção nem cria nada
(function () {
  const dom = new JSDOM('<!doctype html><body><div id="modal-contato"></div></body></html>', { url: 'https://texhub.texcotton.com.br/crm/clientes' });
  mirrorGlobals(dom);
  dom.window.eval(CODIGO);
  let excecao = null;
  try {
    dom.window.__testarAgendamentoRapido.criarBotoesAgendamentoRapido();
  } catch (e) {
    excecao = e;
  }
  checar('sem #btn-resultado-ATENCAO não lança exceção', excecao === null, excecao && excecao.message);
  checar('sem #btn-resultado-ATENCAO não cria o wrap', dom.window.document.getElementById('agendamento-rapido-wrap') === null);
})();

// 13. Clicar num item com frase já existente nas "Frases padrão" reaproveita
// o botão nativo (não insere direto no textarea), seleciona "Promessa de
// Pagamento" como resultado (BUG REAL relatado pelo usuário: sem isso, a
// seção com a lista de títulos pra marcar nunca aparecia) e seleciona a
// data de hoje.
(function () {
  const w = novaJanelaModalContato();
  let cliquesNoNativo = 0;
  const botaoNativo = w.document.querySelector('.btn-inserir-frase[title="Cliente enviou comprovante de pagamento."]');
  botaoNativo.addEventListener('click', () => {
    cliquesNoNativo++;
    // Simula o comportamento real da página (inserir na observação).
    w.document.getElementById('contato-resumo').value = botaoNativo.title;
  });

  let cliquesNoResultadoPromessa = 0;
  const botaoResultadoPromessa = w.document.getElementById('btn-resultado-PROMESSA_PAGAMENTO');
  botaoResultadoPromessa.addEventListener('click', () => {
    cliquesNoResultadoPromessa++;
    // Simula o comportamento real da página (revela a seção de promessa).
    w.document.getElementById('secao-promessa').classList.remove('hidden');
  });

  let eventoChangeDisparado = false;
  w.document.getElementById('input-data-promessa').addEventListener('change', () => { eventoChangeDisparado = true; });

  w.__testarAgendamentoRapido.aoClicarAgendamentoRapido('Cliente enviou comprovante de pagamento.');

  checar('seleciona "Promessa de Pagamento" como resultado (1 clique no botão nativo)', cliquesNoResultadoPromessa === 1, cliquesNoResultadoPromessa);
  checar('BUG REAL CORRIGIDO: seção de promessa (lista de títulos) fica visível', !w.document.getElementById('secao-promessa').classList.contains('hidden'));
  checar('reaproveita o botão nativo de frase (1 clique, não insere direto)', cliquesNoNativo === 1, cliquesNoNativo);
  checar('observação recebeu o texto (via botão nativo)', w.document.getElementById('contato-resumo').value === 'Cliente enviou comprovante de pagamento.');
  checar('data de pagamento preenchida com hoje', w.document.getElementById('input-data-promessa').value === iso(new Date()));
  checar('evento "change" disparado no campo de data (pro cálculo nativo de juros/multa rodar)', eventoChangeDisparado === true);
})();

// 13b. Defensivo: sem #btn-resultado-PROMESSA_PAGAMENTO na página, não
// lança exceção -- só não seleciona o resultado (o resto continua funcionando).
(function () {
  const dom = new JSDOM(
    `<!doctype html><body>
      <textarea name="resumo" id="contato-resumo"></textarea>
      <input type="date" name="dataPromessa" id="input-data-promessa">
    </body></html>`,
    { url: 'https://texhub.texcotton.com.br/crm/clientes' }
  );
  mirrorGlobals(dom);
  dom.window.eval(CODIGO);

  let excecao = null;
  try {
    dom.window.__testarAgendamentoRapido.aoClicarAgendamentoRapido('Cliente agendou o pagamento.');
  } catch (e) {
    excecao = e;
  }
  checar('sem #btn-resultado-PROMESSA_PAGAMENTO não lança exceção', excecao === null, excecao && excecao.message);
  checar('mesmo assim, observação e data continuam sendo preenchidas', dom.window.document.getElementById('contato-resumo').value === 'Cliente agendou o pagamento.' && dom.window.document.getElementById('input-data-promessa').value === iso(new Date()));
})();

// 14. Fallback: frase sem botão nativo correspondente insere direto na
// observação (acrescentando, sem apagar texto já digitado).
(function () {
  const w = novaJanelaModalContato();
  w.document.getElementById('contato-resumo').value = 'Texto já digitado pelo operador.';

  w.__testarAgendamentoRapido.aoClicarAgendamentoRapido('Frase sem correspondência nativa');

  const textoFinal = w.document.getElementById('contato-resumo').value;
  checar(
    'fallback acrescenta a frase ao texto já existente, sem apagar',
    textoFinal === 'Texto já digitado pelo operador.\nFrase sem correspondência nativa',
    textoFinal
  );
  checar('mesmo no fallback, a data de hoje é selecionada', w.document.getElementById('input-data-promessa').value === iso(new Date()));
})();

// 15. Defensivo: sem #input-data-promessa (seção de promessa nunca chegou
// a existir), inserir a frase continua funcionando, só sem a data.
(function () {
  const dom = new JSDOM(
    `<!doctype html><body>
      <textarea name="resumo" id="contato-resumo"></textarea>
    </body></html>`,
    { url: 'https://texhub.texcotton.com.br/crm/clientes' }
  );
  mirrorGlobals(dom);
  dom.window.eval(CODIGO);

  let excecao = null;
  try {
    dom.window.__testarAgendamentoRapido.aoClicarAgendamentoRapido('Cliente informou que pagou');
  } catch (e) {
    excecao = e;
  }
  checar('sem #input-data-promessa não lança exceção', excecao === null, excecao && excecao.message);
  checar('mesmo sem o campo de data, a observação é preenchida (fallback)', dom.window.document.getElementById('contato-resumo').value === 'Cliente informou que pagou');
})();

resumo();
