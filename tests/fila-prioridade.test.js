// Testes da Fila por Prioridade (Módulo 7) -- portados de
// fila-prioridade/harness.js, rodando contra o código REAL de
// modulos/modulo7-fila-prioridade.js via window.filaPrioridadeDebug.
// Inclui, no final, o teste de regressão do BUG CRÍTICO achado pelo
// /code-reviewer: normalizarData() do Módulo 7 usava meia-noite
// (setHours(0,0,0,0)) enquanto Módulo 1/6 usam meio-dia, fazendo uma
// promessa datada pra HOJE ser tratada como "futura" por engano --
// corrigido consolidando os três num só (Módulo 0).
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('fila-prioridade');

const SPECS = [
  { arquivo: 'modulo0-utilitarios-compartilhados.js' },
  { arquivo: 'modulo3-fila-atendimento.js' },
  { arquivo: 'modulo7-fila-prioridade.js' },
];

function abrirLista(url, bodyHtml, clientesArray) {
  return novaJanela({ url, bodyHtml, clientes: clientesArray, specs: SPECS });
}

function linhaHtml({ grupoId, cnpj, dias }) {
  return `<tr>
    <td>
      <span>Controle: ${grupoId}</span><span>|</span><span>${cnpj}</span>
      <span>${dias} dias</span>
    </td>
  </tr>`;
}

function clienteJson({ cnpj, cluster, movimentacaoIso, diasAtraso }) {
  const obj = { cnpj, cluster: cluster || '', dataUltimaMovimentacao: movimentacaoIso || null };
  if (diasAtraso !== undefined) obj.diasAtraso = diasAtraso;
  return obj;
}

function hojeIso() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + 'T10:00:00.000000';
}

function registro(situacaoKey, diasAtrasoReal, extra) {
  return Object.assign({ situacaoKey, diasAtrasoReal, tituloCompleto: '90001/1', vencimentoTexto: '01/09/2026' }, extra || {});
}

// =====================================================================
// 1. Leitura da lista: cluster e data de movimentação extraídos certo
// =====================================================================
(function () {
  const html = `<table><tbody>${linhaHtml({ grupoId: 0, cnpj: '11111111/0001-11', dias: 19 })}</tbody></table>`;
  const clientes = [clienteJson({ cnpj: '11111111/0001-11', cluster: 'Normal', movimentacaoIso: '2026-09-10T08:00:00.000000' })];
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', html, clientes);

  const candidatos = w.filaPrioridadeDebug.candidatosEnriquecidos();
  checar('candidatosEnriquecidos encontra o cliente da linha', candidatos && candidatos.length === 1, JSON.stringify(candidatos));
  checar('lê o cluster certo de window.CLIENTES ("Normal")', candidatos[0].cluster === 'Normal', candidatos[0].cluster);
  checar('lê dataUltimaMovimentacao de window.CLIENTES (não mais adivinhado por posição)', candidatos[0].movimentacaoDataIso === '2026-09-10T08:00:00.000000', candidatos[0].movimentacaoDataIso);
  checar('dias de atraso lidos certo (19)', candidatos[0].diasAtraso === 19, candidatos[0].diasAtraso);
})();

(function () {
  const html = `<table><tbody>${linhaHtml({ grupoId: 0, cnpj: '99999999/0001-99', dias: 10 })}</tbody></table>`;
  const clientes = [clienteJson({ cnpj: '99999999/0001-99', cluster: 'Carteira', movimentacaoIso: '2026-08-19T10:00:00.000000' })];
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', html, clientes);
  const candidatos = w.filaPrioridadeDebug.candidatosEnriquecidos();
  checar('cluster "Carteira" (não mais confundido com situacaoCobrancaDescricao)', candidatos[0].cluster === 'Carteira', candidatos[0].cluster);
})();

(function () {
  const html = `<table><tbody>${linhaHtml({ grupoId: 0, cnpj: '88888888/0001-88', dias: 25 })}</tbody></table>`;
  const clientes = [clienteJson({ cnpj: '88888888/0001-88', cluster: 'Normal', movimentacaoIso: '2026-09-01T08:00:00.000000', diasAtraso: 8 })];
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', html, clientes);
  const candidatos = w.filaPrioridadeDebug.candidatosEnriquecidos();

  checar(
    'diasAtraso de window.CLIENTES (8) vence o valor extraído por regex da linha (25)',
    candidatos[0].diasAtraso === 8,
    `lido: ${candidatos[0].diasAtraso}`
  );

  const { sobreviventes, excluidos } = w.filaPrioridadeDebug.filtrarPorRegrasDaLista(candidatos);
  checar(
    'com o valor certo (8 dias), o cliente NÃO é excluído por ">19 dias" (o bug real excluía por engano)',
    sobreviventes.length === 1 && excluidos.dias === 0,
    JSON.stringify({ sobreviventes, excluidos })
  );
})();

(function () {
  const html = `<table><tbody>${linhaHtml({ grupoId: 0, cnpj: '77777777/0001-77', dias: 12 })}</tbody></table>`;
  const clientes = [{ cnpj: '77777777/0001-77', cluster: 'Normal' }];
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', html, clientes);
  const candidatos = w.filaPrioridadeDebug.candidatosEnriquecidos();
  checar('sem diasAtraso em window.CLIENTES, mantém o valor extraído por regex (12) como fallback', candidatos[0].diasAtraso === 12, candidatos[0].diasAtraso);
})();

