// Testes do painel de configurações (Alt+O, Módulo 9), do armazenamento de
// configuração (Módulo 0) e do roteamento do WhatsApp que depende dele
// (Módulo 2).
//
// O QUE ESTE ARQUIVO PROTEGE, em ordem de gravidade:
//
//   1. O PADRÃO. Todo interruptor novo tem que nascer no comportamento que
//      já existia antes dele. Quem nunca abriu o painel não pode ter nada
//      mudando embaixo dos pés -- e "mudando embaixo dos pés" aqui significa
//      mensagem de cobrança saindo por um canal que a pessoa não escolheu.
//
//   2. A TELA NÃO PODE MENTIR. Se o localStorage recusar a gravação (cota
//      cheia, aba anônima), o interruptor tem que continuar mostrando o
//      valor que de fato está em vigor, não o que a pessoa tentou escolher.
//
//   3. A REUTILIZAÇÃO. O painel lê as definições do Módulo 0; ele não pode
//      conhecer nenhuma configuração pelo nome. Acrescentar um interruptor
//      tem que ser uma entrada no Módulo 0, e nada mais.
const { novaJanela, textoDoModulo } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('configuracoes');

const URL_CRM = 'https://texhub.texcotton.com.br/crm/clientes';
const SPECS = [
  { arquivo: 'modulo0-utilitarios-compartilhados.js' },
  { arquivo: 'modulo9-painel-configuracoes.js' },
];

const abrir = () => novaJanela({ url: URL_CRM, specs: SPECS });

// =====================================================================
// 1. ARMAZENAMENTO (Módulo 0)
// =====================================================================
(function armazenamento() {
  const w = abrir();
  const config = w.__smartTableUtil.config;

  checar(
    'o interruptor do WhatsApp Web nasce DESLIGADO (o comportamento de sempre)',
    config.ligado('usarWhatsAppWeb') === false
  );
  checar('a definição declara esse mesmo padrão', config.DEFINICOES.usarWhatsAppWeb.padrao === false);

  checar('definir(true) passa a valer', config.definir('usarWhatsAppWeb', true) === true && config.ligado('usarWhatsAppWeb') === true);
  checar('o valor sobrevive no localStorage', JSON.parse(w.localStorage.getItem(config.CHAVE_CONFIG)).usarWhatsAppWeb === true);
  checar('alternar() inverte e devolve o novo valor', config.alternar('usarWhatsAppWeb') === false);
  checar('alternar() de novo volta', config.alternar('usarWhatsAppWeb') === true);

  // Valor "quase booleano" não pode virar comportamento -- é o tipo de lixo
  // que sobra de uma versão anterior ou de alguém editando à mão.
  w.localStorage.setItem(config.CHAVE_CONFIG, JSON.stringify({ usarWhatsAppWeb: 'sim' }));
  checar('valor não-booleano no storage é ignorado e cai no padrão', config.ligado('usarWhatsAppWeb') === false);

  w.localStorage.setItem(config.CHAVE_CONFIG, '{isso não é json');
  checar('JSON corrompido não lança e cai no padrão', config.ligado('usarWhatsAppWeb') === false);

  checar('chave desconhecida é tratada como desligada', config.ligado('naoExiste') === false);
  checar('chave desconhecida não é gravada', config.definir('naoExiste', true) === false);
})();

// =====================================================================
// 2. A TELA NÃO MENTE QUANDO A GRAVAÇÃO FALHA
// =====================================================================
(function gravacaoRecusada() {
  const w = abrir();
  const config = w.__smartTableUtil.config;

  // LIÇÃO JÁ PAGA NESTE PROJETO: substituir w.localStorage.setItem não
  // funciona no jsdom -- identificadores livres dentro do window.eval
  // resolvem para o global do Node, e a substituição some. Tem que ser no
  // Storage.prototype, que é o objeto de verdade por trás dos dois.
  const original = w.Storage.prototype.setItem;
  w.Storage.prototype.setItem = function () {
    throw new Error('QuotaExceededError simulado');
  };

  const devolvido = config.alternar('usarWhatsAppWeb');
  checar(
    'com o localStorage recusando, alternar() devolve o valor que CONTINUA valendo',
    devolvido === false,
    `devolveu ${devolvido}`
  );
  checar('e definir() admite a falha', config.definir('usarWhatsAppWeb', true) === false);

  w.Storage.prototype.setItem = original;
})();

