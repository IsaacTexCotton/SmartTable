// Registro de módulos carregados (Módulo 0) -- mesmo padrão do registro de
// painéis (registrarPainel/fecharOutrosPaineis), aplicado a "quais módulos
// existem".
//
// POR QUE ISTO EXISTE: até a v1.22.x essa pergunta era respondida em TRÊS
// lugares independentes -- as linhas @require do wrapper, a flag que cada
// módulo seta (window.__xCarregado = true), e um array copiado à mão dentro
// do Módulo 6 (FLAGS_DOS_MODULOS). O terceiro ficou pra trás DUAS vezes na
// mesma sessão de manutenção (o Módulo 11 nunca entrou nele, sem nenhum
// aviso até alguém rodar a suíte). Agora cada módulo se anuncia sozinho
// (registrarModuloCarregado) e o Módulo 6 só LÊ o registro -- reduz de 3
// fontes de verdade pra 2 (a lista @require continua separada, porque não
// há como uma página descobrir em runtime quantos @require o Tampermonkey
// concatenou).
//
// wrappers.test.js cobre a checagem ESTÁTICA (todo módulo em disco chama
// registrarModuloCarregado com um nome presente em MODULOS_ESPERADOS). Este
// arquivo cobre o COMPORTAMENTO em runtime: contagem, "quem falta", e o
// aviso de nome desconhecido.
const { novaJanela } = require('./helpers/dom-env');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('registro-modulos');

const URL_CRM = 'https://texhub.texcotton.com.br/crm/clientes';

// =====================================================================
// 1. API BÁSICA: registrar, listar carregados, listar faltando
// =====================================================================
(function apiBasica() {
  const w = novaJanela({ url: URL_CRM, specs: [{ arquivo: 'modulo0-utilitarios-compartilhados.js' }] });
  const u = w.__smartTableUtil;

  checar('registrarModuloCarregado existe', typeof u.registrarModuloCarregado === 'function');
  checar('modulosCarregados existe', typeof u.modulosCarregados === 'function');
  checar('modulosFaltando existe', typeof u.modulosFaltando === 'function');
  checar('MODULOS_ESPERADOS existe e não está vazio', Array.isArray(u.MODULOS_ESPERADOS) && u.MODULOS_ESPERADOS.length > 0);

  // O próprio Módulo 0 já se registrou sozinho ao carregar -- não precisa
  // de ninguém chamando por ele.
  checar(
    'Módulo 0 já aparece registrado sozinho, só de ter carregado',
    u.modulosCarregados().includes('Utilitários Compartilhados')
  );

  const nomeQualquer = u.MODULOS_ESPERADOS.find((n) => n !== 'Utilitários Compartilhados');
  checar('esse nome ainda não está carregado', !u.modulosCarregados().includes(nomeQualquer));
  checar('e por isso está em modulosFaltando', u.modulosFaltando().includes(nomeQualquer));

  u.registrarModuloCarregado(nomeQualquer);
  checar('depois de registrar, aparece em modulosCarregados', u.modulosCarregados().includes(nomeQualquer));
  checar('e some de modulosFaltando', !u.modulosFaltando().includes(nomeQualquer));

  // Registrar de novo (dois módulos que por algum motivo chamassem duas
  // vezes, ou um re-require acidental) não duplica a lista.
  const antesDoDobrado = u.modulosCarregados().length;
  u.registrarModuloCarregado(nomeQualquer);
  checar('registrar o mesmo nome duas vezes não duplica', u.modulosCarregados().length === antesDoDobrado);
})();

// =====================================================================
// 2. NOME DESCONHECIDO AVISA NA HORA (não só no teste)
// =====================================================================
// É a vantagem real sobre o array copiado à mão: um typo no nome aparece no
// console assim que a página carrega em desenvolvimento, não só quando
// alguém lembra de rodar `npm run verificar`.
(function nomeDesconhecidoAvisa() {
  const w = novaJanela({ url: URL_CRM, specs: [{ arquivo: 'modulo0-utilitarios-compartilhados.js' }] });
  const u = w.__smartTableUtil;

  // `console` dentro do código avaliado do módulo é identificador livre e
  // resolve pro console GLOBAL do Node (dom-env.js não espelha `console`
  // pra `w.console` -- só window/document/localStorage/etc.), então quem
  // precisa ser trocado aqui é o console do próprio processo, não w.console.
  const avisos = [];
  const warnOriginal = console.warn;
  console.warn = (...args) => { avisos.push(args.join(' ')); };
  try {
    u.registrarModuloCarregado('Módulo Que Não Existe');
  } finally {
    console.warn = warnOriginal;
  }

  checar('nome fora de MODULOS_ESPERADOS gera aviso', avisos.some((a) => /não está em MODULOS_ESPERADOS/.test(a)), avisos.join(' | '));
  // Mesmo avisando, ainda registra -- degrada (mostra o nome errado no
  // diagnóstico) em vez de descartar silenciosamente o módulo inteiro.
  checar('mas ainda assim registra (degrada, não descarta)', u.modulosCarregados().includes('Módulo Que Não Existe'));
})();