// =====================================================================
// 2-5. Exclusões da fase de lista
// =====================================================================
(function () {
  const html = `<table><tbody>${linhaHtml({ grupoId: 0, cnpj: '22222222/0001-22', dias: 20 })}</tbody></table>`;
  const clientes = [clienteJson({ cnpj: '22222222/0001-22', cluster: 'Normal', movimentacaoIso: '2026-09-01T08:00:00.000000' })];
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', html, clientes);
  const candidatos = w.filaPrioridadeDebug.candidatosEnriquecidos();
  const { sobreviventes, excluidos } = w.filaPrioridadeDebug.filtrarPorRegrasDaLista(candidatos);
  checar('cliente com 20 dias de atraso é excluído', sobreviventes.length === 0 && excluidos.dias === 1, JSON.stringify({ sobreviventes, excluidos }));
})();

(function () {
  const html = `<table><tbody>${linhaHtml({ grupoId: 0, cnpj: '33333333/0001-33', dias: 1 })}</tbody></table>`;
  const clientes = [clienteJson({ cnpj: '33333333/0001-33', cluster: 'Normal', movimentacaoIso: '2026-09-01T08:00:00.000000' })];
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', html, clientes);
  const candidatos = w.filaPrioridadeDebug.candidatosEnriquecidos();
  const { sobreviventes, excluidos } = w.filaPrioridadeDebug.filtrarPorRegrasDaLista(candidatos);
  checar('cliente com 1 dia de atraso é excluído', sobreviventes.length === 0 && excluidos.diaUm === 1, JSON.stringify({ sobreviventes, excluidos }));
})();

(function () {
  const html = `<table><tbody>${linhaHtml({ grupoId: 0, cnpj: '44444444/0001-44', dias: 10 })}</tbody></table>`;
  const clientes = [clienteJson({ cnpj: '44444444/0001-44', cluster: 'Normal', movimentacaoIso: hojeIso() })];
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', html, clientes);
  const candidatos = w.filaPrioridadeDebug.candidatosEnriquecidos();
  const { sobreviventes, excluidos } = w.filaPrioridadeDebug.filtrarPorRegrasDaLista(candidatos);
  checar('cliente com movimentação hoje é excluído', sobreviventes.length === 0 && excluidos.movimentacaoHoje === 1, JSON.stringify({ sobreviventes, excluidos }));
})();

(function () {
  const html = `<table><tbody>${linhaHtml({ grupoId: 0, cnpj: '77777777/0001-77', dias: 10 })}</tbody></table>`;
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', html);
  let excecao = null;
  let candidatos;
  try {
    candidatos = w.filaPrioridadeDebug.candidatosEnriquecidos();
  } catch (e) {
    excecao = e;
  }
  checar('sem window.CLIENTES não lança exceção', excecao === null, excecao && excecao.message);
  checar('sem window.CLIENTES, cliente ainda aparece (cluster vazio, sem exclusão indevida)', candidatos && candidatos.length === 1 && candidatos[0].cluster === '' && candidatos[0].movimentacaoDataIso === null);
})();

(function () {
  const html = `<table><tbody>${linhaHtml({ grupoId: 0, cnpj: '55555555/0001-55', dias: 8 })}</tbody></table>`;
  const clientes = [clienteJson({ cnpj: '55555555/0001-55', cluster: 'Normal', movimentacaoIso: '2026-09-10T08:00:00.000000' })];
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', html, clientes);
  const candidatos = w.filaPrioridadeDebug.candidatosEnriquecidos();
  const { sobreviventes } = w.filaPrioridadeDebug.filtrarPorRegrasDaLista(candidatos);
  checar('cliente elegível (8 dias, sem exclusões) sobrevive ao filtro da lista', sobreviventes.length === 1);
})();

