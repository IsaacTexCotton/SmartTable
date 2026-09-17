// Publica uma versão no canal ESTÁVEL.
//
// O QUE FAZ, nesta ordem:
//   1. Confere que a árvore está limpa e que a suíte passa.
//   2. Reescreve smart-table-estavel.user.js: @version novo e todos os
//      @require apontando pra tag dessa versão.
//   3. Commita esse arquivo e cria a tag localmente.
//   4. Imprime o comando de push (não empurra sozinho -- tag publicada é
//      chata de desfazer, então essa parte fica com você).
//
// Uso:  npm run release -- 1.5.0
//
// CommonJS de propósito: tests/run-all.js e os testes já são CJS, e misturar
// os dois formatos no mesmo projeto é pior que a consistência valer aqui.
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const WRAPPER_DEV = path.join(RAIZ, 'smart-table.user.js');
const WRAPPER_ESTAVEL = path.join(RAIZ, 'smart-table-estavel.user.js');
const MODULO_VERSAO = path.join(RAIZ, 'modulos', 'modulo6-contexto-adicional.js');

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * Roda um comando e devolve a saída como texto, ou lança com a mensagem do
 * processo -- nunca deixa o erro passar em silêncio.
 *
 * @param {string} comando
 * @param {string[]} argumentos
 * @returns {string} stdout já sem espaços nas pontas.
 */
function rodar(comando, argumentos) {
  try {
    return execFileSync(comando, argumentos, { cwd: RAIZ, encoding: 'utf8' }).trim();
  } catch (erro) {
    const detalhe = (erro.stderr || erro.stdout || erro.message || '').toString().trim();
    abortar(`Falhou: ${comando} ${argumentos.join(' ')}\n  ${detalhe}`);
    return ''; // inalcançável -- abortar() encerra o processo.
  }
}

/** @param {string} mensagem */
function abortar(mensagem) {
  console.error(`\n✗ ${mensagem}\n`);
  process.exit(1);
}

/**
 * Lê o @version declarado num wrapper do Tampermonkey.
 *
 * @param {string} arquivo Caminho absoluto.
 * @returns {string|null} A versão, ou null se o cabeçalho não tiver @version.
 */
function lerVersaoDoWrapper(arquivo) {
  const texto = fs.readFileSync(arquivo, 'utf8');
  return texto.match(/^\/\/ @version\s+(\S+)\s*$/m)?.[1] ?? null;
}

/**
 * Reescreve o wrapper estável pra uma versão: troca o @version e faz todos
 * os @require apontarem pra tag dessa versão. @updateURL/@downloadURL ficam
 * em main de propósito -- é por eles que o Tampermonkey descobre a atualização.
 *
 * @param {string} versao Ex.: "1.5.0".
 * @returns {number} Quantos @require foram reapontados.
 */
function reescreverWrapperEstavel(versao) {
  const tag = `v${versao}`;
  const original = fs.readFileSync(WRAPPER_ESTAVEL, 'utf8');
  let reapontados = 0;

  const atualizado = original
    .replace(/^(\/\/ @version\s+)\S+$/m, `$1${versao}`)
    .replace(/^(\/\/ @require\s+https:\/\/raw\.githubusercontent\.com\/IsaacTexCotton\/SmartTable\/)[^/]+(\/modulos\/)/gm,
      (_todo, prefixo, sufixo) => {
        reapontados += 1;
        return `${prefixo}${tag}${sufixo}`;
      })
    // O comentário do rodapé cita a tag vigente -- mantém coerente.
    .replace(/uma TAG \(v[^)]+\)/, `uma TAG (${tag})`);

  fs.writeFileSync(WRAPPER_ESTAVEL, atualizado);
  return reapontados;
}

function main() {
  const versao = process.argv[2];

  if (!versao) {
    abortar('Informe a versão. Ex.: npm run release -- 1.5.0');
  }
  if (!SEMVER.test(versao)) {
    abortar(`"${versao}" não é uma versão válida (use MAJOR.MINOR.PATCH, ex.: 1.5.0).`);
  }

  // 1. Árvore limpa -- senão a tag apanharia trabalho pela metade.
  if (rodar('git', ['status', '--porcelain']) !== '') {
    abortar('Há mudanças não commitadas. Commite ou guarde antes de publicar uma versão.');
  }

  // 2. A versão pedida tem que ser a que já está no código.
  const versaoDev = lerVersaoDoWrapper(WRAPPER_DEV);
  if (versaoDev !== versao) {
    abortar(
      `smart-table.user.js está em ${versaoDev}, mas você pediu ${versao}.\n` +
      '  Suba o @version (e o VERSAO_SMARTTABLE do Módulo 6) e commite antes de publicar.'
    );
  }
  const versaoModulo = fs.readFileSync(MODULO_VERSAO, 'utf8').match(/VERSAO_SMARTTABLE\s*=\s*'([^']+)'/)?.[1];
  if (versaoModulo !== versao) {
    abortar(`VERSAO_SMARTTABLE do Módulo 6 está em ${versaoModulo}, fora de sincronia com ${versao}.`);
  }

  // 3. A tag não pode já existir.
  const tag = `v${versao}`;
  const tagsExistentes = rodar('git', ['tag', '--list', tag]);
  if (tagsExistentes !== '') {
    abortar(`A tag ${tag} já existe. Publique uma versão nova em vez de reescrever uma publicada.`);
  }

  // 4. Suíte verde antes de congelar qualquer coisa.
  console.log('→ Rodando a suíte antes de publicar...');
  try {
    execFileSync(process.execPath, [path.join(RAIZ, 'tests', 'run-all.js')], { cwd: RAIZ, stdio: 'inherit' });
  } catch {
    abortar('A suíte falhou. Nada foi publicado.');
  }

  // 5. Reaponta o canal estável pra tag.
  const reapontados = reescreverWrapperEstavel(versao);
  if (reapontados === 0) {
    abortar('Nenhum @require foi reapontado -- o cabeçalho do wrapper estável mudou de formato?');
  }
  console.log(`→ ${reapontados} @require reapontados para ${tag}.`);

  // 6. Commit (se houve mudança) + tag locais. O push fica com você.
  //
  // O commit é condicional porque nem toda publicação muda o arquivo: quando
  // o wrapper estável JÁ está apontando pra essa tag -- caso da primeira
  // publicação, ou de uma tentativa repetida -- não há nada pra commitar, e
  // `git commit` sairia com erro em cima de um estado perfeitamente válido.
  rodar('git', ['add', 'smart-table-estavel.user.js']);
  const temMudanca = rodar('git', ['diff', '--cached', '--name-only']) !== '';
  if (temMudanca) {
    rodar('git', ['commit', '-m', `Publica ${tag} no canal estável`]);
    console.log('→ Canal estável commitado.');
  } else {
    console.log('→ Canal estável já apontava pra essa tag; nada a commitar.');
  }
  rodar('git', ['tag', '-a', tag, '-m', `SmartTable ${tag}`]);

  console.log(`\n✓ ${tag} preparada localmente.\n`);
  console.log('Confira e publique com:\n');
  console.log(`    git show ${tag} --stat`);
  console.log(`    git push origin main ${tag}\n`);
  console.log('Depois disso, quem está no canal estável recebe a atualização na');
  console.log('próxima checagem do Tampermonkey (ou em "Check for updates").\n');
}

main();
