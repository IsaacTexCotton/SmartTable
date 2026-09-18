// Testes dos dois wrappers do Tampermonkey (canal de desenvolvimento e canal
// estável). Não carrega DOM nenhum -- é conferência de cabeçalho.
//
// POR QUE EXISTE: com dois wrappers, o erro clássico é mexer num e esquecer
// do outro. Ele não quebra teste, não quebra o build e não aparece no
// console: simplesmente uma das duas pessoas fica rodando um conjunto de
// módulos diferente da outra, e a diferença só aparece como "na minha
// máquina funciona". Este arquivo trava isso.
const fs = require('fs');
const path = require('path');
const { criarChecador } = require('./helpers/checar');

const { checar, resumo } = criarChecador('wrappers');

const RAIZ = path.join(__dirname, '..');
const DEV = fs.readFileSync(path.join(RAIZ, 'smart-table.user.js'), 'utf8');
const ESTAVEL = fs.readFileSync(path.join(RAIZ, 'smart-table-estavel.user.js'), 'utf8');

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BASE_RAW = 'https://raw.githubusercontent.com/IsaacTexCotton/SmartTable/';

// O canal estável é um BRANCH, não uma tag. A decisão está registrada no
// cabeçalho de scripts/release.js: a sessão que mantém o projeto consegue
// mover branches e não consegue criar tags, e um canal estável que só avança
// com ação manual não avança -- ficou sete correções para trás na prática.
//
// O nome aparece em dois lugares (aqui e no release.js) e precisa ser o
// mesmo nos dois: renomear num lugar só daria 404 na máquina de outra
// pessoa, em silêncio. A última checagem deste arquivo trava isso.
const BRANCH_ESTAVEL = 'estavel';

/** @param {string} texto @returns {string|null} */
function versaoDe(texto) {
  return texto.match(/^\/\/ @version\s+(\S+)\s*$/m)?.[1] ?? null;
}

/**
 * Extrai de cada @require a referência do git (branch ou tag) e o arquivo.
 * @param {string} texto
 * @returns {{ref: string, arquivo: string}[]}
 */
function requiresDe(texto) {
  const linhas = texto.match(/^\/\/ @require\s+\S+$/gm) ?? [];
  return linhas.map((linha) => {
    const url = linha.replace(/^\/\/ @require\s+/, '');
    const resto = url.startsWith(BASE_RAW) ? url.slice(BASE_RAW.length) : '';
    const [ref, ...caminho] = resto.split('/');
    return { ref, arquivo: caminho.join('/') };
  });
}

/**
 * Lê um campo do cabeçalho do Tampermonkey.
 *
 * Captura a linha inteira e só depois apara: campos como @name e
 * @description têm espaços, e um `\\S+` devolveria só a primeira palavra --
 * foi exatamente assim que a checagem de @name passou a comparar
 * "SmartTable" com "SmartTable" e deu falso negativo.
 *
 * @param {string} texto Conteúdo do wrapper.
 * @param {string} chave Nome do campo, sem o "@".
 * @returns {string|null} Valor aparado, ou null se o campo não existir.
 */
function metaDe(texto, chave) {
  return texto.match(new RegExp(`^// @${chave}\\s+(.+)$`, 'm'))?.[1]?.trim() ?? null;
}

const versaoDev = versaoDe(DEV);
const versaoEstavel = versaoDe(ESTAVEL);
const requiresDev = requiresDe(DEV);
const requiresEstavel = requiresDe(ESTAVEL);
const refsEstavel = [...new Set(requiresEstavel.map((r) => r.ref))];

// =====================================================================
// Versões
// =====================================================================
checar('canal de desenvolvimento tem @version em semver', SEMVER.test(versaoDev ?? ''), String(versaoDev));
checar('canal estável tem @version em semver', SEMVER.test(versaoEstavel ?? ''), String(versaoEstavel));

// O VERSAO_SMARTTABLE do Módulo 6 é o que aparece no console do CRM -- se
// divergir do wrapper, o log mente sobre o que está rodando.
const versaoModulo = fs
  .readFileSync(path.join(RAIZ, 'modulos', 'modulo6-contexto-adicional.js'), 'utf8')
  .match(/VERSAO_SMARTTABLE\s*=\s*'([^']+)'/)?.[1];
checar('VERSAO_SMARTTABLE do Módulo 6 bate com o canal de desenvolvimento', versaoModulo === versaoDev, `modulo=${versaoModulo} wrapper=${versaoDev}`);

// =====================================================================
// O canal estável FICA PARA TRÁS de propósito
// =====================================================================
// CORRIGIDO (bug real, achado antes de publicar a primeira tag): aqui havia
// uma asserção de que os dois canais carregassem os MESMOS módulos. Isso é
// errado por construção -- o estável aponta pra uma tag congelada, então
// entre uma publicação e outra ele legitimamente tem MENOS módulos que o
// main. A asserção forçou adicionar um módulo novo aos dois wrappers de uma
// vez, e o estável passou a pedir da tag antiga um arquivo que não existia
// lá: 404, e o canal estável não carregava.
//
// O que de fato precisa ser verdade é o teste abaixo: todo arquivo que o
// estável pede EXISTE na tag dele.
const arquivosDev = requiresDev.map((r) => r.arquivo);
const arquivosEstavel = requiresEstavel.map((r) => r.arquivo);