// =====================================================================
// 3. O PAINEL (Módulo 9)
// =====================================================================
(function painel() {
  const w = abrir();
  const painelApi = w.__painelConfiguracoes;
  const config = w.__smartTableUtil.config;
  const id = painelApi.CONFIG_PAINEL.ID_PAINEL;

  checar('o painel começa fechado', painelApi.estaAberto() === false);

  painelApi.alternarPainel();
  const el = w.document.getElementById(id);
  checar('Alt+O abre o painel', painelApi.estaAberto() === true && el !== null);

  // O painel NÃO pode cobrir os modais do CRM (z-50). Regra já aprendida à
  // força quando o alerta de grupo sumiu atrás da navegação rápida.
  checar('o painel fica ABAIXO dos modais do CRM (z-index < 50)', Number(el.style.zIndex) < 50, `z-index=${el.style.zIndex}`);

  // REUTILIZAÇÃO: uma linha por definição declarada, sem o painel conhecer
  // nenhum nome. Se alguém acrescentar um interruptor no Módulo 0 e o painel
  // não mostrar, é aqui que quebra.
  const linhas = el.querySelectorAll('[role="switch"]');
  const quantasDefinicoes = Object.keys(config.DEFINICOES).length;
  checar(
    'o painel desenha uma linha por definição do Módulo 0',
    linhas.length === quantasDefinicoes,
    `linhas=${linhas.length} definições=${quantasDefinicoes}`
  );
  checar(
    'cada linha aponta pra chave que ela controla',
    [...linhas].every((l) => Boolean(config.DEFINICOES[l.dataset.chave])),
    [...linhas].map((l) => l.dataset.chave).join(', ')
  );
  checar('a linha mostra o título vindo da definição', el.textContent.includes(config.DEFINICOES.usarWhatsAppWeb.titulo));

  // Clicar tem que GRAVAR, não só pintar.
  const linhaZap = el.querySelector('[data-chave="usarWhatsAppWeb"]');
  checar('a linha nasce refletindo o valor atual', linhaZap.getAttribute('aria-checked') === 'false');
  linhaZap.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  checar('clicar liga a configuração de verdade', config.ligado('usarWhatsAppWeb') === true);
  checar('e a linha passa a se declarar ligada', linhaZap.getAttribute('aria-checked') === 'true');
  linhaZap.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  checar('clicar de novo desliga', config.ligado('usarWhatsAppWeb') === false);

  // Teclado: a ferramenta inteira é operada por atalho, um painel só clicável
  // seria o ponto fora da curva.
  linhaZap.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
  checar('Espaço na linha também alterna', config.ligado('usarWhatsAppWeb') === true);

  painelApi.alternarPainel();
  checar('Alt+O de novo fecha', painelApi.estaAberto() === false && w.document.getElementById(id) === null);

  painelApi.alternarPainel();
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  checar('Esc fecha o painel', painelApi.estaAberto() === false);
})();

// =====================================================================
// 4. O PAINEL SEM O MÓDULO 0
// =====================================================================
// Cache velho do Tampermonkey servindo um @require quebrado é um caso REAL
// neste projeto. O painel tem que avisar, não estourar TypeError no meio da
// cobrança.
(function painelSemModuloZero() {
  const w = novaJanela({ url: URL_CRM, specs: [{ arquivo: 'modulo9-painel-configuracoes.js' }] });
  let estourou = false;
  try {
    w.__painelConfiguracoes.alternarPainel();
  } catch (erro) {
    estourou = true;
  }
  checar('sem o Módulo 0 o painel abre sem lançar', estourou === false);
  const el = w.document.getElementById(w.__painelConfiguracoes.CONFIG_PAINEL.ID_PAINEL);
  checar('e explica na tela o que aconteceu', Boolean(el) && /Módulo 0/.test(el.textContent));
})();

// =====================================================================
// 5. O ROTEAMENTO DO WHATSAPP (Módulo 2)
// =====================================================================
// Módulo 2 é PROTEGIDO: o hook de teste é injetado só em memória, nunca
// escrito no arquivo (ver helpers/dom-env.js).
const EXPOSICAO_M2 = `
window.__testarCanalWhatsApp = {
  abrirWhatsAppSemNovaAba,
  construirUrlProtocoloWhatsApp,
  construirUrlWhatsAppWeb,
};
`;

/**
 * Monta uma janela com Módulo 0 + Módulo 2 e uma abrirWhatsAppCliente()
 * falsa que chama window.open com a URL do wa.me, exatamente como a função
 * real da página faz.
 *
 * COMO O TESTE DISTINGUE OS DOIS CAMINHOS: o jsdom não implementa navegação,
 * então não dá pra ler o valor que o módulo atribui a window.location.href
 * (limitação já enfrentada em registrar-enviar.test.js). Mas os dois ramos
 * são mutuamente exclusivos e observáveis: o caminho do WEB chama o
 * window.open ORIGINAL, e o caminho do DESKTOP não chama ninguém -- navega a
 * própria aba. Espionar o window.open separa um do outro sem ambiguidade. A
 * URL do whatsapp:// em si é coberta pela função pura, em
 * registrar-enviar.test.js.
 *
 * @param {boolean} ligarWeb Estado do interruptor antes do envio.
 * @param {boolean} comModuloZero false simula o Módulo 0 não ter carregado.
 */
