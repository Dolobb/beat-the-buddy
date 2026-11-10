import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const html = readFileSync(new URL('../dist/widget.html', import.meta.url));
const result = spawnSync('python3', ['-c', 'import sys,zlib; print(len(zlib.compress(sys.stdin.buffer.read(), 9)))'], { input: html, encoding: 'utf8' });
if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr);
const compressed = Number(result.stdout.trim());
console.log(`raw: ${html.length} / 32768 байт; zlib-9: ${compressed} / 4096 байт (цель ≤ 4000)`);
if (html.length > 32768 || compressed > 4096 || html.includes(0)) {
  console.error('Виджет превышает лимит или содержит NUL.');
  process.exit(1);
}