checar('o canal estável não pede mais módulos do que existem em main', arquivosEstavel.length <= arquivosDev.length, `dev=${arquivosDev.length} estável=${arquivosEstavel.length}`);
checar(
  'todo módulo do canal estável também existe no canal de desenvolvimento',
  arquivosEstavel.every((a) => arquivosDev.includes(a)),
  `\n    sobrando no estável = ${arquivosEstavel.filter((a) => !arquivosDev.includes(a)).join(', ') || '(nenhum)'}`
);

// A ordem importa de verdade: o Módulo 0 precisa vir antes de todos.
checar('Módulo 0 é o primeiro a carregar no canal de desenvolvimento', /modulo0-/.test(arquivosDev[0] ?? ''), arquivosDev[0]);
checar('Módulo 0 é o primeiro a carregar no canal estável', /modulo0-/.test(arquivosEstavel[0] ?? ''), arquivosEstavel[0]);

// A ordem relativa dos módulos que os dois compartilham tem que ser a mesma
// -- ordem de carregamento é dependência, não estética.
const devFiltrado = arquivosDev.filter((a) => arquivosEstavel.includes(a));
checar(
  'a ordem relativa dos módulos compartilhados é a mesma nos dois canais',
  devFiltrado.join('|') === arquivosEstavel.join('|'),
  `\n    dev (filtrado) = ${devFiltrado.join(', ')}\n    estável        = ${arquivosEstavel.join(', ')}`
);

