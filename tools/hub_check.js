/* 探针：验证营地界面信息架构
   ① hub 10 按钮三组分行（出发/整备/管理）② 主线进度链四阶段状态渲染
   ③ 选图页显示四图特色机制标签 ④ 全部按钮 data-act 仍可路由 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAME_HTML = path.join(__dirname, '..', 'DeadExtraction.html');
const html = fs.readFileSync(GAME_HTML, 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const code = scripts.join('\n;\n');

function makeCtx() {
  const noop = () => {};
  const ctx = {
    canvas: { width: 1380, height: 860 },
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    arc: noop, rect: noop, fill: noop, stroke: noop, fillRect: noop, strokeRect: noop,
    clearRect: noop, translate: noop, rotate: noop, scale: noop, setTransform: noop,
    fillText: noop, strokeText: noop, drawImage: noop, clip: noop, setLineDash: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 10 }),
    createPattern: () => null, putImageData: noop, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  return new Proxy(ctx, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => (t[k] = v, true) });
}
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), style: {}, dataset: {}, children: [],
    width: 1380, height: 860, innerHTML: '', textContent: '', value: '',
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    getContext: () => makeCtx(),
    addEventListener: () => {}, removeEventListener: () => {}, appendChild(c) { this.children.push(c); return c; },
    removeChild: () => {}, insertBefore: c => c, setAttribute: () => {}, getAttribute: () => null,
    querySelector: () => makeEl('div'), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1380, height: 860, right: 1380, bottom: 860 }),
    focus: () => {}, remove: () => {}, cloneNode: () => makeEl(tag), closest: () => null,
  };
  return el;
}

const sandbox = {
  console, Math, JSON, Date, isNaN, parseInt, parseFloat, Uint8Array, Object, Array, String, Number, Boolean,
  setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {},
  requestAnimationFrame: () => 0, performance: { now: () => Date.now() },
  document: {
    getElementById: () => makeEl('div'), createElement: t => makeEl(t),
    addEventListener: () => {}, body: makeEl('body'), documentElement: makeEl('html'),
  },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  location: { href: 'test', reload: () => {} },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'game.js' });

const G = sandbox.GAME;
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

G.showScreen('hub');
const hub = G.uiHtml('hub');

/* ① 三组分行：出发 / 整备 / 管理 */
ok('hub 含出发组按钮', hub.indexOf('data-act="map"') >= 0 && hub.indexOf('出发搜刮') >= 0);
ok('hub 含整备组标题', hub.indexOf('— 整备 —') >= 0);
ok('hub 含管理组标题', hub.indexOf('— 管理 —') >= 0);
const acts = ['map', 'loadout', 'craft', 'skills', 'build', 'stash', 'notes', 'save', 'menu'];
let hubActs = 0;
for (const a of acts) if (hub.indexOf('data-act="' + a + '"') >= 0) hubActs++;
ok('hub 9 固定按钮 data-act 齐全', hubActs === acts.length, 'found=' + hubActs);
/* 血月按钮为条件渲染：bloodPending>0 且非当日才出现 */
G.base.bloodPending = 1; G.base.bloodDay = 0;
const hubB = G.uiHtml('hub');
ok('血月待战时出现迎战按钮', hubB.indexOf('data-act="bloodmoon"') >= 0);
G.base.bloodPending = 0;
/* 出发组在最前（主按钮在整备标题之前） */
const iMap = hub.indexOf('data-act="map"'), iLoad = hub.indexOf('data-act="loadout"');
ok('出发按钮在整备按钮之前', iMap >= 0 && iLoad > iMap);

/* ② 主线链：初始档（0 档案、无门卡） */
ok('hub 含主线进度卡', hub.indexOf('主线进度') >= 0);
ok('主线链显示档案 0/6', hub.indexOf('档案 0/6') >= 0);
ok('主线链含门卡与军事步骤', hub.indexOf('取得门卡') >= 0 && hub.indexOf('军事基地路线') >= 0);
ok('主线链含结局步骤', hub.indexOf('带档案撤离（结局）') >= 0);
/* 无档案时无步骤处于"进行中"高亮之外应全为待办（▶ 只标第一步） */
const actMarks = (hub.match(/▶ /g) || []).length;
ok('初始档只有 1 个进行中步骤', actMarks === 1, 'act=' + actMarks);
/* 占位提示注明带出机制 */
ok('主线卡注明带出机制', hub.indexOf('成功撤离带出才生效') >= 0);

/* ③ 进度推进态：伪造 6 档案 + 门卡 + 解锁 + 未结局 → 3 done + 1 act */
G.showScreen('hub');
G.base.notes = ['note1', 'note2', 'note3', 'note4', 'note5', 'note6'];
G.base.keycard = true; G.base.militaryUnlocked = true; G.base.ending = false;
const hub2 = G.uiHtml('hub');
const actMarks2 = (hub2.match(/▶ /g) || []).length;
const doneMarks2 = (hub2.match(/✓ /g) || []).length;
ok('推进档 3 步完成 + 1 步进行中', doneMarks2 === 3 && actMarks2 === 1, 'done=' + doneMarks2 + ' act=' + actMarks2);

/* ④ 结局态：4 步全 done */
G.base.ending = true;
const hub3 = G.uiHtml('hub');
const doneMarks3 = (hub3.match(/✓ /g) || []).length;
ok('结局后 4 步全完成', doneMarks3 === 4, 'done=' + doneMarks3);

/* ⑤ 选图页特色机制标签 */
G.base.notes = []; G.base.keycard = false; G.base.militaryUnlocked = false; G.base.ending = false;
G.showScreen('map');
const mapHtml = G.uiHtml('map');
ok('map 显示郊区潜行标签', mapHtml.indexOf('潜行 · 噪音传播 -45%') >= 0);
ok('map 显示商业搜刮标签', mapHtml.indexOf('搜刮 · 罕见物资 18%') >= 0);
ok('map 显示医院感染标签', mapHtml.indexOf('感染 · 伤口污染 ×1.5') >= 0);
ok('map 显示军事高压标签', mapHtml.indexOf('高压 · 稀有军械 20%') >= 0);

/* ⑥ 按钮路由不受影响：hub → map → hub */
G.showScreen('hub');
G.handleAction('map');
ok('data-act=map 路由正常', G.screen === 'map', 'screen=' + G.screen);
G.handleAction('hub');
ok('data-act=hub 路由正常', G.screen === 'hub', 'screen=' + G.screen);

console.log('PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
