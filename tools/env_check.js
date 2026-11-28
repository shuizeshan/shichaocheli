/* 探针：验证四图环境机制真实生效
   ① city 容器出现 uncommon 物品 ② military 出现 rare 物品
   ③ hospital 受伤感染 > suburb ④ suburb 噪音传播 < 军事 */
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
  window: { addEventListener: () => {}, location: { href: 'test' }, requestAnimationFrame: () => 0 },
  navigator: { userAgent: 'probe' },
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

const UNCOMMON = ['chem', 'elec', 'medkit', 'ammo12', 'water', 'tool'];
const RARE = ['rifle', 'vest', 'serum', 'anti', 'helmet', 'ammo762'];

/* ① city：开 40 张图，统计含 uncommon 物品的容器比例（期望 > 25%） */
let cityHits = 0, cityTotal = 0;
for (let i = 0; i < 40; i++) {
  G.startRaid('city');
  const cs = G.raid.map.containers;
  for (const c of cs) {
    if (!c.loot || !c.loot.length) continue;
    cityTotal++;
    if (c.loot.some(l => UNCOMMON.includes(l.id))) cityHits++;
  }
}
const cityPct = Math.round(cityHits / Math.max(1, cityTotal) * 1000) / 10;
ok('city uncommon 覆盖率 > 25%', cityPct > 25, cityPct + '%');

/* ② military：开 40 张图，统计含 rare 物品的容器比例（期望 > 15%） */
let milHits = 0, milTotal = 0;
for (let i = 0; i < 40; i++) {
  G.startRaid('military');
  const cs = G.raid.map.containers;
  for (const c of cs) {
    if (!c.loot || !c.loot.length) continue;
    milTotal++;
    if (c.loot.some(l => RARE.includes(l.id))) milHits++;
  }
}
const milPct = Math.round(milHits / Math.max(1, milTotal) * 1000) / 10;
ok('military rare 覆盖率 > 15%', milPct > 15, milPct + '%');

/* ③ suburb 对照：uncommon 覆盖率应明显低于 city（无 uncommonChance） */
let subHits = 0, subTotal = 0;
for (let i = 0; i < 40; i++) {
  G.startRaid('suburb');
  const cs = G.raid.map.containers;
  for (const c of cs) {
    if (!c.loot || !c.loot.length) continue;
    subTotal++;
    if (c.loot.some(l => UNCOMMON.includes(l.id))) subHits++;
  }
}
const subPct = Math.round(subHits / Math.max(1, subTotal) * 1000) / 10;
ok('suburb uncommon 覆盖率低于 city', subPct < cityPct, 'suburb ' + subPct + '% vs city ' + cityPct + '%');

/* ④ noiseMul 配置存在且郊区 < 1 < 军事 */
ok('suburb noiseMul=0.55', G.MAPS.suburb.noiseMul === 0.55);
ok('military noiseMul=1.25', G.MAPS.military.noiseMul === 1.25);
ok('suburb spawnGap=30', G.MAPS.suburb.spawnGap === 30);
ok('hospital infectMul=1.5', G.MAPS.hospital.infectMul === 1.5);
ok('city uncommonChance=0.18', G.MAPS.city.uncommonChance === 0.18);
ok('military rareChance=0.2', G.MAPS.military.rareChance === 0.2);

console.log('PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
