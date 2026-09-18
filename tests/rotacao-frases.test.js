// Rotação de frases: variar sem soar aleatório.
//
// PROBLEMA MEDIDO antes desta mudança: 192 mensagens da matriz produziam 18
// distintas, e 83% terminavam na MESMA pergunta final. Com quase toda a
// carteira contatada diariamente, o mesmo cliente lia a mesma frase todo dia.
//
// AS TRÊS PROPRIEDADES, em ordem de gravidade:
//
//   1. ESTÁVEL DENTRO DO DIA. Apertar Alt+A duas vezes no mesmo cliente não
//      pode trocar a frase -- seria trocar o texto no meio de uma conversa em
//      andamento, e o cliente veria duas versões da mesma cobrança.
//   2. MUDA ENTRE DIAS. É o problema que motivou tudo.
//   3. MESMA FIRMEZA DENTRO DO PAPEL. Um CTA de último dia nunca pode virar
//      um CTA leve. É a única forma de a rotação causar dano de verdade.
//
// O que este arquivo NÃO trava: que a variante do dia seguinte seja SEMPRE
// diferente. A medição deu 0% de repetição em 368 pares, mas isso vem de o
// hash ser sensível ao último caractere da data, não de lógica desenhada
// para isso. Travar um número que ninguém projetou é fabricar uma garantia.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('rotacao-frases');

const SPECS = [
  { arquivo: 'modulo0-utilitarios-compartilhados.js' },
  { arquivo: 'modulo4-atalhos-teclado.js' },
];

const w = novaJanela({
  url: 'https://texhub.texcotton.com.br/crm/clientes/grupo/1?cnpj=11111111%2F0001-11',
  specs: SPECS,
});
const util = w.__smartTableUtil;
const FRASES = w.__atalhosDebug.FRASES;

// =====================================================================
// 1. O SORTEADOR
// =====================================================================
(function sorteador() {
  const opcoes = ['A', 'B', 'C', 'D'];

  checar('mesma semente, mesma escolha (100 chamadas)',
    new Set(Array.from({ length: 100 }, () => util.escolherVariante('x|2026-09-18', opcoes))).size === 1);

  checar('sementes diferentes espalham pelas opções',
    new Set(Array.from({ length: 200 }, (_, i) => util.escolherVariante(`c${i}|2026-09-18`, opcoes))).size === 4);

  checar('lista de um item devolve esse item', util.escolherVariante('x', ['única']) === 'única');
  checar('lista vazia devolve string vazia, não estoura', util.escolherVariante('x', []) === '');
  checar('não-array devolve string vazia', util.escolherVariante('x', null) === '');

  // Distribuição: com 4 opções e 92 clientes, nenhuma pode ficar órfã nem
  // levar quase tudo -- senão "rotação" é só um nome bonito.
  const cont = {};
  Array.from({ length: 92 }, (_, i) => util.escolherVariante(`1111${i}/0001-00|2026-09-18`, opcoes))
    .forEach((v) => { cont[v] = (cont[v] || 0) + 1; });
  const usos = opcoes.map((o) => cont[o] || 0);
  checar('todas as variantes são usadas em 92 clientes', usos.every((n) => n > 0), usos.join(', '));
  checar('e nenhuma domina (nenhuma passa de 50%)', usos.every((n) => n / 92 < 0.5), usos.join(', '));
})();

// =====================================================================
// 2. ESTÁVEL NO DIA, DIFERENTE ENTRE DIAS
// =====================================================================
(function estabilidade() {
  const cta = FRASES.ctaGenerico;
  const cliente = '11111111/0001-11';

  const mesmoDia = new Set(Array.from({ length: 50 }, () => util.escolherVariante(`${cliente}|2026-09-18`, cta)));
  checar('PROPRIEDADE 1: mesmo cliente + mesmo dia = frase idêntica, sempre', mesmoDia.size === 1);

  const aoLongoDeDuasSemanas = new Set(
    ['18', '19', '21', '22', '23', '24', '25', '26', '28', '29'].map((d) =>
      util.escolherVariante(`${cliente}|2026-09-${d}`, cta))
  );
  checar(
    'PROPRIEDADE 2: em 10 dias o cliente vê mais de uma frase',
    aoLongoDeDuasSemanas.size > 1,
    `${aoLongoDeDuasSemanas.size} variante(s) em 10 dias`
  );

  const noMesmoDia = new Set(
    Array.from({ length: 30 }, (_, i) => util.escolherVariante(`2222${i}/0001-00|2026-09-18`, cta))
  );
  checar('clientes diferentes no mesmo dia não recebem todos a mesma', noMesmoDia.size > 1, `${noMesmoDia.size}`);
})();

