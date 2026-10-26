// npm run dev: sobe o Vite e o reinicia por inteiro quando tailwind.config.js muda.
// Motivo: o Vite carrega o PostCSS/Tailwind uma vez por processo e o Tailwind guarda a configuração lida;
// sem processo novo, classes criadas nos tokens (tailwind.config.js) não são geradas e as telas ficam sem estilo.
// Também anuncia o endereço real: se a 5173 estiver ocupada (ex.: Docker), o Vite usa a próxima porta livre.
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// resolve pelo Node: com node-linker=hoisted (.npmrc) o vite fica no node_modules da raiz
const vite = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin/vite.js');
const args = process.argv.slice(2);
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
let child, timer, restarting = false;

function start(extra = []) {
  let announced = false;
  child = spawn(process.execPath, [vite, ...args, ...extra], { stdio: ['inherit', 'pipe', 'inherit'], env: { ...process.env, FORCE_COLOR: '1' } });
  child.stdout.on('data', (buf) => {
    process.stdout.write(buf);
    const url = !announced && /Local:\s+(http\S+)/.exec(plain(buf.toString()))?.[1];
    if (url) {
      announced = true;
      process.stdout.write(`\n  ==> Plataforma aberta em ${url}\n\n`);
      process.stdout.write(`\x1b]0;Plataforma de Rastreamento - ${url}\x07`); // título da janela do terminal
    }
  });
  child.on('exit', (code) => {
    if (restarting) { restarting = false; start(['--open', 'false']); return; } // reinício: não abre outra aba
    process.exit(code ?? 0);
  });
}

watch('tailwind.config.js', () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log('\n[dev] tailwind.config.js mudou: reiniciando o Vite para gerar as classes novas…\n');
    restarting = true;
    child.kill();
  }, 300);
});

process.on('exit', () => child?.kill()); // não deixa o Vite órfão
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { restarting = false; child?.kill(); process.exit(0); });
start();