// =====================================================================
// 6. determinarPrioridade -- as 6 faixas, na ordem certa (waterfall)
// =====================================================================
(function () {
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', '<table><tbody></tbody></table>');
  const dp = w.filaPrioridadeDebug.determinarPrioridade;

  checar('P1: ULTIMO_DIA + Cartório', dp(registro('ULTIMO_DIA', 6), 'CARTORIO', 'Normal') === 1);
  checar('P2: Cluster Novo (mesmo em EM_ATRASO comum)', dp(registro('EM_ATRASO', 3), 'CARTORIO', 'Novo') === 2);
  checar('P2 vence sobre P3/P4 quando aplicável simultaneamente', dp(registro('ULTIMO_DIA', 6), 'SCPC', 'Novo') === 2, 'deveria ser 2, não 3, pois P2 vem antes de P3 na checagem');
  checar('P1 vence sobre P2 quando os dois se aplicam (Cartório+Novo)', dp(registro('ULTIMO_DIA', 6), 'CARTORIO', 'Novo') === 1, 'P1 é checado primeiro, deve vencer');
  checar('P3: ULTIMO_DIA + SCPC (sem cluster Novo)', dp(registro('ULTIMO_DIA', 6), 'SCPC', 'Normal') === 3);
  checar('P4: EM_ATRASO dia 2', dp(registro('EM_ATRASO', 2), 'CARTORIO', 'Normal') === 4);
  checar('P4: EM_ATRASO dia 3', dp(registro('EM_ATRASO', 3), 'CARTORIO', 'Normal') === 4);
  checar('P4: EM_ATRASO dia 4', dp(registro('EM_ATRASO', 4), 'CARTORIO', 'Normal') === 4);
  checar('P4 vale pros dois fluxos ("de ambos")', dp(registro('EM_ATRASO', 3), 'SCPC', 'Normal') === 4);
  checar('EM_ATRASO dia 5 NÃO é P4 (cai no resto -> P6)', dp(registro('EM_ATRASO', 5), 'CARTORIO', 'Normal') === 6);
  checar('P5: NEGATIVADO_SCPC dia 19 exato', dp(registro('NEGATIVADO_SCPC', 19), 'SCPC', 'Normal') === 5);
  checar('NEGATIVADO_SCPC dia 18 NÃO é P5 (cai no resto -> P6)', dp(registro('NEGATIVADO_SCPC', 18), 'SCPC', 'Normal') === 6);
  checar('NEGATIVADO_SCPC dia 10 NÃO é P5 (cai no resto -> P6)', dp(registro('NEGATIVADO_SCPC', 10), 'SCPC', 'Normal') === 6);
  checar('P6: EM_CARTORIO no meio do caminho (nenhuma faixa específica)', dp(registro('EM_CARTORIO', 12), 'CARTORIO', 'Normal') === 6);
  checar('P6: PRAZO_FINAL', dp(registro('PRAZO_FINAL', 6), 'CARTORIO', 'Normal') === 6);
  checar('cluster com espaços/maiúsculas ainda reconhece "Novo"', dp(registro('EM_ATRASO', 3), 'CARTORIO', '  NOVO  ') === 2);
})();

// =====================================================================
// 7. escolherTituloRepresentativo (agora vem do Módulo 0, exposto aqui
//    via window.filaPrioridadeDebug pra não quebrar os testes existentes)
// =====================================================================
(function () {
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', '<table><tbody></tbody></table>');
  const escolher = w.filaPrioridadeDebug.escolherTituloRepresentativo;

  checar('retorna null sem registros', escolher({ registros: [] }) === null);
  checar('escolhe o único título quando só tem um', escolher({ registros: [registro('EM_ATRASO', 3)] }).diasAtrasoReal === 3);

  const comUltimoDia = escolher({
    registros: [registro('EM_CARTORIO', 30), registro('ULTIMO_DIA', 6), registro('EM_ATRASO', 3)],
  });
  checar('ULTIMO_DIA sempre vence, mesmo com outro em cartório há mais tempo', comUltimoDia.situacaoKey === 'ULTIMO_DIA', JSON.stringify(comUltimoDia));

  // CONFIRMADO com o usuário: título já EM_CARTORIO saiu da cobrança
  // amigável -- entre o que sobra, título fora de cartório sempre tem
  // prioridade de pagamento sobre título em cartório, mesmo com menos
  // dias de atraso. Por isso PRAZO_FINAL(6) vence EM_CARTORIO(30) aqui,
  // mesmo o cartório tendo muito mais dias.
  const semUltimoDia = escolher({
    registros: [registro('EM_ATRASO', 3), registro('EM_CARTORIO', 30), registro('PRAZO_FINAL', 6)],
  });
  checar(
    'sem ULTIMO_DIA, escolhe o de maior atraso real ENTRE OS FORA DE CARTÓRIO (PRAZO_FINAL 6, não EM_CARTORIO 30)',
    semUltimoDia.situacaoKey === 'PRAZO_FINAL' && semUltimoDia.diasAtrasoReal === 6,
    JSON.stringify(semUltimoDia)
  );

  // BUG REAL (relatado pelo usuário): antes, EM_CARTORIO competia em pé de
  // igualdade com títulos fora de cartório só pelo número de dias --
  // título em cartório há 45 dias vencia um título em atraso inicial há
  // apenas 3 dias, quando a prioridade de pagamento (e por isso o pedido
  // da mensagem) deveria mirar o que ainda dá pra evitar.
  const cartorioComMuitoMaisDias = escolher({
    registros: [registro('EM_CARTORIO', 45), registro('EM_ATRASO', 3)],
  });
  checar(
    'EM_CARTORIO com MUITO mais dias (45) NÃO vence título fora de cartório com poucos dias (3)',
    cartorioComMuitoMaisDias.situacaoKey === 'EM_ATRASO' && cartorioComMuitoMaisDias.diasAtrasoReal === 3,
    JSON.stringify(cartorioComMuitoMaisDias)
  );

  // Defensivo: se TODOS os títulos já estão em cartório (caso raro -- um
  // cliente assim nem deveria chegar até aqui, ver avisarSeNaoCobrar no
  // Módulo 1), ainda escolhe um título válido em vez de travar.
  const tudoEmCartorio = escolher({
    registros: [registro('EM_CARTORIO', 10), registro('EM_CARTORIO', 30)],
  });
  checar(
    'com TODOS os títulos em cartório, ainda escolhe o de maior atraso entre eles (defensivo)',
    tudoEmCartorio.situacaoKey === 'EM_CARTORIO' && tudoEmCartorio.diasAtrasoReal === 30,
    JSON.stringify(tudoEmCartorio)
  );

  [16, 17, 18, 19].forEach((dias) => {
    const comAvisoScpc = escolher({
      registros: [registro('EM_CARTORIO', 45), registro('NEGATIVADO_SCPC', dias)],
    });
    checar(
      `janela de aviso SCPC (dia ${dias}) vence sobre EM_CARTORIO mais atrasado (45 dias)`,
      comAvisoScpc.situacaoKey === 'NEGATIVADO_SCPC' && comAvisoScpc.diasAtrasoReal === dias,
      JSON.stringify(comAvisoScpc)
    );
  });

  const ultimoDiaVsAvisoScpc = escolher({
    registros: [registro('NEGATIVADO_SCPC', 19), registro('ULTIMO_DIA', 6)],
  });
  checar(
    'ULTIMO_DIA continua vencendo mesmo com NEGATIVADO_SCPC dia 19 no mesmo cliente',
    ultimoDiaVsAvisoScpc.situacaoKey === 'ULTIMO_DIA',
    JSON.stringify(ultimoDiaVsAvisoScpc)
  );

  // Fora da janela de aviso SCPC (dia 25), o critério cai pro "maior atraso
  // real entre os fora de cartório" -- NEGATIVADO_SCPC (25, fora de
  // cartório) vence EM_CARTORIO (45), mesmo tendo menos dias, pela mesma
  // regra de prioridade de pagamento confirmada pelo usuário.
  const foraDaJanela = escolher({
    registros: [registro('EM_CARTORIO', 45), registro('NEGATIVADO_SCPC', 25)],
  });
  checar(
    'fora da janela de aviso SCPC (dia 25), NEGATIVADO_SCPC (fora de cartório) vence EM_CARTORIO (45, em cartório)',
    foraDaJanela.situacaoKey === 'NEGATIVADO_SCPC' && foraDaJanela.diasAtrasoReal === 25,
    JSON.stringify(foraDaJanela)
  );
})();

