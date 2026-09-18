// Testes do "Entrou na semana" (Alt+D, Módulo 10) e do cálculo de semana
// sábado→sexta (Módulo 0).
//
// O QUE ESTE ARQUIVO PROTEGE:
//
//   1. OS DOIS ESQUEMAS DE IDENTIFICAÇÃO. A API devolve, na MESMA resposta,
//      "isaac.s" em depositos/acordos e "ISAAC.03876" em promessas/contatos.
//      Casar pelo identificador inteiro acharia a pessoa em metade das
//      seções e devolveria R$ 0,00 na outra metade -- sem erro na tela. As
//      fixturas abaixo reproduzem os dois formatos de propósito.
//
//   2. A SEMANA. Sábado a sexta, com o sábado sendo o PRIMEIRO dia da semana
//      nova. Uma borda errada aqui move dinheiro de uma semana pra outra.
//
//   3. AUSÊNCIA É ZERO, NÃO ERRO. Quem não teve movimento não aparece em
//      porUsuario (conferido ao vivo: as seções vêm com 7, 5, 4 e 6 linhas).
//
//   4. NÃO SOMAR AS DUAS MÉTRICAS. Depósitos e promessas cumpridas medem
//      origens diferentes e podem contar o mesmo pagamento. Somar Isaac com
//      Bianca é legítimo; somar depósito com promessa é chute.
const { novaJanela, textoDoModulo } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('recebido-semana');

const URL_CRM = 'https://texhub.texcotton.com.br/crm/clientes';
const SPECS = [
  { arquivo: 'modulo0-utilitarios-compartilhados.js' },
  { arquivo: 'modulo10-recebido-na-semana.js' },
];
const abrir = () => novaJanela({ url: URL_CRM, specs: SPECS });

// Resposta com a MESMA forma da real, incluindo os dois esquemas de usuário.
function respostaFalsa() {
  return {
    success: true,
    data: {
      inicio: '2026-09-12',
      fim: '2026-09-18',
      depositos: {
        valorTotal: 211649.52,
        porUsuario: [
          { usuario: 'isaac.s', nome: 'Isaac S.', quantidade: 12, valor: 80000.5 },
          { usuario: 'bianca.r', nome: 'Bianca R.', quantidade: 9, valor: 20000.25 },
          { usuario: 'outro.t', nome: 'Outro T.', quantidade: 3, valor: 111648.77 },
        ],
      },
      promessas: {
        cumpridoTotal: 232243.63,
        porUsuario: [
          // Esquema DIFERENTE na mesma resposta -- é o ponto do teste.
          { usuario: 'ISAAC.03876', nome: 'Isaac', quantidade: 20, prometido: 5, cumprido: 30000.1 },
          { usuario: 'BIANCA.03665', nome: 'Bianca', quantidade: 11, prometido: 5, cumprido: 10000.9 },
        ],
      },
    },
    timestamp: '2026-09-18T10:00:00.000000',
  };
}

/** Instala um fetch falso e devolve o registro das URLs pedidas. */
function fingirFetch(w, { corpo, status = 200, tipo = 'json', demorar = false } = {}) {
  const pedidos = [];
  w.fetch = function (url, opcoes) {
    pedidos.push({ url, opcoes });
    if (demorar) {
      return new Promise((_, rejeitar) => {
        opcoes?.signal?.addEventListener('abort', () => {
          const e = new Error('abortado');
          e.name = 'AbortError';
          rejeitar(e);
        });
      });
    }
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => (tipo === 'json' ? Promise.resolve(corpo) : Promise.reject(new Error('não é json'))),
    });
  };
  return pedidos;
}

