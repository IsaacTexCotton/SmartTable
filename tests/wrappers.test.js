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
// Os dois wrappers carregam os MESMOS módulos, na MESMA ordem
// =====================================================================
const arquivosDev = requiresDev.map((r) => r.arquivo);
const arquivosEstavel = requiresEstavel.map((r) => r.arquivo);

checar('os dois canais têm a mesma quantidade de módulos', arquivosDev.length === arquivosEstavel.length, `dev=${arquivosDev.length} estável=${arquivosEstavel.length}`);
checar(
  'os dois canais carregam os mesmos módulos na mesma ordem',
  arquivosDev.join('|') === arquivosEstavel.join('|'),
  `\n    dev     = ${arquivosDev.join(', ')}\n    estável = ${arquivosEstavel.join(', ')}`
);

// A ordem importa de verdade: o Módulo 0 precisa vir antes de todos.
checar('Módulo 0 é o primeiro a carregar', /modulo0-/.test(arquivosDev[0] ?? ''), arquivosDev[0]);

// =====================================================================
// Nenhum módulo órfão: tudo que está em modulos/ é carregado, e tudo que é
// carregado existe em disco.
// =====================================================================
const emDisco = fs.readdirSync(path.join(RAIZ, 'modulos')).filter((f) => f.endsWith('.js')).sort();
const carregados = arquivosDev.map((a) => a.replace(/^modulos\//, '')).sort();

checar('todo módulo em modulos/ é carregado por algum @require', emDisco.join('|') === carregados.join('|'), `\n    disco     = ${emDisco.join(', ')}\n    carregados = ${carregados.join(', ')}`);

requiresDev.forEach(({ arquivo }) => {
  checar(`o arquivo do @require existe em disco: ${arquivo}`, fs.existsSync(path.join(RAIZ, arquivo)));
});

// =====================================================================
// Canal de desenvolvimento: sempre em main (ponta de lança)
// =====================================================================
checar('todos os @require do canal de desenvolvimento apontam pra main', requiresDev.every((r) => r.ref === 'main'), JSON.stringify([...new Set(requiresDev.map((r) => r.ref))]));

// =====================================================================
// Canal estável: sempre numa tag congelada, e a tag tem que ser a da versão
// =====================================================================
const refsEstavel = [...new Set(requiresEstavel.map((r) => r.ref))];
checar('todos os @require do canal estável apontam pra UMA única referência', refsEstavel.length === 1, JSON.stringify(refsEstavel));
checar('o canal estável NÃO aponta pra main', !refsEstavel.includes('main'), JSON.stringify(refsEstavel));
checar('a tag do canal estável é a da própria @version', refsEstavel[0] === `v${versaoEstavel}`, `ref=${refsEstavel[0]} versão=${versaoEstavel}`);

// =====================================================================
// updateURL/downloadURL: têm que ficar em main nos DOIS canais, senão o
// Tampermonkey nunca descobre que saiu versão nova (a tag é imutável).
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

resumo();