(function () {
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', '<table><tbody></tbody></table>');
  const escolher = w.filaPrioridadeDebug.escolherTituloRepresentativo;
  const dp = w.filaPrioridadeDebug.determinarPrioridade;

  const dados = { registros: [registro('EM_CARTORIO', 45), registro('NEGATIVADO_SCPC', 19)] };
  const escolhido = escolher(dados);
  const prioridade = dp(escolhido, 'SCPC', 'Normal');
  checar(
    'cliente com SCPC dia 19 + EM_CARTORIO 45 dias cai na prioridade 5 (não na 6)',
    prioridade === 5,
    `prioridade=${prioridade}, escolhido=${JSON.stringify(escolhido)}`
  );
})();

// Consequência esperada da regra de prioridade de pagamento (confirmada
// pelo usuário) na Fila por Prioridade: cliente com um título velho em
// EM_CARTORIO (45 dias) MAIS um título fresco em EM_ATRASO (3 dias, ainda
// evitável) agora cai na prioridade 4 (atraso inicial), não na 6 -- porque
// escolherTituloRepresentativo passa a escolher o título fora de cartório
// como representante, e é ele que decide a prioridade.
(function () {
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', '<table><tbody></tbody></table>');
  const escolher = w.filaPrioridadeDebug.escolherTituloRepresentativo;
  const dp = w.filaPrioridadeDebug.determinarPrioridade;

  const dados = { registros: [registro('EM_CARTORIO', 45), registro('EM_ATRASO', 3)] };
  const escolhido = escolher(dados);
  const prioridade = dp(escolhido, 'CARTORIO', 'Normal');
  checar(
    'cliente com EM_CARTORIO 45 dias + EM_ATRASO 3 dias cai na prioridade 4 (não na 6)',
    prioridade === 4,
    `prioridade=${prioridade}, escolhido=${JSON.stringify(escolhido)}`
  );
})();

// =====================================================================
// 7b. filtrarPorGrupoEconomico -- PEDIDO DO USUÁRIO: "um cliente já foi
// contatado em outra razão do mesmo grupo... é válido inserir na lista do
// Alt+U apenas um do grupo social. Quando haver mais de um no grupo social
// com títulos em aberto, não inserir o restante na lista". Fonte de
// verdade é window.__alertaGrupo (lido pelo Módulo 5 na aba "Grupo" de
// verdade) -- NÃO o grupoId da lista, confirmado ao vivo que é outro campo
// sem relação com grupo econômico.
// =====================================================================
function empresaGrupo(cnpj, overrides) {
  return Object.assign({ cnpj, razaoSocial: 'X', vencido: 'R$ 1,00', url: 'https://x' }, overrides || {});
}

function resultadoFake({ cnpj, prioridade, dias, empresasComVencido }) {
  return {
    cliente: { cnpj, url: `https://x/${cnpj}`, label: cnpj },
    escolhido: { diasAtrasoReal: dias },
    fluxo: 'CARTORIO',
    prioridade,
    empresasComVencido: empresasComVencido || [],
  };
}

