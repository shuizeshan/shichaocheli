/* 探针：阶段4 失败复盘 + 结局专页
   ① 阵亡 result 含死因/丢失物/建议 ② 丢失关键物品有警示
   ③ 超时死因分支 ④ UI.ending 专页演出+统计 ⑤ hub/result 的结局入口路由 */
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

/* ① 阵亡复盘：带物品进局 → 模拟被暴君击杀 */
G.newGame();
G.showScreen('hub');
G.startRaid('city');
let raid = G.raid;
/* 伪造背包物品与死因来源 */
G.bagAdd(raid.p.bag, 'medkit', 2);
G.bagAdd(raid.p.bag, 'ammo9', 12);
raid.p.lastHitBy = '暴君';
G.endRaid(false);
const res = raid.result;
ok('阵亡 result 含死因 killer', res && res.killer === '暴君', JSON.stringify(res && res.killer));
ok('阵亡 result 含丢失物清单', res && Array.isArray(res.lost) && res.lost.length >= 2, JSON.stringify(res && res.lost));
ok('阵亡 result 含建议 tips', res && Array.isArray(res.tips) && res.tips.some(t => t.indexOf('暴君') >= 0));
const resHtml = G.uiHtml('result');
ok('result 显示失败复盘卡', resHtml.indexOf('失败复盘') >= 0);
ok('result 显示死因「暴君」', resHtml.indexOf('暴君') >= 0);
ok('result 显示丢失物资', resHtml.indexOf('丢失物资') >= 0 && resHtml.indexOf('急救包') >= 0);
ok('无关键物品时不显示警示', resHtml.indexOf('丢失了剧情关键物品') < 0);

/* ② 关键物品丢失警示：背包放档案再阵亡 */
G.newGame(); G.showScreen('hub');
G.startRaid('city');
raid = G.raid;
G.bagAdd(raid.p.bag, 'note1', 1);
raid.p.lastHitBy = '跑步丧尸';
G.endRaid(false);
const res2Html = G.uiHtml('result');
ok('关键物品丢失显示警示', res2Html.indexOf('丢失了剧情关键物品') >= 0);
ok('跑步丧尸死因与建议匹配', res2Html.indexOf('跑步丧尸') >= 0 && res2Html.indexOf('高速单位') >= 0);

/* ③ 超时分支 */
G.newGame(); G.showScreen('hub');
G.startRaid('city');
raid = G.raid;
raid.timeout = true;
G.endRaid(false);
const res3 = raid.result;
ok('超时死因标记 timeout', res3 && res3.reason === 'timeout');
const res3Html = G.uiHtml('result');
ok('超时显示撤离窗口关闭与建议', res3Html.indexOf('撤离窗口关闭') >= 0 && res3Html.indexOf('撤离窗口关闭：开局先确认撤离点方位') >= 0);

/* ④ 结局专页 */
G.base.ending = true; G.base.endingDay = 9;
G.base.raids = 12; G.base.extracts = 8; G.base.deaths = 4; G.base.totalKills = 66;
G.base.notes = ['note1', 'note2', 'note3', 'note4', 'note5', 'note6'];
const endHtml = G.uiHtml('ending');
ok('结局专页含演出文案', endHtml.indexOf('结 局 · 起 飞') >= 0 && endHtml.indexOf('六份档案登上了机舱') >= 0);
ok('结局专页含结局天数', endHtml.indexOf('第 9 天') >= 0);
ok('结局专页含全程统计', endHtml.indexOf('存活天数 9 天') >= 0 && endHtml.indexOf('累计击杀 66') >= 0);
ok('结局专页含撤离率', endHtml.indexOf('（67%）') >= 0);
ok('结局专页含继续游玩按钮', endHtml.indexOf('data-act="hub"') >= 0 && endHtml.indexOf('继续游玩') >= 0);
ok('结局专页含返回主菜单', endHtml.indexOf('data-act="menu"') >= 0);

/* ⑤ 结局入口路由：result 优先展示结局按钮；hub 管理组出现结局按钮 */
const resEndHtml = G.uiHtml('result');
ok('结局后 result 按钮改为查看结局专页', resEndHtml.indexOf('data-act="ending"') >= 0);
G.showScreen('hub');
const hubEnd = G.uiHtml('hub');
ok('结局后 hub 管理组含结局按钮', hubEnd.indexOf('data-act="ending"') >= 0);
G.handleAction('ending');
ok('ending 路由正常', G.screen === 'ending', 'screen=' + G.screen);

/* ⑥ 未结局时不显示入口 */
G.base.ending = false;
G.showScreen('hub');
const hubNoEnd = G.uiHtml('hub');
ok('未结局 hub 无结局按钮', hubNoEnd.indexOf('data-act="ending"') < 0);
G.showScreen('result');
const resNoEnd = G.uiHtml('result');
ok('未结局 result 无结局专页按钮', resNoEnd.indexOf('data-act="ending"') < 0);

console.log('PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