// =====================================================================
// O ARQUIVO QUE O ESTÁVEL PEDE EXISTE NO BRANCH DELE?
// =====================================================================
// É a checagem que teria pego o 404 antes de ele chegar na máquina de
// alguém. Só roda quando o branch está disponível localmente -- o workflow
// de CI busca tudo justamente pra isso (fetch-depth: 0). Num clone raso ou
// antes da primeira publicação, ela se declara pulada em vez de falhar.
(function conferirArquivosNoBranch() {
  const { execFileSync } = require('child_process');
  const ref = refsEstavel[0];

  /** @param {string} r @returns {boolean} */
  const existeRef = (r) => {
    try {
      execFileSync('git', ['rev-parse', '--verify', `${r}^{commit}`], { cwd: RAIZ, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  };

  // Local primeiro; no CI o branch costuma existir só como origin/<ref>.
  const refUsavel = [ref, `origin/${ref}`].find(existeRef);

  if (!refUsavel) {
    console.log(`  NOTA - ${ref} não está disponível aqui; a checagem de conteúdo do branch foi pulada.`);
    console.log('         (a primeira publicação ainda não aconteceu, ou o clone veio sem esse branch)');
    return;
  }

  arquivosEstavel.forEach((arquivo) => {
    let existe = false;
    try {
      execFileSync('git', ['cat-file', '-e', `${refUsavel}:${arquivo}`], { cwd: RAIZ, stdio: 'pipe' });
      existe = true;
    } catch {
      existe = false;
    }
    checar(`o canal estável pede ${arquivo}, e ele existe em ${refUsavel}`, existe);
  });
})();

// =====================================================================
// Nenhum módulo órfão: tudo que está em modulos/ é carregado, e tudo que é
// carregado existe em disco.
// =====================================================================
const emDisco = fs.readdirSync(path.join(RAIZ, 'modulos')).filter((f) => f.endsWith('.js')).sort();
const carregados = arquivosDev.map((a) => a.replace(/^modulos\//, '')).sort();

checar('todo módulo em modulos/ é carregado pelo canal de desenvolvimento', emDisco.join('|') === carregados.join('|'), `\n    disco     = ${emDisco.join(', ')}\n    carregados = ${carregados.join(', ')}`);

requiresDev.forEach(({ arquivo }) => {
  checar(`o arquivo do @require existe em disco: ${arquivo}`, fs.existsSync(path.join(RAIZ, arquivo)));
});

// =====================================================================
// Canal de desenvolvimento: sempre em main (ponta de lança)
// =====================================================================
checar('todos os @require do canal de desenvolvimento apontam pra main', requiresDev.every((r) => r.ref === 'main'), JSON.stringify([...new Set(requiresDev.map((r) => r.ref))]));

// =====================================================================
// Canal estável: sempre no branch `estavel`, nunca em main
// =====================================================================
checar('todos os @require do canal estável apontam pra UMA única referência', refsEstavel.length === 1, JSON.stringify(refsEstavel));
checar('o canal estável NÃO aponta pra main', !refsEstavel.includes('main'), JSON.stringify(refsEstavel));
checar(`os @require do canal estável apontam pro branch ${BRANCH_ESTAVEL}`, refsEstavel[0] === BRANCH_ESTAVEL, `ref=${refsEstavel[0]}`);

// =====================================================================
// updateURL/downloadURL: têm que ficar em main nos DOIS canais. É por eles
// que o Tampermonkey descobre que saiu versão nova -- o branch `estavel` só
// serve os módulos, e o @version que dispara a atualização mora em main.
// =====================================================================
[['desenvolvimento', DEV], ['estável', ESTAVEL]].forEach(([nome, texto]) => {
  ['updateURL', 'downloadURL'].forEach((chave) => {
    const url = metaDe(texto, chave);
    checar(`@${chave} do canal ${nome} aponta pra main`, (url ?? '').startsWith(`${BASE_RAW}main/`), String(url));
  });
});

// Cada canal se atualiza a partir do PRÓPRIO arquivo -- trocar isso faria
// uma pessoa migrar de canal sem perceber.
checar('canal de desenvolvimento se atualiza por smart-table.user.js', (metaDe(DEV, 'updateURL') ?? '').endsWith('/smart-table.user.js'), metaDe(DEV, 'updateURL'));
checar('canal estável se atualiza por smart-table-estavel.user.js', (metaDe(ESTAVEL, 'updateURL') ?? '').endsWith('/smart-table-estavel.user.js'), metaDe(ESTAVEL, 'updateURL'));

// =====================================================================
// Os dois precisam casar com a mesma página e sem privilégio extra.
// =====================================================================
checar('os dois canais casam com a mesma URL do CRM', metaDe(DEV, 'match') === metaDe(ESTAVEL, 'match'), `${metaDe(DEV, 'match')} vs ${metaDe(ESTAVEL, 'match')}`);
checar('os dois canais usam @grant none', metaDe(DEV, 'grant') === 'none' && metaDe(ESTAVEL, 'grant') === 'none');
checar('os dois canais rodam em document-idle', metaDe(DEV, 'run-at') === metaDe(ESTAVEL, 'run-at'));

// Nomes diferentes: senão o Tampermonkey trata os dois como o mesmo script e
// instalar um sobrescreve o outro.
checar('os dois canais têm @name diferente', metaDe(DEV, 'name') !== metaDe(ESTAVEL, 'name'));

// =====================================================================
// O script de publicação e o wrapper falam do MESMO branch
// =====================================================================
// Sem isto, renomear o branch num dos dois lugares não quebra nada aqui e
// só aparece como 404 no navegador de quem está no canal estável.
const RELEASE = fs.readFileSync(path.join(RAIZ, 'scripts', 'release.js'), 'utf8');
const branchNoRelease = RELEASE.match(/const BRANCH_ESTAVEL = '([^']+)'/)?.[1];
checar(
  'scripts/release.js publica no mesmo branch que os @require do wrapper pedem',
  branchNoRelease === BRANCH_ESTAVEL,
  `release=${branchNoRelease} wrapper=${refsEstavel[0]}`
);
// A tag deixou de ser o mecanismo; o script não pode ter sobrado com ela.
checar(
  'scripts/release.js não cria mais tag',
  !/'tag'/.test(RELEASE),
  'o canal estável é branch -- `git tag` aqui é resíduo do desenho antigo'
);

// =====================================================================
// FLAGS_DOS_MODULOS (Módulo 6) não pode ficar pra trás
// =====================================================================
// DEFEITO REAL: o Módulo 11 entrou sem sua flag ser acrescentada aqui -- o
// console de "X/13 módulos carregados" mentia (contava 12 no total, não 13)
// sem ninguém perceber, porque nada testava essa lista contra a realidade.
// É a MESMA classe de bug que motivou trocar "7 módulos" fixo por uma
// contagem (ver comentário no próprio Módulo 6) -- só que a lista em si
// também pode ficar velha, e só o disco sabe a verdade.
const MODULO6 = fs.readFileSync(path.join(RAIZ, 'modulos', 'modulo6-contexto-adicional.js'), 'utf8');
const flagsDeclaradas = [...MODULO6.matchAll(/'(__\w+(?:Carregad[oa]s?|Instalado))'/g)].map((m) => m[1]);

// TODO módulo, incluindo o próprio 6, grava sua própria flag "cheguei" em
// algum ponto do arquivo e precisa estar na lista que ele mesmo declara.
fs.readdirSync(path.join(RAIZ, 'modulos'))
  .filter((f) => f.endsWith('.js'))
  .forEach((arquivo) => {
    const texto = fs.readFileSync(path.join(RAIZ, 'modulos', arquivo), 'utf8');
    const flagDoArquivo = texto.match(/window\.(__\w+(?:Carregad[oa]s?|Instalado)) = true/)?.[1];
    checar(`${arquivo} tem uma flag própria de "já carreguei"`, !!flagDoArquivo, 'todo módulo precisa de uma pra entrar na contagem do Módulo 6');
    if (flagDoArquivo) {
      checar(
        `a flag de ${arquivo} (${flagDoArquivo}) está em FLAGS_DOS_MODULOS`,
        flagsDeclaradas.includes(flagDoArquivo)
      );
    }
  });

resumo();