// =====================================================================
// 3. MODULOS_ESPERADOS É CONGELADO (Object.freeze)
// =====================================================================
(function congelado() {
  const w = novaJanela({ url: URL_CRM, specs: [{ arquivo: 'modulo0-utilitarios-compartilhados.js' }] });
  const u = w.__smartTableUtil;

  const tamanhoAntes = u.MODULOS_ESPERADOS.length;
  let lancou = false;
  try {
    u.MODULOS_ESPERADOS.push('Tentativa de Adulterar');
  } catch {
    lancou = true; // Array.prototype.push em array congelado lança, e é o esperado
  }
  checar(
    'array congelado não aceita push (lança, ou no mínimo não muda de tamanho)',
    lancou || u.MODULOS_ESPERADOS.length === tamanhoAntes
  );
  checar('MODULOS_ESPERADOS continua com o tamanho original', u.MODULOS_ESPERADOS.length === tamanhoAntes);
})();

// =====================================================================
// 4. INTEGRAÇÃO REAL: um subconjunto de módulos de verdade, carregado
// junto -- prova que a ligação (cada módulo chamando a função certa, com o
// nome certo) funciona de ponta a ponta, não só que cada arquivo TEM a
// chamada (isso já é o que wrappers.test.js confere, por regex).
// =====================================================================
(function integracaoReal() {
  const SPECS = [
    { arquivo: 'modulo0-utilitarios-compartilhados.js' },
    { arquivo: 'modulo9-painel-configuracoes.js' },
    { arquivo: 'modulo10-recebido-na-semana.js' },
    { arquivo: 'modulo8-diario.js' },
    { arquivo: 'modulo3-fila-atendimento.js' },
  ];
  const w = novaJanela({ url: URL_CRM, specs: SPECS });
  const u = w.__smartTableUtil;

  const carregados = u.modulosCarregados();
  ['Utilitários Compartilhados', 'Painel de Configurações', 'Recebido na Semana', 'Diário', 'Fila de Atendimento']
    .forEach((nome) => checar(`"${nome}" apareceu registrado de verdade (não só na regra estática)`, carregados.includes(nome)));

  const faltando = u.modulosFaltando();
  checar(
    'os módulos que não foram carregados nesta janela aparecem em modulosFaltando',
    faltando.includes('Alerta do Cliente') && faltando.includes('Fila por Prioridade') && faltando.includes('Progresso da Fila')
  );
  checar(
    'e nenhum dos 5 que carregaram aparece em modulosFaltando',
    !faltando.includes('Utilitários Compartilhados') && !faltando.includes('Painel de Configurações')
  );
  checar(
    'carregados + faltando = todos os esperados, sem sobrar nem faltar ninguém',
    carregados.length + faltando.length === u.MODULOS_ESPERADOS.length
  );
})();

// =====================================================================
// 5. O MÓDULO 6 LÊ O REGISTRO DE VERDADE (não uma lista própria)
// =====================================================================
(function modulo6LeORegistro() {
  const SPECS = [
    { arquivo: 'modulo0-utilitarios-compartilhados.js' },
    { arquivo: 'modulo9-painel-configuracoes.js' },
    { arquivo: 'modulo6-contexto-adicional.js' },
  ];
  const w = novaJanela({ url: `${URL_CRM}/grupo/1?cnpj=11111111%2F0001-11`, specs: SPECS });
  const u = w.__smartTableUtil;

  // Módulo 6 é o último a carregar nesta janela -- por isso, no momento em
  // que ele desenha o toast, os 3 já se anunciaram.
  checar('os 3 módulos carregados nesta janela aparecem no registro', u.modulosCarregados().length === 3, u.modulosCarregados().join(', '));
  checar(
    '"Contexto Adicional" (o próprio Módulo 6) está entre eles',
    u.modulosCarregados().includes('Contexto Adicional')
  );

  const fs = require('fs');
  const path = require('path');
  const texto = fs.readFileSync(path.join(__dirname, '..', 'modulos', 'modulo6-contexto-adicional.js'), 'utf8');
  checar(
    'o Módulo 6 não DECLARA mais FLAGS_DOS_MODULOS própria (a string pode seguir citada em comentário histórico)',
    !/const FLAGS_DOS_MODULOS/.test(texto)
  );
  checar('o Módulo 6 lê modulosCarregados do Módulo 0', /modulosCarregados\?\.\(\)/.test(texto));
  checar('o Módulo 6 lê modulosFaltando do Módulo 0', /modulosFaltando\?\.\(\)/.test(texto));
})();

resumo();
