// Publica uma versão no canal ESTÁVEL.
//
// O canal estável é o branch `estavel`. Ele só anda quando este script roda.
//
// POR QUE BRANCH E NÃO TAG: o desenho original usava tag, que é imutável e
// seria a escolha certa num mundo sem atrito. Mas a sessão que mantém este
// projeto consegue criar e mover branches e NÃO consegue criar tags (403 do
// GitHub, verificado), então com tag toda publicação ficaria dependendo de um
// comando manual do usuário -- e foi exatamente por isso que o canal estável
// ficou parado em v1.4.1 enquanto o main acumulava sete correções.
//
// O que se perde com branch: a garantia de que uma versão publicada nunca
// muda. O que se mantém, que era o objetivo real: o canal estável não se move
// quando o main anda. Em troca, este script ganha uma trava que a tag dava de
// graça -- a versão publicada precisa ser ESTRITAMENTE MAIOR que a que já
// está no ar, para que "publicar" nunca signifique "voltar atrás em silêncio".
//
// O QUE FAZ, nesta ordem:
//   1. Confere árvore limpa, versões em sincronia e que a versão sobe.
//   2. Roda a suíte.
//   3. Reescreve smart-table-estavel.user.js: @version novo e a lista de
//      @require gerada a partir do wrapper de desenvolvimento.
//   4. Commita esse arquivo em main e aponta o branch `estavel` pro commit.
//   5. Empurra main e estavel (a menos que você passe --local).
//
// Uso:  npm run release -- 1.5.0
//       npm run release -- 1.5.0 --local     (prepara sem empurrar)
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

// O nome do branch do canal estável. tests/wrappers.test.js confere que este
// arquivo e os @require do wrapper usam exatamente o mesmo nome -- se alguém
// renomear num lugar só, a suíte falha em vez de o canal 404-ar na máquina de
// outra pessoa.
const BRANCH_ESTAVEL = 'estavel';

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
 * Compara duas versões semver.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} Negativo se a < b, zero se iguais, positivo se a > b.
 */
