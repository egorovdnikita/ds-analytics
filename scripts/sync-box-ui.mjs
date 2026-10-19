/**
 * Синхронизация с дизайн-системой Box UI.
 *
 *   npm run sync:box-ui                         # клонирует свежий main
 *   BOX_UI_DIR=../box-ui npm run sync:box-ui    # из локальной копии
 *
 * Пакеты Box UI не опубликованы в npm, поэтому нужное вендорится в
 * src/ui/vendor/box-ui/ и коммитится — сборка плагина не должна зависеть от
 * сети и от чужого репозитория.
 *
 * Токены берутся целиком: тема переключается атрибутами и ссылается на всю
 * цепочку примитивов, выдернуть часть значит получить var() в пустоту.
 * Иконки — только из списка src/ui/icons.ts: стиль целиком весит 640 KB,
 * а бюджет всего UI — 500 KB.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = 'https://github.com/egorovdnikita/box-ui.git';
const ICON_STYLE = 'linear';
const OUT = resolve('src/ui/vendor/box-ui');

let source = process.env.BOX_UI_DIR ? resolve(process.env.BOX_UI_DIR) : null;
let cleanup = null;
if (source === null) {
  const dir = mkdtempSync(join(tmpdir(), 'box-ui-'));
  execFileSync('git', ['clone', '--quiet', '--depth', '1', REPO, dir], { stdio: 'inherit' });
  source = dir;
  cleanup = dir;
}

try {
  const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();

  // Токены собираются из дампов Figma скриптом самой Box UI — тем же, что
  // кормит её Storybook. Своей интерпретации дампов здесь нет.
  execFileSync('node', [join(source, 'packages/tokens/scripts/build.mjs')], {
    cwd: source,
    stdio: 'ignore',
  });
  const cssDir = join(source, 'packages/tokens/dist/css');

  mkdirSync(OUT, { recursive: true });
  for (const file of ['primitives.css', 'theme.css', 'controls.css']) {
    writeFileSync(join(OUT, file), readFileSync(join(cssDir, file)));
  }

  const wanted = [
    ...readFileSync('src/ui/icons.ts', 'utf8').matchAll(/^\s+'([a-z0-9-]+)',$/gm),
  ].map((match) => match[1]);
  const all = JSON.parse(
    readFileSync(join(source, `packages/icons/src/data/${ICON_STYLE}.json`), 'utf8'),
  );

  const missing = wanted.filter((name) => !(name in all));
  if (missing.length > 0) {
    throw new Error(`В Box UI (${ICON_STYLE}) нет иконок: ${missing.join(', ')}`);
  }

  const icons = Object.fromEntries(wanted.map((name) => [name, all[name]]));
  // Зашитый цвет проигнорировал бы токен текста вокруг — Box UI запрещает
  // такое в своих тестах, и здесь это проверяется повторно.
  for (const [name, body] of Object.entries(icons)) {
    if (/fill="#|stroke="#/i.test(body)) throw new Error(`Иконка ${name} с зашитым цветом`);
  }
  writeFileSync(join(OUT, 'icons.json'), `${JSON.stringify(icons, null, 2)}\n`);

  writeFileSync(
    join(OUT, 'SOURCE.md'),
    `# Box UI — вендорная копия

Не редактировать руками: файлы перезаписывает \`npm run sync:box-ui\`.

- Источник: ${REPO.replace(/\.git$/, '')}
- Коммит: \`${commit}\`
- Токены: \`primitives.css\`, \`theme.css\`, \`controls.css\` — сборка \`packages/tokens\`, без изменений
- Иконки: ${wanted.length} шт., стиль \`${ICON_STYLE}\`, список — \`src/ui/icons.ts\`

Иконки — набор Solar © 480 Design, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
`,
  );

  console.log(`Box UI ${commit.slice(0, 7)}: токены + ${wanted.length} иконок → ${OUT}`);
} finally {
  if (cleanup !== null && existsSync(cleanup)) rmSync(cleanup, { recursive: true, force: true });
}