(function () {
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', '<table><tbody></tbody></table>');
  const filtrar = w.filaPrioridadeDebug.filtrarPorGrupoEconomico;

  // Referência cruzada simétrica -- A lista B como vencido e B lista A.
  const a = resultadoFake({ cnpj: '11111111/0001-11', prioridade: 4, dias: 3, empresasComVencido: [empresaGrupo('22222222/0001-22')] });
  const b = resultadoFake({ cnpj: '22222222/0001-22', prioridade: 1, dias: 6, empresasComVencido: [empresaGrupo('11111111/0001-11')] });
  const { sobreviventes, excluidosPorGrupo } = filtrar([a, b]);
  checar('cluster de 2 do mesmo grupo -- só 1 sobrevive', sobreviventes.length === 1, JSON.stringify(sobreviventes));
  checar('sobrevivente é o mais urgente (prioridade 1, não 4)', sobreviventes[0].cliente.cnpj === '22222222/0001-22', JSON.stringify(sobreviventes));
  checar('contador de excluídos por grupo bate (1)', excluidosPorGrupo === 1, excluidosPorGrupo);
})();

(function () {
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', '<table><tbody></tbody></table>');
  const filtrar = w.filaPrioridadeDebug.filtrarPorGrupoEconomico;

  // Referência ASSIMÉTRICA -- só A lista B (B não lista A de volta, ex.:
  // tabela "Clientes do grupo" não veio simétrica) -- ainda assim precisa
  // agrupar, já que a informação existe de UM dos lados.
  const a = resultadoFake({ cnpj: '33333333/0001-33', prioridade: 6, dias: 8, empresasComVencido: [empresaGrupo('44444444/0001-44')] });
  const b = resultadoFake({ cnpj: '44444444/0001-44', prioridade: 6, dias: 15, empresasComVencido: [] });
  const { sobreviventes } = filtrar([a, b]);
  checar('referência assimétrica ainda agrupa (1 sobrevivente)', sobreviventes.length === 1, JSON.stringify(sobreviventes));
  checar('empate de prioridade -- desempata por mais dias de atraso (44444444, 15 dias)', sobreviventes[0].cliente.cnpj === '44444444/0001-44', JSON.stringify(sobreviventes));
})();

(function () {
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', '<table><tbody></tbody></table>');
  const filtrar = w.filaPrioridadeDebug.filtrarPorGrupoEconomico;

  // Sem nenhuma referência cruzada -- candidatos não relacionados, ambos
  // sobrevivem (o bug que quase foi implementado por engano: agrupar por
  // um campo que NÃO é grupo econômico teria juntado gente sem relação).
  const a = resultadoFake({ cnpj: '55555555/0001-55', prioridade: 4, dias: 3 });
  const b = resultadoFake({ cnpj: '66666666/0001-66', prioridade: 4, dias: 3 });
  const { sobreviventes, excluidosPorGrupo } = filtrar([a, b]);
  checar('candidatos sem relação de grupo -- os dois sobrevivem', sobreviventes.length === 2, JSON.stringify(sobreviventes));
  checar('nenhum excluído por grupo quando não há relação nenhuma', excluidosPorGrupo === 0, excluidosPorGrupo);
})();

(function () {
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', '<table><tbody></tbody></table>');
  const filtrar = w.filaPrioridadeDebug.filtrarPorGrupoEconomico;

  // Cluster de 3 -- só o mais urgente sobrevive, os outros 2 saem.
  const a = resultadoFake({ cnpj: '77777777/0001-77', prioridade: 3, dias: 6, empresasComVencido: [empresaGrupo('88888888/0001-88'), empresaGrupo('99999999/0001-99')] });
  const b = resultadoFake({ cnpj: '88888888/0001-88', prioridade: 5, dias: 19 });
  const c = resultadoFake({ cnpj: '99999999/0001-99', prioridade: 6, dias: 10 });
  const { sobreviventes, excluidosPorGrupo } = filtrar([a, b, c]);
  checar('cluster de 3 -- só 1 sobrevive', sobreviventes.length === 1, JSON.stringify(sobreviventes));
  checar('sobrevivente é o de prioridade mais urgente (tier 3)', sobreviventes[0].cliente.cnpj === '77777777/0001-77', JSON.stringify(sobreviventes));
  checar('2 excluídos por grupo', excluidosPorGrupo === 2, excluidosPorGrupo);
})();

(function () {
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', '<table><tbody></tbody></table>');
  const filtrar = w.filaPrioridadeDebug.filtrarPorGrupoEconomico;

  // Defensivo: empresasComVencido undefined (Módulo 5 pode não ter rodado
  // por algum motivo) não pode travar nem juntar por engano.
  const a = { cliente: { cnpj: '10101010/0001-10' }, escolhido: { diasAtrasoReal: 3 }, prioridade: 4 };
  let excecao = null;
  let resultado;
  try {
    resultado = filtrar([a]);
  } catch (e) {
    excecao = e;
  }
  checar('empresasComVencido ausente não lança exceção', excecao === null, excecao && excecao.message);
  checar('candidato único sem dado de grupo sobrevive normalmente', resultado && resultado.sobreviventes.length === 1);
})();

