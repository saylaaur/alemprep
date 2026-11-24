// Собирает автономное демо страницы урока: один index.html + видео и постер рядом.
// Урок: переменная DEMO_LESSON (по умолчанию accelerated-motion).
// Запуск: node demo/lesson-demo/build.mjs <папка-вывода>
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const lessonId = process.env.DEMO_LESSON ?? 'accelerated-motion';
const out = resolve(process.argv[2] ?? join(root, 'out-demo'));
mkdirSync(out, { recursive: true });

const js = await build({
  entryPoints: [join(root, 'demo/lesson-demo/entry.tsx')],
  bundle: true,
  minify: true,
  write: false,
  format: 'iife',
  jsx: 'automatic',
  target: 'es2020',
  tsconfig: join(root, 'tsconfig.json'),
  define: { 'process.env.NODE_ENV': '"production"', __DEMO_LESSON__: JSON.stringify(lessonId) },
  logLevel: 'warning',
});

execFileSync(
  'npx',
  ['tailwindcss', '-c', 'demo/lesson-demo/tailwind.config.ts', '-i', 'app/globals.css', '-o', join(out, 'tw.css'), '--minify'],
  { cwd: root, stdio: 'inherit' }
);
const tw = readFileSync(join(out, 'tw.css'), 'utf8');

// KaTeX: оставляем только woff2 и вшиваем шрифты в CSS, чтобы страница была одним файлом.
const katexDir = join(root, 'node_modules/katex/dist');
let katex = readFileSync(join(katexDir, 'katex.min.css'), 'utf8');
katex = katex.replace(/url\(fonts\/([^)]+?)\.woff2\) format\("woff2"\),url\([^)]+\) format\("woff"\),url\([^)]+\) format\("truetype"\)/g, (_, name) => {
  const b64 = readFileSync(join(katexDir, 'fonts', `${name}.woff2`)).toString('base64');
  return `url(data:font/woff2;base64,${b64}) format("woff2")`;
});

const code = js.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>AlemPrep Видеоурок</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:wght@500;600;700&display=swap&subset=cyrillic,cyrillic-ext" rel="stylesheet">
<style>
:root{--font-sans:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;--font-serif:'Lora',Georgia,serif;--font-mono:ui-monospace,SFMono-Regular,monospace}
${katex}
${tw}
html,body{background:hsl(var(--background))}
</style>
</head>
<body>
<div id="root"></div>
<script>${code}</script>
</body>
</html>`;
writeFileSync(join(out, 'index.html'), html);

// Вариант для публикации артефактом: оболочку (doctype, head, body) добавляет сама платформа.
const fragment = `<title>AlemPrep Видеоурок</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:wght@500;600;700&display=swap&subset=cyrillic,cyrillic-ext" rel="stylesheet">
<style>
:root{--font-sans:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;--font-serif:'Lora',Georgia,serif;--font-mono:ui-monospace,SFMono-Regular,monospace}
${katex}
${tw}
html,body{background:hsl(var(--background))}
</style>
<div id="root"></div>
<script>${code}</script>
`;
writeFileSync(join(out, 'page.html'), fragment);
copyFileSync(join(root, `public/lessons/${lessonId}.mp4`), join(out, 'lesson.mp4'));
copyFileSync(join(root, `public/lessons/${lessonId}.jpg`), join(out, 'poster.jpg'));
console.log('demo built:', out, `${(html.length / 1024).toFixed(0)} KB html`);