function janelaDeEnvio(ligarWeb, comModuloZero = true) {
  const specs = [];
  if (comModuloZero) specs.push({ arquivo: 'modulo0-utilitarios-compartilhados.js' });
  specs.push({ arquivo: 'modulo2-registrar-enviar.js', exposicaoExtra: EXPOSICAO_M2 });

  const w = novaJanela({ url: URL_CRM, specs });
  if (comModuloZero) w.__smartTableUtil.config.definir('usarWhatsAppWeb', ligarWeb);

  const aberturas = [];
  // Espião instalado ANTES da chamada: é ele que o módulo guarda como
  // `openOriginal` e usa no caminho do WhatsApp Web.
  w.open = function (url, alvo) {
    aberturas.push({ url, alvo });
    return null;
  };
  w.abrirWhatsAppCliente = function () {
    return w.open('https://wa.me/5511999998888?text=' + encodeURIComponent('Olá, tudo bem?'));
  };

  return { w, aberturas };
}

(function roteamento() {
  // --- função pura ---
  const { w: wPuro } = janelaDeEnvio(false);
  const urlWeb = wPuro.__testarCanalWhatsApp.construirUrlWhatsAppWeb('https://wa.me/5511999998888?text=Oi%20tudo%20bem%3F');
  checar('construirUrlWhatsAppWeb aponta pro web.whatsapp.com', urlWeb.startsWith('https://web.whatsapp.com/send?phone=5511999998888'));
  checar('e leva a mensagem codificada', urlWeb.includes('text=Oi%20tudo%20bem%3F'), urlWeb);

  // --- padrão: app Desktop ---
  const desktop = janelaDeEnvio(false);
  desktop.w.__testarCanalWhatsApp.abrirWhatsAppSemNovaAba();
  checar(
    'com o interruptor DESLIGADO, NENHUMA aba é aberta (vai pro app Desktop, como sempre foi)',
    desktop.aberturas.length === 0,
    JSON.stringify(desktop.aberturas)
  );

  // --- ligado: WhatsApp Web ---
  const web = janelaDeEnvio(true);
  web.w.__testarCanalWhatsApp.abrirWhatsAppSemNovaAba();
  checar(
    'com o interruptor LIGADO, o envio vai pro WhatsApp Web',
    web.aberturas.length === 1 && web.aberturas[0].url.startsWith('https://web.whatsapp.com/send?'),
    JSON.stringify(web.aberturas)
  );
  checar('a mensagem vai junto', decodeURIComponent(web.aberturas[0].url).includes('Olá, tudo bem?'));
  checar(
    'numa aba NOMEADA, pra não empilhar uma aba por cliente',
    web.aberturas[0].alvo === 'smarttable_zap',
    String(web.aberturas[0].alvo)
  );

  // --- Módulo 0 ausente: cai no comportamento de sempre ---
  const semConfig = janelaDeEnvio(false, false);
  semConfig.w.__testarCanalWhatsApp.abrirWhatsAppSemNovaAba();
  checar(
    'sem o Módulo 0, o envio continua indo pro app Desktop (nenhuma aba aberta)',
    semConfig.aberturas.length === 0,
    JSON.stringify(semConfig.aberturas)
  );

  // O window.open não pode "vazar" interceptado depois da chamada, nos DOIS
  // caminhos -- no do web o módulo chama openOriginal por dentro, o que é
  // exatamente onde um restore mal feito passaria despercebido.
  const vazamento = janelaDeEnvio(true);
  const espiao = vazamento.w.open;
  vazamento.w.__testarCanalWhatsApp.abrirWhatsAppSemNovaAba();
  checar('depois do envio pelo Web, window.open volta ao original', vazamento.w.open === espiao);
})();

// =====================================================================
// 6. O ATALHO Alt+O EXISTE E ESTÁ DOCUMENTADO
// =====================================================================
(function atalho() {
  const texto = textoDoModulo('modulo4-atalhos-teclado.js');
  checar("o Módulo 4 declara TECLA_CONFIGURACOES: 'KeyO'", /TECLA_CONFIGURACOES:\s*'KeyO'/.test(texto));
  checar('e o switch de teclas trata essa tecla', /case CONFIG_ATALHOS\.TECLA_CONFIGURACOES:/.test(texto));
  checar('o painel de ajuda (Alt+H) lista o Alt+O', /tecla: 'Alt\+O'/.test(texto));

  // Nenhuma tecla pode atender a dois atalhos -- o segundo simplesmente
  // nunca dispararia, e em silêncio.
  const teclas = [...texto.matchAll(/TECLA_\w+:\s*'(Key\w+)'/g)].map((m) => m[1]);
  checar(
    'nenhuma tecla de atalho está duplicada',
    new Set(teclas).size === teclas.length,
    teclas.filter((t, i) => teclas.indexOf(t) !== i).join(', ') || '(nenhuma)'
  );
})();

resumo();
