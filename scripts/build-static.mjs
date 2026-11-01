import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(root, 'dist');
const files = [
  'index.html',
  'app.js', 'sync.js', 'views.js', 'interaction.js', 'audio.js',
  'color-theme.js', 'account-dialogs.js',
  'styles.css', 'theme.css', 'entry.css', 'color-theme.css', 'account-dialogs.css',
  'assets', 'vendor',
];

// Check every input before replacing the generated output directory.
for (const file of files) {
  if (!existsSync(path.join(root, file))) throw new Error(`Missing runtime file: ${file}`);
}
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
for (const [, reference] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (!/^(?:https?:|data:|\/\/)/.test(reference) && !existsSync(path.join(root, reference))) {
    throw new Error(`Missing page asset: ${reference}`);
  }
}
if (output !== path.join(root, 'dist') || path.dirname(output) !== path.resolve(root)) {
  throw new Error('Invalid build output directory');
}
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const file of files) cpSync(path.join(root, file), path.join(output, file), { recursive: true });
console.log('Static site built in dist/');
