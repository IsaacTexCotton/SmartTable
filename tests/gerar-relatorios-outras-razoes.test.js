// Testes de gerarRelatoriosDasOutrasRazoes (Alt+A, Módulo 4) -- MELHORIA
// pedida pelo usuário: em vez de esperar um tempo FIXO (4500ms, com folga
// generosa pro pior caso) depois de clicar em "Gerar Relatório" numa aba
// de fundo, espera o SINAL real de que terminou (o próprio botão só
// reabilita depois que aoClicar() do Módulo 1 resolve -- captura, cópia
// pra área de transferência e download já aconteceram). Roda contra o
// código REAL de modulos/modulo4-atalhos-teclado.js via window.__atalhosDebug.
const { JSDOM } = require('jsdom');
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('gerar-relatorios-outras-razoes');

function abrirPaginaPrincipal() {
  const w = novaJanela({
    url: 'https://texhub.texcotton.com.br/crm/clientes/grupo/1?cnpj=11111111%2F0001-11',
    specs: [{ arquivo: 'modulo0-utilitarios-compartilhados.js' }, { arquivo: 'modulo4-atalhos-teclado.js' }],
  });
  // Necessário pra Estratégia 2 (elemento.onclick) do simularCliqueCompleto
  // do Módulo 4 conseguir montar um MouseEvent válido -- mesmo motivo já
  // documentado nos outros helpers de teste (identificadores livres
  // resolvem pelo global do Node, não pela janela de fundo).
  global.MouseEvent = w.MouseEvent;
  w.__alertaGrupo = { empresasComVencido: [{ cnpj: '2', razaoSocial: 'OUTRA RAZAO', vencido: 'R$ 500,00', url: 'https://x/outra' }] };
  return w;
}

// Monta uma "aba de fundo" fake com um botão "Gerar Relatório" que simula
// exatamente o comportamento real do Módulo 1: disabled=true no clique,
// volta a disabled=false depois de `demoraMs` (simulando captura + cópia
// pra área de transferência + download, tudo assíncrono). demoraMs=Infinity
// simula o botão nunca reabilitar (caso do teto de segurança).
function novaAbaFake(demoraMs) {
  const dom = new JSDOM('<!doctype html><body><button>Gerar Relatório</button></body></html>');
  const botao = dom.window.document.querySelector('button');
  botao.disabled = false;
  // jsdom não calcula layout real -- getBoundingClientRect sempre viria
  // zerado, fazendo o Módulo 4 achar que o botão está invisível.
  botao.getBoundingClientRect = () => ({ width: 100, height: 30, top: 0, left: 0, right: 100, bottom: 30 });

  let cliques = 0;
  botao.onclick = () => {
    cliques++;
    botao.disabled = true;
    if (demoraMs !== Infinity) {
      setTimeout(() => { botao.disabled = false; }, demoraMs);
    }
  };

  let fechada = false;
  const janela = {
    closed: false,
    document: dom.window.document,
    close() { fechada = true; this.closed = true; },
  };
  return { janela, botao, estaFechada: () => fechada, totalCliques: () => cliques };
}

// 1. MELHORIA: clica uma vez, fecha a aba depois que o relatório termina.
const promessa1 = (function () {
  const w = abrirPaginaPrincipal();
  const { janela, estaFechada, totalCliques } = novaAbaFake(700);
  w.open = () => janela;

  return w.__atalhosDebug.gerarRelatoriosDasOutrasRazoes().then(() => {
    checar('clicou no botão exatamente uma vez', totalCliques() === 1, totalCliques());
    checar('fechou a aba depois que o relatório terminou', estaFechada());
  });
})();

// 2. MELHORIA: espera só o tempo real -- mede que a duração bate com o
// tempo que o botão levou pra reabilitar (com folga pro overhead de
// polling/setTimeout), bem abaixo do antigo timeout fixo de 4500ms.
const promessa2 = promessa1.then(function () {
  const w = abrirPaginaPrincipal();
  const { janela } = novaAbaFake(500);
  w.open = () => janela;

  const inicio = Date.now();
  return w.__atalhosDebug.gerarRelatoriosDasOutrasRazoes().then(() => {
    const duracao = Date.now() - inicio;
    checar(
      'espera só o tempo real (bem menos que os 4500ms fixos de antes)',
      duracao >= 500 && duracao < 2000,
      `duração=${duracao}ms`
    );
  });
});

// 3. Defensivo: botão nunca reabilita (aoClicar travou/deu erro não
// tratado) -- não trava pra sempre, respeita um teto de segurança e
// resolve false. Usa esperarRelatorioProntoNaJanela diretamente com um
// teto pequeno (não dá pra esperar os 10s reais num teste sem deixá-lo
// lento) -- o comportamento validado é o mesmo, só o valor do teto muda.
const promessa3 = promessa2.then(function () {
  const w = abrirPaginaPrincipal();
  const { janela } = novaAbaFake(Infinity);
  const botao = janela.document.querySelector('button');
  botao.disabled = true; // simula que o clique já foi disparado e está "em andamento", travado

  const inicio = Date.now();
  return w.__atalhosDebug.esperarRelatorioProntoNaJanela(botao, janela, 300, 50).then((terminou) => {
    const duracao = Date.now() - inicio;
    checar('com o botão nunca reabilitando, resolve false ao bater o teto (não trava pra sempre)', terminou === false);
    checar('respeita o teto informado (não espera além dele)', duracao >= 300 && duracao < 700, `duração=${duracao}ms`);
  });
});

promessa3.then(resumo);