// =====================================================================
// 1. A SEMANA SÁBADO → SEXTA
// =====================================================================
(function semana() {
  const w = abrir();
  const u = w.__smartTableUtil;

  // Semana de referência: sábado 12/09/2026 a sexta 18/09/2026. Cada dia
  // dessa semana tem que devolver exatamente esse par.
  const dias = [
    ['2026-09-12', 'sábado'],
    ['2026-09-13', 'domingo'],
    ['2026-09-14', 'segunda'],
    ['2026-09-15', 'terça'],
    ['2026-09-16', 'quarta'],
    ['2026-09-17', 'quinta'],
    ['2026-09-18', 'sexta'],
  ];
  dias.forEach(([iso, nome]) => {
    const [ano, mes, dia] = iso.split('-').map(Number);
    const s = u.semanaSabadoASexta(new Date(ano, mes - 1, dia, 12, 0, 0, 0));
    checar(
      `${nome} ${iso} cai na semana 12/09 a 18/09`,
      s.inicioIso === '2026-09-12' && s.fimIso === '2026-09-18',
      `${s.inicioIso} a ${s.fimIso}`
    );
  });

  // A borda que o usuário decidiu: sábado começa semana NOVA.
  const sabadoSeguinte = u.semanaSabadoASexta(new Date(2026, 8, 19, 12, 0, 0, 0));
  checar(
    'sábado 19/09 já é o PRIMEIRO dia da semana seguinte, não o último da anterior',
    sabadoSeguinte.inicioIso === '2026-09-19' && sabadoSeguinte.fimIso === '2026-09-25',
    `${sabadoSeguinte.inicioIso} a ${sabadoSeguinte.fimIso}`
  );

  // Viradas: mês e ano.
  const viradaMes = u.semanaSabadoASexta(new Date(2026, 9, 1, 12, 0, 0, 0)); // quinta 01/10
  checar('semana que cruza a virada do mês', viradaMes.inicioIso === '2026-09-26' && viradaMes.fimIso === '2026-10-02', `${viradaMes.inicioIso} a ${viradaMes.fimIso}`);

  const viradaAno = u.semanaSabadoASexta(new Date(2027, 0, 1, 12, 0, 0, 0)); // sexta 01/01/2027
  checar('semana que cruza a virada do ano', viradaAno.inicioIso === '2026-12-26' && viradaAno.fimIso === '2027-01-01', `${viradaAno.inicioIso} a ${viradaAno.fimIso}`);

  // A convenção de meio-dia do projeto tem que valer aqui também.
  const s = u.semanaSabadoASexta(new Date(2026, 8, 18, 12, 0, 0, 0));
  checar('as datas da semana saem ao MEIO-DIA (convenção do Módulo 0)', s.inicio.getHours() === 12 && s.fim.getHours() === 12, `${s.inicio.getHours()}h / ${s.fim.getHours()}h`);

  // dataIso NÃO pode usar toISOString: em fuso negativo, meio-dia local vira
  // o dia seguinte em UTC... e, pior, 00h local vira o dia ANTERIOR. Este
  // teste trava o formato campo-a-campo.
  checar('dataIso não desloca o dia', u.dataIso(new Date(2026, 0, 1, 12, 0, 0, 0)) === '2026-01-01', u.dataIso(new Date(2026, 0, 1, 12, 0, 0, 0)));
  checar('dataIso preenche mês e dia com zero à esquerda', u.dataIso(new Date(2026, 2, 5, 12, 0, 0, 0)) === '2026-03-05');

  // Este roda em OUTRO PROCESSO, com fuso positivo, porque é o único jeito
  // de provar a afirmação.
  //
  // CONFISSÃO ÚTIL: a primeira versão deste teste passava mesmo trocando a
  // implementação por toISOString(). Em Brasília (UTC-3), e com a convenção
  // de meio-dia, toISOString acerta -- então o teste não media nada. Em
  // UTC+9, um Date à meia-noite local vira o DIA ANTERIOR em UTC, e a
  // diferença aparece. Sem este processo filho, o comentário do Módulo 0
  // seria só uma opinião.
  (function fusoPositivo() {
    const { execFileSync } = require('child_process');
    const roteiro = `
      const { novaJanela } = require(${JSON.stringify(require.resolve('./helpers/dom-env'))});
      const w = novaJanela({ url: 'https://texhub.texcotton.com.br/crm/clientes',
        specs: [{ arquivo: 'modulo0-utilitarios-compartilhados.js' }] });
      const meiaNoite = new Date(2026, 0, 1, 0, 0, 0, 0);
      process.stdout.write(w.__smartTableUtil.dataIso(meiaNoite));
    `;
    let saida = '';
    try {
      saida = execFileSync(process.execPath, ['-e', roteiro], {
        encoding: 'utf8',
        env: { ...process.env, TZ: 'Asia/Tokyo' },
      }).trim();
    } catch (erro) {
      saida = `(o processo filho falhou: ${erro.message})`;
    }
    checar(
      'dataIso devolve o dia LOCAL mesmo em fuso positivo (onde toISOString erraria)',
      saida === '2026-01-01',
      `TZ=Asia/Tokyo, meia-noite de 01/01 -> "${saida}"`
    );
  })();
})();

