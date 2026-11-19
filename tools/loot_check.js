/* 桩测试：检查建筑门格是否为 3、门洞是否 2 格宽、是否能从外走进内部 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* 自定位：游戏本体在项目根目录，本脚本在 tools/ 下，可直接 node tools/door_check.js */
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
const listeners = {};
const documentStub = {
  createElement: makeEl,
  createElementNS: (ns, t) => makeEl(t),
  getElementById: () => makeEl('div'),
  querySelector: () => makeEl('div'),
  querySelectorAll: () => [],
  body: makeEl('body'), head: makeEl('head'), documentElement: makeEl('html'),
  addEventListener: (k, f) => { (listeners[k] = listeners[k] || []).push(f); },
  removeEventListener: () => {},
  get hidden() { return false; },
};

const sandbox = {
  console, Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, parseInt, parseFloat, isNaN,
  setTimeout: (f) => 0, clearTimeout: () => {}, setInterval: (f) => 0, clearInterval: () => {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  performance: { now: () => Date.now() },
  devicePixelRatio: 1,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  navigator: { userAgent: 'node', maxTouchPoints: 0, vibrate: () => {} },
  document: documentStub,
  addEventListener: (k, f) => { (listeners[k] = listeners[k] || []).push(f); },
  removeEventListener: () => {},
  Audio: function () { return { play: () => Promise.resolve(), pause: () => {}, volume: 1 }; },
  AudioContext: function () {
    return {
      state: 'running', currentTime: 0, sampleRate: 44100, destination: {},
      resume: () => Promise.resolve(),
      createOscillator: () => ({ type: '', frequency: { value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, linearRampToValueAtTime: () => {} }, connect: () => {}, start: () => {}, stop: () => {}, onended: null }),
      createGain: () => ({ gain: { value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, linearRampToValueAtTime: () => {} }, connect: () => {} }),
      createBiquadFilter: () => ({ type: '', frequency: { value: 0, setValueAtTime: () => {} }, Q: { value: 0 }, connect: () => {} }),
      createBufferSource: () => ({ buffer: null, connect: () => {}, start: () => {}, stop: () => {} }),
      createBuffer: (ch, len, sr) => ({ getChannelData: () => new Float32Array(len), length: len, numberOfChannels: ch, sampleRate: sr }),
      createDynamicsCompressor: () => ({ threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect: () => {} }),
    };
  },
  Image: function () { return { onload: null, src: '', width: 0, height: 0 }; },
  innerWidth: 1380, innerHeight: 860,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

const ctx = vm.createContext(sandbox);
try {
  vm.runInContext(code, ctx, { filename: 'DeadExtraction.html' });
} catch (e) {
  console.log('LOAD ERR:', e.message);
  console.log(e.stack.split('\n').slice(0, 4).join('\n'));
  process.exit(1);
}
const GAME = sandbox.GAME || (sandbox.window && sandbox.window.GAME);
if (!GAME) { console.log('NO GAME INTERFACE'); process.exit(1); }

const MAPID = Object.keys(GAME.MAPS)[0];
try { GAME.newGame(); } catch (e) { console.log('newGame err', e.message); }
if (!GAME.base) { console.log('NO BASE'); process.exit(1); }
console.log('mapId=', MAPID, 'base ok');


let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL: ' + name + (extra ? ' | ' + extra : '')); } }

/* 1) 搜刮后必须先进入结算面板，且此时背包不变 */
GAME.startRaid(MAPID);
let raid = GAME.raid;
const bagCountBefore = raid.p.bag.slots.reduce((a, s) => a + (s ? s.qty : 0), 0);
const target = raid.map.containers.find(c => c.loot && c.loot.length);
ok('地图上存在有货容器', !!target);
GAME.lootContainer(target);
ok('搜刮后进入 lootResult 面板', GAME.screen === 'lootResult', 'screen=' + GAME.screen);
const pl = shadowPending();
ok('面板数据存在', !!pl);
const bagCountMid = raid.p.bag.slots.reduce((a, s) => a + (s ? s.qty : 0), 0);
ok('确认前背包不变', bagCountMid === bagCountBefore, bagCountBefore + ' -> ' + bagCountMid);
ok('结算清单非空（该容器有货）', pl && pl.rows.length > 0, JSON.stringify(pl && pl.rows));
ok('清单数量均为正', (pl ? pl.rows.every(r => r.qty > 0) : false));

/* 2) 面板渲染文字包含物品名与数量 */
GAME.showScreen('lootResult');
const htmlTxt = (() => { try { return (sandbox.document.getElementById() && '') || ''; } catch (e) { return ''; } })();
const panelHtml = GAME.uiHtml('lootResult');
ok('面板含标题', panelHtml.indexOf('搜 刮 结 算') >= 0);
ok('面板含确认按钮', panelHtml.indexOf('loot_ok') >= 0);
if (pl && pl.rows.length) ok('面板显示数量 x' + pl.rows[0].qty, panelHtml.indexOf('x' + pl.rows[0].qty) >= 0);

/* 3) 确认后回到 raid，物品入包 */
GAME.handleAction('loot_ok');
ok('确认后回到 raid', GAME.screen === 'raid', 'screen=' + GAME.screen);
const bagCountAfter = raid.p.bag.slots.reduce((a, s) => a + (s ? s.qty : 0), 0);
ok('确认后背包增加', bagCountAfter > bagCountBefore, bagCountBefore + ' -> ' + bagCountAfter);
ok('容器已被搜空或残留不可入包部分', Array.isArray(target.loot));
ok('pendingLoot 已清空', !shadowPending());

/* 4) 背包已满时仍显示面板，给出「放在容器里」提示且不入包 */
GAME.startRaid(MAPID);
raid = GAME.raid;
for (let i = 0; i < raid.p.bag.slots.length; i++) raid.p.bag.slots[i] = { id: 'scrap', qty: 8 };
const full = raid.p.bag.slots.reduce((a, s) => a + s.qty, 0);
const c2 = raid.map.containers.find(c => c.loot && c.loot.every(l => !(GAME.ITEMS[l.id] && (GAME.ITEMS[l.id].t === 'key' || GAME.ITEMS[l.id].t === 'note'))) && c.loot.length);
if (c2) {
  GAME.lootContainer(c2);
  ok('背包满：仍弹结算面板', GAME.screen === 'lootResult', 'screen=' + GAME.screen);
  const pl2 = shadowPending();
  ok('背包满：清单为空且有遗留提示数据', pl2 && pl2.rows.length === 0 && pl2.left.length > 0, JSON.stringify(pl2 && { rows: pl2.rows.length, left: pl2.left.length }));
  const html2 = GAME.uiHtml('lootResult');
  ok('背包满：面板提示放不下', html2.indexOf('什么都没能带走') >= 0);
  GAME.handleAction('loot_ok');
  const fullAfter = raid.p.bag.slots.reduce((a, s) => a + s.qty, 0);
  ok('背包满：确认后仍未超重', fullAfter === full, full + ' -> ' + fullAfter);
  ok('背包满：物资留在容器里', c2.loot.length > 0);
} else { console.log('skip full-bag case'); }

/* 5) 关键物品（门卡/档案）确认后生效 */
GAME.startRaid(MAPID);
raid = GAME.raid;
let keyC = null;
for (const c of raid.map.containers) if (c.loot && c.loot.some(l => GAME.ITEMS[l.id] && GAME.ITEMS[l.id].t === 'key')) { keyC = c; break; }
if (keyC) {
  GAME.base.keycard = false; GAME.base.militaryUnlocked = false;
  GAME.lootContainer(keyC);
  const pl3 = shadowPending();
  ok('关键物品出现在清单并标记', pl3 && pl3.rows.some(r => r.kind === 'key'));
  ok('确认前不生效', GAME.base.keycard === false);
  GAME.handleAction('loot_ok');
  ok('确认后门卡生效', GAME.base.keycard === true && GAME.base.militaryUnlocked === true);
} else { console.log('skip key case'); }

/* 6) 未搜刮时不误弹面板 */
GAME.startRaid(MAPID);
GAME.showScreen('raid');
GAME.handleAction('loot_ok');
ok('无待确认数据时 loot_ok 不崩溃且回到 raid', GAME.screen === 'raid', 'screen=' + GAME.screen);

function shadowPending() { return GAME.pendingLoot || null; }


/* 7) 关键物品与档案：伪造容器验证清单标记与确认生效 */
GAME.startRaid(MAPID);
raid = GAME.raid;
GAME.base.keycard = false; GAME.base.militaryUnlocked = false;
if (!Array.isArray(GAME.base.notes)) GAME.base.notes = [];
const fakeC = { x: 1, y: 1, type: 'crate', prog: 0, loot: [{ id: 'keycard', qty: 1 }, { id: 'note1', qty: 1 }, { id: 'scrap', qty: 5 }] };
raid.map.containers.push(fakeC);
GAME.lootContainer(fakeC);
const pk = GAME.pendingLoot;
ok('清单含关键标记', pk && pk.rows.some(r => r.kind === 'key'));
ok('清单含档案标记', pk && pk.rows.some(r => r.kind === 'note'));
ok('确认前门卡未生效', GAME.base.keycard === false);
const html3 = GAME.uiHtml('lootResult');
ok('面板标注关键/档案', html3.indexOf('关键') >= 0 && html3.indexOf('档案') >= 0);
GAME.handleAction('loot_ok');
ok('确认后门卡生效', GAME.base.keycard === true && GAME.base.militaryUnlocked === true);
ok('确认后档案归档', GAME.base.notes.indexOf('note1') >= 0);

console.log('PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