function compararVersoes(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/**
 * Reescreve o wrapper estável pra uma versão: troca o @version e regera o
 * bloco de @require apontando pro branch `estavel`.
 * @updateURL/@downloadURL ficam em main de propósito -- é por eles que o
 * Tampermonkey descobre a atualização.
 *
 * @param {string} versao Ex.: "1.5.0".
 * @returns {number} Quantos @require foram gerados.
 */
function reescreverWrapperEstavel(versao) {
  const original = fs.readFileSync(WRAPPER_ESTAVEL, 'utf8');
  let gerados = 0;

  // A lista de módulos vem do wrapper de DESENVOLVIMENTO, não da versão
  // anterior do estável.
  //
  // BUG REAL que motivou isto: um módulo novo foi adicionado aos DOIS
  // wrappers de uma vez, então o estável (parado na referência antiga) passou
  // a pedir um arquivo que não existia lá -- 404, e o canal estável
  // simplesmente não carregava. Gerando a lista aqui, no mesmo passo em que o
  // branch `estavel` é movido pro commit atual, ela sempre bate com o
  // conteúdo publicado.
  const linhasRequireDev = (fs.readFileSync(WRAPPER_DEV, 'utf8').match(/^\/\/ @require\s+\S+$/gm) ?? []);
  const requiresNovos = linhasRequireDev.map((linha) => {
    gerados += 1;
    return linha.replace(
      /(https:\/\/raw\.githubusercontent\.com\/IsaacTexCotton\/SmartTable\/)[^/]+(\/modulos\/)/,
      `$1${BRANCH_ESTAVEL}$2`
    );
  });

  const atualizado = original
    .replace(/^(\/\/ @version\s+)\S+$/m, `$1${versao}`)
    // Substitui o BLOCO inteiro de @require pelo gerado acima.
    .replace(/^\/\/ @require\s+\S+$(\n\/\/ @require\s+\S+$)*/m, requiresNovos.join('\n'));

  fs.writeFileSync(WRAPPER_ESTAVEL, atualizado);
  return gerados;
}

/**
 * Empurra um ref com algumas tentativas -- a rede daqui cai o bastante pra
 * que uma falha isolada não deva interromper uma publicação já validada.
 *
 * @param {string[]} argumentos Argumentos do `git push`.
 */
function empurrarComTentativas(argumentos) {
  const esperas = [2000, 4000, 8000, 16000];
  for (let tentativa = 0; ; tentativa += 1) {
    try {
      execFileSync('git', ['push', ...argumentos], { cwd: RAIZ, encoding: 'utf8', stdio: 'inherit' });
      return;
    } catch (erro) {
      if (tentativa >= esperas.length) {
        abortar(
          `git push ${argumentos.join(' ')} falhou depois de ${esperas.length + 1} tentativas.\n` +
          '  O commit e o branch estão prontos localmente; refaça só o push.'
        );
      }
      const espera = esperas[tentativa];
      console.log(`  push falhou; nova tentativa em ${espera / 1000}s...`);
      execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${espera})`]);
    }
  }
}

function main() {
  const argumentos = process.argv.slice(2);
  const semPush = argumentos.includes('--local');
  const versao = argumentos.find((a) => !a.startsWith('--'));

  if (!versao) {
    abortar('Informe a versão. Ex.: npm run release -- 1.5.0');
  }
  if (!SEMVER.test(versao)) {
    abortar(`"${versao}" não é uma versão válida (use MAJOR.MINOR.PATCH, ex.: 1.5.0).`);
  }

  // 1. Árvore limpa -- senão a publicação apanharia trabalho pela metade.
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

  // 3. A versão tem que SUBIR. É a trava que a imutabilidade da tag dava de
  //    graça: com branch, republicar uma versão antiga é tecnicamente
  //    possível, e seria um rollback silencioso na máquina de outra pessoa.
  const versaoEstavelAtual = lerVersaoDoWrapper(WRAPPER_ESTAVEL);
  if (versaoEstavelAtual && compararVersoes(versao, versaoEstavelAtual) <= 0) {
    abortar(
      `O canal estável já está em ${versaoEstavelAtual}, e você pediu ${versao}.\n` +
      '  Publicar precisa avançar. Para voltar atrás de propósito, mova o branch\n' +
      `  \`${BRANCH_ESTAVEL}\` à mão e diga por quê no commit.`
    );
  }

  // 4. Suíte verde antes de congelar qualquer coisa.
  console.log('→ Rodando a suíte antes de publicar...');
  try {
    execFileSync(process.execPath, [path.join(RAIZ, 'tests', 'run-all.js')], { cwd: RAIZ, stdio: 'inherit' });
  } catch {
    abortar('A suíte falhou. Nada foi publicado.');
  }

  // 5. Reescreve o canal estável.
  const gerados = reescreverWrapperEstavel(versao);
  if (gerados === 0) {
    abortar('Nenhum @require foi gerado -- o cabeçalho do wrapper de desenvolvimento mudou de formato?');
  }
  console.log(`→ ${gerados} @require apontando pra ${BRANCH_ESTAVEL}.`);

  // 6. Commit em main (se houve mudança) e branch `estavel` apontando pro
  //    commit atual.
  //
  //    O commit é condicional porque nem toda publicação muda o arquivo:
  //    numa tentativa repetida não há nada pra commitar, e `git commit` sairia
  //    com erro em cima de um estado perfeitamente válido.
  rodar('git', ['add', 'smart-table-estavel.user.js']);
  if (rodar('git', ['diff', '--cached', '--name-only']) !== '') {
    rodar('git', ['commit', '-m', `Publica ${versao} no canal estável`]);
    console.log('→ Canal estável commitado.');
  } else {
    console.log('→ Canal estável já estava nesta versão; nada a commitar.');
  }

  const commit = rodar('git', ['rev-parse', 'HEAD']);
  rodar('git', ['branch', '--force', BRANCH_ESTAVEL, commit]);
  console.log(`→ Branch ${BRANCH_ESTAVEL} apontando pra ${commit.slice(0, 7)}.`);

  if (semPush) {
    console.log(`\n✓ ${versao} preparada localmente (--local, nada foi empurrado).\n`);
    console.log('Publique com:\n');
    console.log('    git push -u origin main');
    console.log(`    git push -u origin ${BRANCH_ESTAVEL}\n`);
    return;
  }

  // 7. Push. main PRIMEIRO: é lá que mora o smart-table-estavel.user.js que o
  //    Tampermonkey lê pra descobrir a versão nova. Se só o branch subisse, o
  //    conteúdo novo estaria no ar sem ninguém ser avisado dele.
  console.log('→ Empurrando main...');
  empurrarComTentativas(['-u', 'origin', 'main']);
  console.log(`→ Empurrando ${BRANCH_ESTAVEL}...`);
  empurrarComTentativas(['-u', 'origin', `${BRANCH_ESTAVEL}`]);

  console.log(`\n✓ ${versao} publicada no canal estável.\n`);
  console.log('Quem está no canal estável recebe a atualização na próxima');
  console.log('checagem do Tampermonkey (ou em "Check for updates").\n');
}

main();