// =====================================================================
// 2. OS DOIS ESQUEMAS DE IDENTIFICAÇÃO
// =====================================================================
(function identidade() {
  const w = abrir();
  const u = w.__smartTableUtil;

  checar('o código do CRM vira o primeiro nome', u.primeiroNomeDeUsuario('ISAAC.03876') === 'isaac');
  checar('o login nome.inicial vira o mesmo primeiro nome', u.primeiroNomeDeUsuario('isaac.s') === 'isaac');
  checar('OS DOIS ESQUEMAS SE ENCONTRAM', u.primeiroNomeDeUsuario('ISAAC.03876') === u.primeiroNomeDeUsuario('isaac.s'));
  checar('nome sem ponto também funciona', u.primeiroNomeDeUsuario('Bianca') === 'bianca');
  checar('nulo não estoura', u.primeiroNomeDeUsuario(null) === '' && u.primeiroNomeDeUsuario(undefined) === '');
  checar('espaço nas pontas não conta', u.primeiroNomeDeUsuario('  ISAAC.03876  ') === 'isaac');
})();

// =====================================================================
// 3. EXTRAÇÃO E SOMA
// =====================================================================
(function resumoDosNumeros() {
  const w = abrir();
  const api = w.__recebidoSemana;
  const dados = respostaFalsa().data;

  const dep = api.CONFIG_RECEBIDO.METRICAS.find((m) => m.chave === 'depositos');
  const prom = api.CONFIG_RECEBIDO.METRICAS.find((m) => m.chave === 'promessasCumpridas');

  // O caso que o bug silencioso produziria: achar em promessas e não em
  // depósitos (ou vice-versa) por causa do esquema diferente.
  checar('acha o Isaac em depósitos (esquema login)', api.valorDaPessoa(dados, dep, 'isaac').valor === 80000.5);
  checar('acha o Isaac em promessas (esquema código do CRM)', api.valorDaPessoa(dados, prom, 'isaac').valor === 30000.1);
  checar('acha a Bianca nos dois esquemas', api.valorDaPessoa(dados, dep, 'bianca').valor === 20000.25 && api.valorDaPessoa(dados, prom, 'bianca').valor === 10000.9);

  // Ausência.
  const semMovimento = api.valorDaPessoa(dados, dep, 'ninguem');
  checar('quem não aparece na seção vale ZERO, não erro', semMovimento.valor === 0);
  checar('e o painel sabe que foi por ausência, não por valor zerado', semMovimento.presente === false);
  checar('quem aparece é marcado como presente', api.valorDaPessoa(dados, dep, 'isaac').presente === true);

  // Seção inteira faltando na resposta.
  checar('seção ausente na resposta não estoura', api.valorDaPessoa({}, dep, 'isaac').valor === 0);
  // Campo com lixo em vez de número.
  const sujo = { depositos: { porUsuario: [{ usuario: 'isaac.s', valor: 'R$ 10,00' }] } };
  checar('valor não-numérico vira 0 em vez de NaN na tela', api.valorDaPessoa(sujo, dep, 'isaac').valor === 0);

  // A soma.
  const resultado = api.montarResumo(dados);
  const blocoDep = resultado.metricas.find((m) => m.chave === 'depositos');
  const blocoProm = resultado.metricas.find((m) => m.chave === 'promessasCumpridas');

  checar('soma Isaac + Bianca dentro de depósitos', Math.abs(blocoDep.total - 100000.75) < 0.001, String(blocoDep.total));
  checar('soma Isaac + Bianca dentro de promessas cumpridas', Math.abs(blocoProm.total - 40001) < 0.001, String(blocoProm.total));

  checar('o terceiro usuário da seção NÃO entra na conta', blocoDep.total !== dados.depositos.valorTotal);
  checar('o resumo tem exatamente as duas métricas configuradas', resultado.metricas.length === 2);

  // ===================================================================
  // TOTAL RECUPERADO = depósitos + promessas cumpridas
  // ===================================================================
  // ESTA ASSERÇÃO INVERTEU UMA ANTERIOR, e o porquê fica registrado em vez
  // de o histórico ter de ser garimpado: aqui havia um teste exigindo que
  // NENHUM total geral existisse, porque eu tinha me recusado a somar as
  // duas métricas -- nada na resposta da API prova que sejam conjuntos
  // disjuntos. O usuário, que conhece o negócio, definiu que são origens
  // diferentes (depósito = negociações, promessa cumprida = promessas da
  // cobrança) e pediu o total. Decisão dele, e ela vale mais que a minha
  // cautela. O que este arquivo protege agora é a ARITMÉTICA da soma.
  const isaacDep = 80000.5;
  const isaacProm = 30000.1;
  const biancaDep = 20000.25;
  const biancaProm = 10000.9;

  const totalIsaac = resultado.totalPorPessoa.find((p) => p.nome === 'isaac');
  const totalBianca = resultado.totalPorPessoa.find((p) => p.nome === 'bianca');

  checar('o total de cada pessoa soma as duas métricas dela', Math.abs(totalIsaac.valor - (isaacDep + isaacProm)) < 0.001, String(totalIsaac.valor));
  checar('e o mesmo vale pra segunda pessoa', Math.abs(totalBianca.valor - (biancaDep + biancaProm)) < 0.001, String(totalBianca.valor));
  checar(
    'o total geral soma as duas pessoas e as duas métricas',
    Math.abs(resultado.totalGeral - (isaacDep + isaacProm + biancaDep + biancaProm)) < 0.001,
    String(resultado.totalGeral)
  );
  checar(
    'o total geral também é a soma dos totais das duas métricas (as duas contas fecham)',
    Math.abs(resultado.totalGeral - (blocoDep.total + blocoProm.total)) < 0.001,
    `geral=${resultado.totalGeral} metricas=${blocoDep.total + blocoProm.total}`
  );
  checar('há um total por pessoa configurada, nem mais nem menos', resultado.totalPorPessoa.length === 2);

  // Quem não teve movimento entra no total como zero, não como NaN.
  const soZeros = api.montarResumo({});
  checar('sem dado nenhum, o total é 0 e não NaN', soZeros.totalGeral === 0, String(soZeros.totalGeral));
  checar('e cada pessoa também', soZeros.totalPorPessoa.every((p) => p.valor === 0));

  // AS PARCELAS CONTINUAM NA TELA. É o que permite conferir o total contra
  // as origens se ele um dia parecer alto demais -- a sobreposição entre as
  // duas métricas não é verificável por este endpoint.
  checar('as duas métricas seguem expostas separadamente, ao lado do total', blocoDep.total > 0 && blocoProm.total > 0);
})();