// =====================================================================
// 8-10. Herdados do Módulo 3 + integração com o schema da fila
// =====================================================================
(function () {
  const html = `<table><tbody>
    ${linhaHtml({ grupoId: 0, cnpj: '66666666/0001-66', dias: 5 })}
    ${linhaHtml({ grupoId: 0, cnpj: '66666666/0002-47', dias: 15 })}
  </tbody></table>`;
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', html);
  const candidatos = w.filaPrioridadeDebug.candidatosEnriquecidos();
  checar('matriz/filial (mesma raiz) continuam unificadas em 1 só', candidatos.length === 1, JSON.stringify(candidatos));
  checar('mantém a filial mais atrasada (15 dias)', candidatos[0].diasAtraso === 15);
})();

(function () {
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', '<table><tbody></tbody></table>');
  checar('window.filaDebug.CONFIG.VERSAO_SCHEMA está exposto', typeof w.filaDebug.CONFIG.VERSAO_SCHEMA === 'number', w.filaDebug.CONFIG);
  checar('window.filaDebug.salvarFila está exposto', typeof w.filaDebug.salvarFila === 'function');
})();

(function () {
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', '<table><tbody></tbody></table>');
  const fila = {
    versao: w.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: [
      { url: 'https://x/a', cnpj: 'A', label: 'Cliente A', diasAtraso: 6, prioridadeTier: 1, prioridadeNome: 'Cartório — último dia' },
      { url: 'https://x/b', cnpj: 'B', label: 'Cliente B', diasAtraso: 3, prioridadeTier: 4, prioridadeNome: 'Atraso inicial (2º–4º dia)' },
    ],
    indiceAtual: -1,
    totalAtendidos: 0,
    totalPulados: 0,
    iniciadoEm: Date.now(),
  };
  w.filaDebug.salvarFila(fila);
  const lida = w.filaDebug.obterFila();
  checar('fila montada pelo Módulo 7 é aceita de volta por obterFila (schema bate)', lida !== null, lida);
  checar('campos de prioridade sobrevivem ao round-trip pelo localStorage', lida && lida.clientes[0].prioridadeTier === 1 && lida.clientes[1].prioridadeNome === 'Atraso inicial (2º–4º dia)');
})();

// =====================================================================
// 11-13. Assíncronos -- encadeados (await), nunca em paralelo: novaJanela()
// reatribui global.window/document/localStorage (necessário porque
// window.eval() roda no escopo global do Node, não isolado por janela).
// =====================================================================
const promessa11 = (function () {
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes/grupo/0?cnpj=B', '<div>tela do cliente B</div>');
  const fila = {
    versao: w.filaDebug.CONFIG.VERSAO_SCHEMA,
    clientes: [
      { url: 'https://x/a', cnpj: 'A', label: 'A', diasAtraso: 6, prioridadeTier: 1, prioridadeNome: 'Cartório — último dia' },
      { url: 'https://x/b', cnpj: 'B', label: 'B', diasAtraso: 3, prioridadeTier: 4, prioridadeNome: 'Atraso inicial (2º–4º dia)' },
    ],
    indiceAtual: 1,
    totalAtendidos: 1,
    totalPulados: 0,
    iniciadoEm: Date.now(),
  };
  w.filaDebug.salvarFila(fila);

  return new Promise((resolve) => {
    setTimeout(() => {
      const toasts = Array.from(w.document.body.querySelectorAll('div')).filter((el) => /prioridade/i.test(el.textContent || ''));
      checar('toast de troca de prioridade aparece ao entrar em faixa diferente', toasts.length > 0, w.document.body.innerHTML);

      // PEDIDO DO USUÁRIO: toast mais aparente -- borda de destaque
      // colorida por prioridade (tier 4 = âmbar #B45309, ver
      // CORES_PRIORIDADE) e texto estruturado em rótulo + nome.
      const toastPrincipal = toasts.find((el) => el.style.borderLeft);
      checar('toast de troca tem borda de destaque colorida (mais aparente)', !!toastPrincipal, w.document.body.innerHTML);
      // jsdom normaliza cores hex pra rgb() -- #B45309 = rgb(180, 83, 9).
      checar('borda usa a cor certa pra prioridade 4 (âmbar)', toastPrincipal && toastPrincipal.style.borderLeft.includes('180, 83, 9'), toastPrincipal && toastPrincipal.style.borderLeft);
      checar('toast menciona o número da prioridade e o nome da faixa', toastPrincipal && /prioridade 4/i.test(toastPrincipal.textContent) && /atraso inicial/i.test(toastPrincipal.textContent), toastPrincipal && toastPrincipal.textContent);
      resolve();
    }, 20);
  });
})();

const promessa12 = promessa11.then(async function () {
  const linhas = Array.from({ length: 10 }, (_, i) =>
    linhaHtml({ grupoId: 0, cnpj: `9${i}999999/0001-${String(10 + i).padStart(2, '0')}`, dias: 8 })
  ).join('');
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', `<table><tbody>${linhas}</tbody></table>`);

  let chamadasWindowOpen = 0;
  w.open = () => {
    chamadasWindowOpen++;
    return null;
  };

  await w.filaPrioridadeDebug.iniciar();

  checar(
    'disjuntor para no 3º pop-up bloqueado seguido, não varre os 10 candidatos',
    chamadasWindowOpen === 3,
    `window.open foi chamado ${chamadasWindowOpen}x (esperado: 3)`
  );

  const filaSalva = w.filaDebug.obterFila();
  checar('nenhuma fila é salva quando o disjuntor para tudo cedo', filaSalva === null, filaSalva);

  const avisoBloqueio = Array.from(w.document.body.querySelectorAll('div')).some((el) => /bloqueando|pop-up/i.test(el.textContent || ''));
  checar('mostra um aviso claro sobre pop-up bloqueado', avisoBloqueio);
});

