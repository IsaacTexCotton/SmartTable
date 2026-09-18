// Só UM painel flutuante nosso na tela por vez.
//
// DEFEITO REAL que motivou este arquivo: quatro painéis (Ajuda/Alt+H,
// Novidades/Alt+L, Configurações/Alt+O, Entrou na semana/Alt+D) abriam todos
// em bottom:112px left:16px, e nenhum fechava os outros. Abrir dois
// empilhava um em cima do outro; fechar o de cima revelava um painel que a
// pessoa não lembrava de ter aberto.
//
// A causa foi copiar coordenadas de um painel pro seguinte -- ou seja, o
// erro se repete sozinho a cada painel novo. Por isso o teste não confere
// posição (reposicionar só move o problema de canto): ele confere a REGRA.
// Painel novo que esqueça de entrar no registro do Módulo 0 falha aqui.
//
// Isto é o orçamento de tela do projeto expresso em asserção: por mais
// painéis que existam, a quantidade de coisa simultânea na tela não cresce.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('paineis-exclusivos');

const URL_CRM = 'https://texhub.texcotton.com.br/crm/clientes';

// Carrega os três módulos que desenham painéis flutuantes.
const SPECS = [
  { arquivo: 'modulo0-utilitarios-compartilhados.js' },
  { arquivo: 'modulo9-painel-configuracoes.js' },
  { arquivo: 'modulo10-recebido-na-semana.js' },
  { arquivo: 'modulo3-fila-atendimento.js' },
  { arquivo: 'modulo7-fila-prioridade.js' },
  { arquivo: 'modulo11-progresso-fila.js' },
];

function abrir() {
  const w = novaJanela({ url: URL_CRM, specs: SPECS });
  // O Alt+D busca na rede; aqui o que importa é o esqueleto do painel, que
  // é montado antes da resposta chegar.
  w.fetch = () => new Promise(() => {});
  return w;
}

// =====================================================================
// 1. O REGISTRO EXISTE E É USÁVEL
// =====================================================================
(function registro() {
  const w = abrir();
  const u = w.__smartTableUtil;

  checar('o Módulo 0 expõe registrarPainel', typeof u.registrarPainel === 'function');
  checar('e fecharOutrosPaineis', typeof u.fecharOutrosPaineis === 'function');

  let fechouA = 0;
  let fechouB = 0;
  u.registrarPainel('testeA', () => { fechouA += 1; });
  u.registrarPainel('testeB', () => { fechouB += 1; });

  u.fecharOutrosPaineis('testeA');
  checar('fecharOutrosPaineis não fecha quem está abrindo', fechouA === 0);
  checar('e fecha os demais', fechouB === 1);

  // Um fechador que estoura não pode impedir o painel novo de abrir -- seria
  // trocar um painel sobreposto por uma tela que não responde.
  u.registrarPainel('quebrado', () => { throw new Error('falha simulada'); });
  let propagou = false;
  try {
    u.fecharOutrosPaineis('testeA');
  } catch {
    propagou = true;
  }
  checar('erro no fechador de um painel não propaga', propagou === false);
})();

// =====================================================================
// 2. OS PAINÉIS DE VERDADE SE EXCLUEM
// =====================================================================
(function exclusaoReal() {
  const w = abrir();
  const config = w.__painelConfiguracoes;
  const recebido = w.__recebidoSemana;
  const progresso = w.__progressoFila;

  config.alternarPainel();
  checar('Alt+O abre o painel de configurações', config.estaAberto() === true);

  recebido.alternarPainel();
  checar('Alt+D abre o painel de recebimentos', recebido.estaAberto() === true);
  checar('E FECHA o de configurações (era o bug: os dois no mesmo pixel)', config.estaAberto() === false);

  progresso.alternarPainel();
  checar('o botão de progresso abre o painel dele', progresso.estaAberto() === true);
  checar('e fecha o de recebimentos', recebido.estaAberto() === false);

  const naTela = w.document.querySelectorAll(
    `#${w.__painelConfiguracoes.CONFIG_PAINEL.ID_PAINEL}, #${w.__recebidoSemana.CONFIG_RECEBIDO.ID_PAINEL}, #${w.__progressoFila.CONFIG_PROGRESSO.ID_PAINEL}`
  );
  checar('só um painel flutuante nosso no DOM', naTela.length === 1, String(naTela.length));

  config.alternarPainel();
  checar('e o caminho inverso também vale', config.estaAberto() === true && progresso.estaAberto() === false);

  config.alternarPainel();
  checar('fechar o último não deixa nenhum na tela', config.estaAberto() === false && progresso.estaAberto() === false);
})();

// =====================================================================
// 3. TODO PAINEL DO PROJETO ESTÁ NO REGISTRO
// =====================================================================
// Conferência no CÓDIGO-FONTE, e não em tempo de execução, porque um painel
// novo pode simplesmente não ser carregado por este teste. Aqui a pergunta é
// outra: existe algum painel que abre em position:fixed e NÃO chama
// fecharOutrosPaineis? Se existir, o acúmulo na tela volta.
(function ninguemDeFora() {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'modulos');

  // Os painéis que participam do registro, por módulo.
  const esperado = {
    'modulo4-atalhos-teclado.js': ['novidades', 'ajuda'],
    'modulo9-painel-configuracoes.js': ['configuracoes'],
    'modulo10-recebido-na-semana.js': ['recebidoSemana'],
    'modulo11-progresso-fila.js': ['progressoFila'],
  };

  Object.entries(esperado).forEach(([arquivo, nomes]) => {
    const texto = fs.readFileSync(path.join(dir, arquivo), 'utf8');
    nomes.forEach((nome) => {
      checar(
        `${arquivo} registra o painel "${nome}"`,
        new RegExp(`registrarPainel\\?\\.\\('${nome}'`).test(texto) || new RegExp(`registrarPainel\\('${nome}'`).test(texto)
      );
      checar(
        `${arquivo} fecha os outros ao abrir "${nome}"`,
        new RegExp(`fecharOutrosPaineis\\?\\.\\('${nome}'`).test(texto) || new RegExp(`fecharOutrosPaineis\\('${nome}'`).test(texto)
      );
    });
  });

  // A contagem trava o esquecimento: painel novo sem entrada aqui quebra.
  //
  // O Módulo 0 fica de fora da varredura porque é ELE que define
  // registrarPainel -- a definição casava com o mesmo padrão das chamadas e
  // inflava a conta em 1. Contar quem define junto com quem chama foi erro
  // meu na primeira versão deste teste.
  const totalRegistros = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js') && !f.startsWith('modulo0-'))
    .reduce((soma, f) => soma + (fs.readFileSync(path.join(dir, f), 'utf8').match(/registrarPainel\??\.?\(/g) || []).length, 0);
  const totalEsperado = Object.values(esperado).flat().length;
  checar(
    'nenhum painel novo entrou sem passar pelo registro',
    totalRegistros === totalEsperado,
    `registros no código=${totalRegistros} declarados neste teste=${totalEsperado}`
  );
})();

resumo();