// =====================================================================
// 4. A BUSCA
// =====================================================================
(async function busca() {
  const w = abrir();
  const api = w.__recebidoSemana;

  const pedidos = fingirFetch(w, { corpo: respostaFalsa() });
  const dados = await api.buscarConsolidado('2026-09-12', '2026-09-18');
  checar('a busca devolve o campo data', dados?.depositos?.porUsuario?.length === 3);
  checar(
    'e pede o período certo na URL',
    pedidos[0].url === '/api/crm/dashboard-consolidado?inicio=2026-09-12&fim=2026-09-18',
    pedidos[0].url
  );
  checar('manda o cookie da sessão', pedidos[0].opcoes.credentials === 'same-origin');

  // Sessão expirada tem que virar instrução, não "403".
  fingirFetch(w, { status: 403 });
  let erro = null;
  try { await api.buscarConsolidado('2026-09-12', '2026-09-18'); } catch (e) { erro = e; }
  checar('403 vira mensagem sobre sessão, não código cru', /sess/i.test(erro?.message ?? ''), erro?.message);

  fingirFetch(w, { status: 500 });
  erro = null;
  try { await api.buscarConsolidado('2026-09-12', '2026-09-18'); } catch (e) { erro = e; }
  checar('500 é reportado com o código', /500/.test(erro?.message ?? ''), erro?.message);

  fingirFetch(w, { tipo: 'texto' });
  erro = null;
  try { await api.buscarConsolidado('2026-09-12', '2026-09-18'); } catch (e) { erro = e; }
  checar('resposta que não é JSON vira erro legível', /JSON/i.test(erro?.message ?? ''), erro?.message);

  fingirFetch(w, { corpo: { success: true } });
  erro = null;
  try { await api.buscarConsolidado('2026-09-12', '2026-09-18'); } catch (e) { erro = e; }
  checar('resposta sem "data" vira erro legível', /data/.test(erro?.message ?? ''), erro?.message);

  // Timeout: sem ele, o painel fica "Consultando..." pra sempre.
  api.CONFIG_RECEBIDO.TIMEOUT_MS = 40;
  fingirFetch(w, { demorar: true });
  erro = null;
  try { await api.buscarConsolidado('2026-09-12', '2026-09-18'); } catch (e) { erro = e; }
  checar('backend mudo é cortado por timeout, com mensagem', /não respondeu/i.test(erro?.message ?? ''), erro?.message);

  // =====================================================================
  // 5. O PAINEL
  // =====================================================================
  const w2 = abrir();
  const api2 = w2.__recebidoSemana;
  fingirFetch(w2, { corpo: respostaFalsa() });

  checar('o painel começa fechado', api2.estaAberto() === false);
  api2.alternarPainel();
  const el = w2.document.getElementById(api2.CONFIG_RECEBIDO.ID_PAINEL);
  checar('Alt+D abre o painel', api2.estaAberto() === true && el !== null);
  checar('o painel fica ABAIXO dos modais do CRM (z-index < 50)', Number(el.style.zIndex) < 50, `z-index=${el.style.zIndex}`);
  checar('mostra o período em português, marcando sábado e sexta', /\(sáb\).*\(sex\)/.test(el.textContent), el.textContent.slice(0, 80));

  await new Promise((r) => setTimeout(r, 20)); // deixa o fetch resolver
  checar('depois da resposta, mostra as duas métricas', el.textContent.includes('Depósitos') && el.textContent.includes('Promessas cumpridas'));
  checar('mostra os dois nomes', /Isaac/.test(el.textContent) && /Bianca/.test(el.textContent));
  checar('formata em reais', /R\$/.test(el.textContent), el.textContent.slice(0, 120));
  // O total tem que aparecer NA TELA, com a composição escrita ao lado --
  // um número grande sem dizer do que é feito envelhece mal.
  checar('mostra o Total recuperado', /Total recuperado/.test(el.textContent));
  checar(
    'e diz de que ele é feito, ali mesmo',
    /dep[óo]sitos \+ promessas cumpridas/i.test(el.textContent),
    el.textContent.slice(-160)
  );

  api2.alternarPainel();
  checar('Alt+D de novo fecha', api2.estaAberto() === false);

  api2.alternarPainel();
  w2.document.dispatchEvent(new w2.KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  checar('Esc fecha', api2.estaAberto() === false);

  // Falha da API tem que aparecer NA TELA, não só no console.
  const w3 = abrir();
  const api3 = w3.__recebidoSemana;
  fingirFetch(w3, { status: 403 });
  api3.alternarPainel();
  await new Promise((r) => setTimeout(r, 20));
  const el3 = w3.document.getElementById(api3.CONFIG_RECEBIDO.ID_PAINEL);
  checar('erro da API aparece no painel', /sess/i.test(el3.textContent), el3.textContent.slice(0, 120));
  checar('e o painel continua aberto pra você ler', api3.estaAberto() === true);

  // Fechar antes da resposta chegar não pode quebrar nada.
  const w4 = abrir();
  const api4 = w4.__recebidoSemana;
  fingirFetch(w4, { corpo: respostaFalsa() });
  api4.alternarPainel();
  api4.fecharPainel();
  let estourou = false;
  try { await new Promise((r) => setTimeout(r, 20)); } catch { estourou = true; }
  checar('fechar o painel antes da resposta não estoura', estourou === false && api4.estaAberto() === false);

  // =====================================================================
  // 6. O ATALHO
  // =====================================================================
  const texto = textoDoModulo('modulo4-atalhos-teclado.js');
  checar("o Módulo 4 declara TECLA_RECEBIDO_SEMANA: 'KeyD'", /TECLA_RECEBIDO_SEMANA:\s*'KeyD'/.test(texto));
  checar('e o switch trata essa tecla', /case CONFIG_ATALHOS\.TECLA_RECEBIDO_SEMANA:/.test(texto));
  checar('o painel de ajuda lista o Alt+D', /tecla: 'Alt\+D'/.test(texto));

  const teclas = [...texto.matchAll(/TECLA_\w+:\s*'(Key\w+)'/g)].map((m) => m[1]);
  checar(
    'nenhuma tecla de atalho está duplicada',
    new Set(teclas).size === teclas.length,
    teclas.filter((t, i) => teclas.indexOf(t) !== i).join(', ') || '(nenhuma)'
  );

  resumo();
})();
