/*
 * 添加一条资源 —— 由 add.bat 调用，也可以手动运行：node add.js
 *
 * 交互式问你几个字段，生成 resources/<名称>.md，
 * 然后你双击 deploy.bat 就发布上线（或先 build.bat 本地预览）。
 *
 * 类型自动判断：网址里含 github.com 归"GitHub 项目"，否则"网址"。
 * 日期自动填今天。
 */
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'resources');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, a => r(a.trim())));

(async () => {
  console.log('============================================');
  console.log('  添加一条资源（回车 = 跳过可选字段）');
  console.log('============================================');

  const name = await ask('名称（必填）：');
  if (!name) { console.log('没有名称，退出。'); rl.close(); return; }

  const url = await ask('网址（必填）：');
  if (!url || !/^https?:\/\/.+/i.test(url)) {
    console.log('网址没填或不是 http(s):// 开头，退出。');
    rl.close(); return;
  }

  const desc = await ask('一句话描述：');
  const tagsIn = await ask('标签（逗号分隔，如 工具,前端）：');
  const reason = await ask('推荐理由（可以写几句，回车跳过）：');

  const type = /github\.com/i.test(url) ? 'github' : 'site';
  const added = new Date().toISOString().slice(0, 10);
  const tags = tagsIn.split(/[,，]/).map(t => t.trim()).filter(Boolean);

  /* 文件名用名称，去掉非法字符；重名自动加 -2、-3 */
  let base = name.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'entry';
  let file = base + '.md';
  let n = 2;
  while (fs.existsSync(path.join(dir, file))) {
    file = base + '-' + n + '.md';
    n++;
  }

  const lines = [
    '---',
    'name: ' + name,
    'type: ' + type,
    'url: ' + url,
    'desc: ' + (desc || ''),
    'tags: [' + tags.join(', ') + ']',
    'added: ' + added,
    '---',
    '',
    reason
  ];
  fs.writeFileSync(path.join(dir, file), lines.join('\n') + '\n', 'utf8');

  console.log('');
  console.log('已生成 resources/' + file + '（类型：' + (type === 'github' ? 'GitHub 项目' : '网址') + '）');
  console.log('下一步：双击 build.bat 本地预览，或 deploy.bat 直接发布上线。');
  rl.close();
})();