// =====================================================================
// 3. MESMA FIRMEZA DENTRO DO PAPEL — o risco real
// =====================================================================
// Se uma variante de estágio avançado escorregar para o tom do CTA genérico,
// a mensagem deixa de nomear a consequência real justamente onde ela importa.
(function firmeza() {
  checar('há mais de uma variante em cada papel que rotaciona',
    Object.values(FRASES).every((lista) => lista.length >= 2),
    Object.entries(FRASES).map(([k, v]) => `${k}=${v.length}`).join(' '));

  // Nenhum CTA escalado pode ser igual a um genérico.
  const genericos = new Set(FRASES.ctaGenerico);
  ['ctaUltimoDia', 'ctaCartorio', 'ctaSuspensaoScpc', 'ctaUltimoDiaScpc'].forEach((papel) => {
    checar(
      `nenhuma variante de ${papel} é igual a um CTA genérico`,
      FRASES[papel].every((f) => !genericos.has(f))
    );
  });

  // Todo CTA pede ação -- mensagem sem pedido é desabafo, não cobrança.
  //
  // CONTÉM pergunta, não TERMINA em pergunta: a primeira versão desta
  // asserção exigia terminar com "?", e reprovou uma variante escolhida pelo
  // usuário que põe o pedido no meio e fecha com o caminho de volta
  // ("Consegue fechar isso hoje? Confirmado o pagamento, já sinalizo a
  // baixa."). O invariante real é existir pedido de ação, não onde ele cai.
  Object.entries(FRASES).forEach(([papel, lista]) => {
    if (!papel.startsWith('cta')) return;
    checar(`toda variante de ${papel} pede uma ação (tem pergunta)`, lista.every((f) => f.includes('?')));
  });

  // Cada papel escalado nomeia a SUA consequência, e não a de outro estágio.
  checar('último dia fala de encaminhamento', FRASES.ctaUltimoDia.every((f) => /encaminhamento/i.test(f)));
  checar('cartório fala de baixa/sinalização, não de "evitar"', FRASES.ctaCartorio.every((f) => /baixa|sinaliz/i.test(f)));
  checar('suspensão SCPC fala de cadastro', FRASES.ctaSuspensaoScpc.every((f) => /cadastro/i.test(f)));

  // O PRAZO CRAVADO só pode existir no dia em que ele é verdade.
  //
  // Esta é a asserção mais importante do arquivo. A frase "até o fim do dia
  // o cadastro é suspenso" foi proposta para os dias 16-18 e MOVIDA para o
  // 19 -- nos dias 16 e 17 ela é falsa, o cliente ainda tem prazo. Dizer um
  // prazo que não se cumpre queima o aviso: da próxima vez ele já sabe que
  // não acontece nada.
  const prazoCravado = /at[ée] o fim do dia/i;
  checar(
    'NENHUMA variante de 16-18 dias crava "até o fim do dia" (seria falso)',
    FRASES.ctaSuspensaoScpc.every((f) => !prazoCravado.test(f)),
    FRASES.ctaSuspensaoScpc.filter((f) => prazoCravado.test(f)).join(' | ') || '(nenhuma)'
  );
  checar(
    'e o 19º dia tem a variante com prazo, onde ela é verdade',
    FRASES.ctaUltimoDiaScpc.some((f) => prazoCravado.test(f))
  );

  // Retomada: as variantes novas não afirmam nada sobre o cliente ter
  // respondido ou não -- a antiga afirma, e por isso não pode ser a única.
  const afirmamSemRetorno = FRASES.retomada.filter((f) => /n[ãa]o obtivemos retorno/i.test(f));
  checar(
    'a retomada tem variante que NÃO afirma que o cliente não retornou',
    afirmamSemRetorno.length < FRASES.retomada.length,
    `${afirmamSemRetorno.length} de ${FRASES.retomada.length} afirmam`
  );
  checar('e toda variante de retomada tem o lugar da referência de data',
    FRASES.retomada.every((f) => f.includes('{{referencia}}')));
})();

