/*
 * 站点构建脚本 —— 由 build.bat / deploy.bat 调用，也可以手动运行：node build.js
 *
 * 两个模块：
 *   1. recite   ：recite/list.js 登记的清单 md → recite/data.js
 *   2. resources：resources/*.md（一条资源一个 md 文件）→ resources/data.js
 *      GitHub 项目条目构建时会尝试自动抓 stars / 语言（网络失败自动跳过，
 *      不报错；在 md 里手填 stars / language 字段可以覆盖自动值）。
 *
 * 更新流程：改 md → 双击 build.bat 预览，或 deploy.bat 一步发布。
 */
const fs = require('fs');
const path = require('path');
const root = __dirname;

/* ================================================================
   模块一：recite
   ================================================================ */
function buildRecite() {
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
    console.log('recite 构建未完成，请先解决上面的 [MISS]');
    process.exit(1);
  }

  const json = JSON.stringify(out, null, 2).replace(/<\//g, '<\\/');
  fs.writeFileSync(path.join(root, 'recite', 'data.js'),
    '/* 本文件由 build.bat 自动生成，不要手改。\n' +
    '   改 recite/ 里的 md，然后重新双击 build.bat。 */\n' +
    'window.RECITE_DATA = ' + json + ';\n', 'utf8');
  console.log('已生成 recite/data.js');
}

/* ================================================================
   模块二：resources
   ================================================================ */
function parseFrontmatter(raw) {
  raw = raw.replace(/^\uFEFF/, '');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const meta = {};
  m[1].split(/\r?\n/).forEach(line => {
    const km = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!km) return;
    meta[km[1].toLowerCase()] = km[2].trim();
  });
  return { meta, body: m[2].trim() };
}

function parseTags(v) {
  if (!v) return [];
  return v.replace(/^\[/, '').replace(/\]$/, '')
    .split(/[,，]/).map(s => s.trim()).filter(Boolean);
}

async function fetchRepoMeta(repo) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch('https://api.github.com/repos/' + repo, {
      headers: {
        'User-Agent': 'wencaleb-site-build',
        'Accept': 'application/vnd.github+json'
      },
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    return { stars: typeof j.stargazers_count === 'number' ? j.stargazers_count : null,
             language: j.language || '',
             ghDesc: j.description || '' };
  } finally {
    clearTimeout(timer);
  }
}

async function buildResources() {
  const dir = path.join(root, 'resources');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
  const entries = [];

  for (const f of files) {
    const parsed = parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!parsed) {
      console.log('[WARN] resources/' + f + '  缺少 frontmatter（开头要有一对 --- 包住的元数据），跳过');
      continue;
    }
    const meta = parsed.meta;
    if (!meta.name || !meta.url) {
      console.log('[WARN] resources/' + f + '  缺少 name 或 url 字段，跳过');
      continue;
    }
    entries.push({
      id: f.replace(/\.md$/, ''),
      name: meta.name,
      type: meta.type === 'github' || /github\.com/i.test(meta.url) ? 'github' : 'site',
      url: meta.url,
      desc: meta.desc || '',
      tags: parseTags(meta.tags),
      added: meta.added || '',
      stars: meta.stars !== undefined && meta.stars !== '' && !isNaN(Number(meta.stars)) ? Number(meta.stars) : null,
      language: meta.language || '',
      reason: parsed.body
    });
  }

  /* GitHub 元数据：只对缺字段的条目抓取，手填优先 */
  const need = entries.filter(e => e.type === 'github' && (e.stars === null || !e.language));
  if (need.length) {
    console.log('抓取 GitHub 元数据（' + need.length + ' 个项目）…');
    await Promise.allSettled(need.map(async e => {
      const repo = (e.url.match(/github\.com\/([^\/\s]+)\/([^\/\s#?]+)/) || []).slice(1).join('/');
      if (!repo) return;
      try {
        const meta = await fetchRepoMeta(repo);
        if (e.stars === null && meta.stars !== null) e.stars = meta.stars;
        if (!e.language && meta.language) e.language = meta.language;
        if (!e.desc && meta.ghDesc) e.desc = meta.ghDesc;
        console.log('[GH] ' + repo + (e.stars !== null ? '  ★ ' + e.stars : ''));
      } catch (err) {
        console.log('[GH] ' + repo + '  抓取失败（' + err.message + '），跳过自动字段');
      }
    }));
  }

  /* 排序：添加日期倒序，同日按名称 */
  entries.sort((a, b) =>
    (b.added || '').localeCompare(a.added || '') ||
    a.name.localeCompare(b.name, 'zh'));

  const json = JSON.stringify(entries, null, 2).replace(/<\//g, '<\\/');
  fs.writeFileSync(path.join(root, 'resources', 'data.js'),
    '/* 本文件由 build.bat 自动生成，不要手改。\n' +
    '   资源在 resources/ 文件夹，一条一个 md；或用 add.bat 添加。 */\n' +
    'window.RESOURCES_DATA = ' + json + ';\n', 'utf8');
  console.log('[OK] resources  ' + entries.length + ' 条');
  console.log('已生成 resources/data.js');
}

(async () => {
  buildRecite();
  await buildResources();
  console.log('构建完成。');
})().catch(err => {
  console.log('构建失败：' + err.message);
  process.exit(1);
});
