// Roda todos os *.test.js desta pasta, cada um em um processo Node
// separado (evita que o `global.window`/`global.document` compartilhado
// entre arquivos de um teste vaze pro outro -- ver helpers/dom-env.js).
// Uso: npm test
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const arquivos = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.js'))
  .sort();

if (arquivos.length === 0) {
  console.error('Nenhum arquivo *.test.js encontrado em tests/.');
  process.exit(1);
}

let algumaFalha = false;

arquivos.forEach((arquivo) => {
  console.log(`\n--- ${arquivo} ---`);
  try {
    const saida = execFileSync(process.execPath, [path.join(__dirname, arquivo)], { encoding: 'utf8' });
    process.stdout.write(saida);
  } catch (erro) {
    algumaFalha = true;
    if (erro.stdout) process.stdout.write(erro.stdout);
    if (erro.stderr) process.stderr.write(erro.stderr);
    console.error(`[${arquivo}] terminou com erro (exit code ${erro.status}).`);
  }
});

console.log(algumaFalha ? '\n=== FALHOU ===' : '\n=== TUDO OK ===');
process.exit(algumaFalha ? 1 : 0);