const promessa13 = promessa12.then(async function () {
  const linhas = [
    linhaHtml({ grupoId: 0, cnpj: '11111111/0001-11', dias: 8 }),
    linhaHtml({ grupoId: 0, cnpj: '22222222/0001-22', dias: 8 }),
  ].join('');
  const clientesArray = [
    clienteJson({ cnpj: '11111111/0001-11', cluster: 'Normal', movimentacaoIso: '2026-09-01T08:00:00.000000', diasAtraso: 8 }),
    clienteJson({ cnpj: '22222222/0001-22', cluster: 'Normal', movimentacaoIso: '2026-09-01T08:00:00.000000', diasAtraso: 8 }),
  ];
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', `<table><tbody>${linhas}</tbody></table>`, clientesArray);

  w.open = (url) => {
    const cnpjNaUrl = decodeURIComponent(url.split('cnpj=')[1] || '');
    const temNaoCobrar = cnpjNaUrl === '11111111/0001-11';
    return {
      closed: false,
      close() { this.closed = true; },
      __avisoCobranca: {
        simular: () => ({
          fluxo: 'CARTORIO',
          registros: temNaoCobrar ? [] : [{ situacaoKey: 'EM_ATRASO', diasAtrasoReal: 8, tituloCompleto: '1/1', vencimentoTexto: '01/09/2026' }],
          naoCobrar: temNaoCobrar ? [{ tituloCompleto: '1/1', posicao: 'CARTEIRA' }] : [],
        }),
      },
      __contextoAdicional: {},
      __contextoAdicionalDebug: { lerPromessas: () => [] },
      __alertaGrupo: { empresasComVencido: [] },
    };
  };

  await w.filaPrioridadeDebug.iniciar();

  const filaSalva = w.filaDebug.obterFila();
  checar('fila é montada (cliente normal passou)', filaSalva !== null && filaSalva.clientes.length === 1, JSON.stringify(filaSalva));
  checar(
    'cliente com "não cobrar" fica de fora da fila, mesmo com outro cliente normal presente',
    filaSalva && filaSalva.clientes.every((c) => c.cnpj !== '11111111/0001-11'),
    filaSalva && JSON.stringify(filaSalva.clientes)
  );
  checar(
    'cliente normal (sem não cobrar) entra normalmente',
    filaSalva && filaSalva.clientes.some((c) => c.cnpj === '22222222/0001-22')
  );
});

// =====================================================================
// 14. REGRESSÃO DO BUG CRÍTICO (achado pelo /code-reviewer): promessa
// datada pra HOJE não pode ser tratada como "futura". Antes da
// consolidação, normalizarData() do Módulo 7 usava meia-noite
// (setHours(0,0,0,0)) enquanto a data da promessa (produzida pelo Módulo 6
// via converterDataBr, que usa meio-dia) ficava, em milissegundos, DEPOIS
// de "hoje" -- excluindo por engano um cliente com promessa pra hoje.
// =====================================================================
const promessa14 = promessa13.then(async function () {
  const html = `<table><tbody>${linhaHtml({ grupoId: 0, cnpj: '55555555/0001-99', dias: 8 })}</tbody></table>`;
  const clientesArray = [clienteJson({ cnpj: '55555555/0001-99', cluster: 'Normal', movimentacaoIso: '2026-09-01T08:00:00.000000', diasAtraso: 8 })];
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', html, clientesArray);

  // Mesma convenção que o Módulo 6 usa de verdade pra "hoje" (meio-dia) --
  // ver window.__smartTableUtil.normalizarData no Módulo 0.
  const hojeMeioDia = new Date();
  hojeMeioDia.setHours(12, 0, 0, 0);

  w.open = () => ({
    closed: false,
    close() { this.closed = true; },
    __avisoCobranca: {
      simular: () => ({
        fluxo: 'CARTORIO',
        registros: [{ situacaoKey: 'EM_ATRASO', diasAtrasoReal: 8, tituloCompleto: '1/1', vencimentoTexto: '01/09/2026' }],
        naoCobrar: [],
      }),
    },
    __contextoAdicional: {},
    __contextoAdicionalDebug: { lerPromessas: () => [{ status: 'PENDENTE', dataPrometida: hojeMeioDia, titulos: ['1/1'] }] },
    __alertaGrupo: { empresasComVencido: [] },
  });

  await w.filaPrioridadeDebug.iniciar();

  const filaSalva = w.filaDebug.obterFila();
  checar(
    'BUG CRÍTICO CORRIGIDO: promessa datada pra HOJE não exclui o cliente por "promessa futura"',
    filaSalva !== null && filaSalva.clientes.length === 1 && filaSalva.clientes[0].cnpj === '55555555/0001-99',
    filaSalva && JSON.stringify(filaSalva)
  );
});