// =====================================================================
// 4. A ROTAÇÃO CHEGA NA MENSAGEM DE VERDADE
// =====================================================================
// As três seções acima testam a peça. Esta testa que ela está ligada: sem
// isto, FRASES poderia estar perfeita e o módulo continuar usando a string
// fixa antiga.
(function ligada() {
  const fs = require('fs');
  const path = require('path');
  const m4 = fs.readFileSync(path.join(__dirname, '..', 'modulos', 'modulo4-atalhos-teclado.js'), 'utf8');

  checar('o CTA genérico vem da rotação', /return frase\(FRASES\.ctaGenerico\)/.test(m4));
  checar('o de último dia também', /return frase\(FRASES\.ctaUltimoDia\)/.test(m4));
  checar('o de cartório também', /return frase\(FRASES\.ctaCartorio\)/.test(m4));
  checar('o de suspensão também', /return frase\(FRASES\.ctaSuspensaoScpc\)/.test(m4));
  checar('a retomada também', /frase\(FRASES\.retomada\)/.test(m4));

  checar(
    'nenhuma das frases antigas sobrou hard-coded fora da lista FRASES',
    (m4.match(/'Podemos agendar para hoje o pagamento do débito em aberto\?'/g) || []).length === 1,
    'deve aparecer só uma vez: dentro de FRASES.ctaGenerico'
  );

  checar('a semente usa o cnpj da página e o dia', /new URLSearchParams\(location\.search\)\.get\('cnpj'\)/.test(m4) && /util\.dataIso\(new Date\(\)\)/.test(m4));
})();

// =====================================================================
// 5. A ROTAÇÃO AVISA QUANDO PARA DE ROTACIONAR
// =====================================================================
// Sem cnpj na URL a semente vira só o dia, e TODOS os clientes recebem a
// mesma variante. A mensagem continua correta, então nada quebra na tela --
// e é por isso mesmo que precisa aparecer no console: a rotação morreria em
// silêncio no dia em que o CRM renomeasse o parâmetro da URL.
(function avisaQuandoPerdeOCnpj() {
  const semCnpj = novaJanela({
    url: 'https://texhub.texcotton.com.br/crm/clientes',
    specs: SPECS,
  });

  const avisos = [];
  const warnOriginal = console.warn;
  console.warn = (...args) => { avisos.push(args.join(' ')); };
  try {
    semCnpj.__atalhosDebug.sementeDaFrase();
    semCnpj.__atalhosDebug.sementeDaFrase();
    semCnpj.__atalhosDebug.sementeDaFrase();
  } finally {
    console.warn = warnOriginal;
  }

  const sobreRotacao = avisos.filter((a) => /variar as frases/i.test(a));
  checar('avisa quando não acha o cnpj pra variar', sobreRotacao.length > 0, avisos.join(' | ') || '(nenhum aviso)');
  checar(
    'e avisa UMA vez só, não uma por mensagem',
    sobreRotacao.length === 1,
    `${sobreRotacao.length} avisos em 3 chamadas`
  );

  // Mesmo sem cnpj, a frase escolhida continua sendo uma das válidas.
  const escolhida = semCnpj.__atalhosDebug.frase(semCnpj.__atalhosDebug.FRASES.ctaGenerico);
  checar('e a frase continua válida (degrada, não quebra)',
    semCnpj.__atalhosDebug.FRASES.ctaGenerico.includes(escolhida), escolhida);
})();

resumo();
