import { spawn } from 'node:child_process';

if (Number(process.versions.node.split('.')[0]) < 24) {
  throw new Error('Multiplayer requires Node 24+. Use pnpm dev for the browser game alone.');
}
const children = [
  spawn('pnpm', [process.argv.includes('--debug') ? 'dev:debug' : 'dev'], { stdio: 'inherit' }),
  spawn('pnpm', ['dev:server'], { stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of children) {
    child.kill('SIGTERM');
  }
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => stop(code ?? 1));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
