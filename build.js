/*
 * 背诵栏目构建脚本 —— 由 build.bat 调用，也可以手动运行：node build.js
 *
 * 做的事：读取 recite/list.js 里登记的每一份 md，
 *   1. 去掉 BOM 和开头的 frontmatter（--- ... ---）
 *   2. 删掉 Obsidian 双链所在的行（[[...]]）
 *   3. 压掉多余空行
 * 然后把干净的内容打包生成 recite/data.js（阅读页加载的就是它）。
 *
 * 你的更新流程：Obsidian 改 md → 覆盖到 recite/ → 双击 build.bat → 推送。
 * recite/data.js 是生成文件，不要手改。
 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
eval(fs.readFileSync(path.join(root, 'recite', 'list.js'), 'utf8'));

const out = {};
let failed = false;

for (const item of RECITE_FILES) {
  const p = path.join(root, item.file);
  try {
    let t = fs.readFileSync(p, 'utf8');
    t = t.replace(/^\uFEFF/, '');
    if (t.slice(0, 3) === '---') {
      t = t.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    }
    t = t.split(/\r?\n/)
      .filter(l => !/\[\[[^\]]*\]\]/.test(l))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n';
    out[item.file] = t;
    const verses = (t.match(/^##\s/gm) || []).length;
    console.log('[OK] ' + item.file + '  ' + verses + ' sections');
  } catch (err) {
    failed = true;
    console.log('[MISS] ' + item.file + '  文件不存在，检查 recite/list.js 里登记的路径');
  }
}

if (failed) {
  console.log('构建未完成，请先解决上面的 [MISS]');
  process.exit(1);
}

const json = JSON.stringify(out, null, 2).replace(/<\//g, '<\\/');
const js =
  '/* 本文件由 build.bat 自动生成，不要手改。\n' +
  '   改 recite/ 里的 md，然后重新双击 build.bat。 */\n' +
  'window.RECITE_DATA = ' + json + ';\n';

fs.writeFileSync(path.join(root, 'recite', 'data.js'), js, 'utf8');
console.log('已生成 recite/data.js');