// Sanity check: promessa claramente no futuro (amanhã) continua excluindo
// normalmente -- a correção não pode ter "desligado" a exclusão inteira.
const promessa15 = promessa14.then(async function () {
  const html = `<table><tbody>${linhaHtml({ grupoId: 0, cnpj: '55555555/0001-88', dias: 8 })}</tbody></table>`;
  const clientesArray = [clienteJson({ cnpj: '55555555/0001-88', cluster: 'Normal', movimentacaoIso: '2026-09-01T08:00:00.000000', diasAtraso: 8 })];
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', html, clientesArray);

  const amanhaMeioDia = new Date();
  amanhaMeioDia.setDate(amanhaMeioDia.getDate() + 1);
  amanhaMeioDia.setHours(12, 0, 0, 0);

  w.open = () => ({
    closed: false,
    close() { this.closed = true; },
    __avisoCobranca: {
      simular: () => ({
        fluxo: 'CARTORIO',
        registros: [{ situacaoKey: 'EM_ATRASO', diasAtrasoReal: 8, tituloCompleto: '1/1', vencimentoTexto: '01/09/2026' }],
        naoCobrar: [],
      }),
    },
    __contextoAdicional: {},
    __contextoAdicionalDebug: { lerPromessas: () => [{ status: 'PENDENTE', dataPrometida: amanhaMeioDia, titulos: ['1/1'] }] },
    __alertaGrupo: { empresasComVencido: [] },
  });

  await w.filaPrioridadeDebug.iniciar();

  const filaSalva = w.filaDebug.obterFila();
  checar(
    'promessa claramente no futuro (amanhã) continua excluindo o cliente normalmente',
    filaSalva === null || filaSalva.clientes.every((c) => c.cnpj !== '55555555/0001-88'),
    filaSalva && JSON.stringify(filaSalva)
  );
});

// =====================================================================
// 16. INTEGRAÇÃO PONTA A PONTA: dois candidatos do MESMO grupo econômico
// (window.__alertaGrupo cruzado entre as duas abas de fundo) -- só o mais
// urgente entra na fila final salva, o outro é excluído e contado.
// =====================================================================
const promessa16 = promessa15.then(async function () {
  const cnpjUrgente = '20202020/0001-20'; // ULTIMO_DIA + Cartório -> prioridade 1
  const cnpjMenosUrgente = '30303030/0001-30'; // EM_ATRASO dia 3 -> prioridade 4
  const html = [
    linhaHtml({ grupoId: 0, cnpj: cnpjUrgente, dias: 6 }),
    linhaHtml({ grupoId: 0, cnpj: cnpjMenosUrgente, dias: 3 }),
  ].join('');
  const clientesArray = [
    clienteJson({ cnpj: cnpjUrgente, cluster: 'Normal', movimentacaoIso: '2026-09-01T08:00:00.000000', diasAtraso: 6 }),
    clienteJson({ cnpj: cnpjMenosUrgente, cluster: 'Normal', movimentacaoIso: '2026-09-01T08:00:00.000000', diasAtraso: 3 }),
  ];
  const w = abrirLista('https://texhub.texcotton.com.br/crm/clientes', `<table><tbody>${html}</tbody></table>`, clientesArray);

  w.open = (url) => {
    const cnpjNaUrl = decodeURIComponent(url.split('cnpj=')[1] || '');
    const ehUrgente = cnpjNaUrl === cnpjUrgente;
    return {
      closed: false,
      close() { this.closed = true; },
      __avisoCobranca: {
        simular: () => ({
          fluxo: 'CARTORIO',
          registros: [ehUrgente
            ? { situacaoKey: 'ULTIMO_DIA', diasAtrasoReal: 6, tituloCompleto: '1/1', vencimentoTexto: '01/09/2026' }
            : { situacaoKey: 'EM_ATRASO', diasAtrasoReal: 3, tituloCompleto: '2/1', vencimentoTexto: '01/09/2026' }],
          naoCobrar: [],
        }),
      },
      __contextoAdicional: {},
      __contextoAdicionalDebug: { lerPromessas: () => [] },
      // As duas abas se reconhecem como do mesmo grupo econômico (mesma
      // fonte que o Módulo 5 exporia na vida real, lendo a aba "Grupo").
      __alertaGrupo: {
        empresasComVencido: ehUrgente
          ? [empresaGrupo(cnpjMenosUrgente)]
          : [empresaGrupo(cnpjUrgente)],
      },
    };
  };

  await w.filaPrioridadeDebug.iniciar();

  const filaSalva = w.filaDebug.obterFila();
  checar(
    'fila final tem só 1 cliente (o outro é do mesmo grupo, já seria cobrado por tabela)',
    filaSalva !== null && filaSalva.clientes.length === 1,
    filaSalva && JSON.stringify(filaSalva.clientes)
  );
  checar(
    'o sobrevivente é o mais urgente (ULTIMO_DIA+Cartório, prioridade 1)',
    filaSalva && filaSalva.clientes[0].cnpj === cnpjUrgente,
    filaSalva && JSON.stringify(filaSalva.clientes)
  );

  const toastResumo = Array.from(w.document.body.querySelectorAll('div')).some((el) => /grupo/i.test(el.textContent || ''));
  checar('resumo final menciona a exclusão por grupo econômico', toastResumo, w.document.body.innerHTML);
});

promessa16.then(resumo);
