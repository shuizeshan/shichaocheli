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
function ok(name, cond, extra) {
  if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name + (extra ? ' | ' + extra : '')); }
}

let totalDoors = 0, doorsWidth2 = 0, doorsBadTile = 0, rooms = 0, unreachable = 0;
for (let run = 0; run < 6; run++) {
  GAME.startRaid(MAPID);
  const raid = GAME.raid;
  const m = raid.map;
  const TILE = GAME.TILE, MAPW = GAME.MAPW;
  const tget = (x, y) => m.tiles[y * MAPW + x];
  rooms += m.buildings.length;
  for (const b of m.buildings) {
    totalDoors += b.doors.length;
    for (const d of b.doors) {
      if (tget(d.x, d.y) !== 3) doorsBadTile++;
      const sp = d.span;
      if (sp && ((sp.x2 - sp.x1 + 1) === 2 || (sp.y2 - sp.y1 + 1) === 2)) doorsWidth2++;
      /* BFS：从门洞中心出发能否走到建筑内部中心 */
      const startX = d.x, startY = d.y;
      const goalX = b.x + Math.floor(b.w / 2), goalY = b.y + Math.floor(b.h / 2);
      const seen = new Set([startX + ',' + startY]);
      const q = [[startX, startY]];
      let found = false;
      while (q.length) {
        const [cx, cy] = q.shift();
        if (cx === goalX && cy === goalY) { found = true; break; }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= MAPW || ny >= (m.tiles.length / MAPW)) continue;
          const k = nx + ',' + ny;
          if (seen.has(k)) continue;
          if (tget(nx, ny) === 2) continue;
          seen.add(k); q.push([nx, ny]);
        }
      }
      if (!found) { unreachable++; console.log('  不可达门:', JSON.stringify({b:{x:b.x,y:b.y,w:b.w,h:b.h},door:{x:d.x,y:d.y,span:d.span,dir:d.dir}})); }
    }
  }
}
console.log(`建筑数=${rooms} 门数=${totalDoors} 两格宽门=${doorsWidth2} 非3门格=${doorsBadTile} 门无法到内部=${unreachable}`);
ok('所有门格 tile=3', doorsBadTile === 0, '异常=' + doorsBadTile);
ok('门洞均为 2 格宽', doorsWidth2 === totalDoors, `${doorsWidth2}/${totalDoors}`);
ok('门可走到内部', unreachable === 0, '不可达=' + unreachable);

/* 真实走位：从门外正对门洞走进去，记录是否 visited */
function walkIn() {
  GAME.startRaid(MAPID);
  const raid = GAME.raid;
  const m = raid.map;
  const TILE = GAME.TILE;
  const b = m.buildings[0];
  const d = b.doors[0];
  const sp = d.span || { x1: d.x, x2: d.x, y1: d.y, y2: d.y };
  const vert = d.dir ? (d.dir.y !== 0) : (sp.y1 === sp.y2);
  const cx = (sp.x1 + sp.x2 + 1) / 2 * TILE;
  const cy = (sp.y1 + sp.y2 + 1) / 2 * TILE;
  const dir = d.dir || { x: 0, y: 1 };
  const p = raid.p;
  /* 放到门外 2.5 格，并刻意侧向偏移 18px 测试容错 */
  if (vert) { p.x = cx + 18; p.y = cy - dir.y * TILE * 2.5; }
  else { p.x = cx - dir.x * TILE * 2.5; p.y = cy + 18; }
  const keys = GAME.keys;
  for (const k of Object.keys(keys)) keys[k] = false;
  if (vert) keys[dir.y > 0 ? 's' : 'w'] = true; else keys[dir.x > 0 ? 'd' : 'a'] = true;
  for (let i = 0; i < 140; i++) GAME.step(1 / 60);
  for (const k of Object.keys(keys)) keys[k] = false;
  return { visited: !!b.visited, px: p.x, py: p.y, tx: Math.floor(p.x / TILE), ty: Math.floor(p.y / TILE), bx: b.x, by: b.y, bw: b.w, bh: b.h };
}
let walkOk = 0, tries = 8;
for (let i = 0; i < tries; i++) {
  const r = walkIn();
  if (r.visited) walkOk++;
  else console.log('  走位失败:', JSON.stringify(r));
}
ok('偏移 18px 也能走进建筑', walkOk >= tries - 1, `成功 ${walkOk}/${tries}`);

console.log(`\n结果: PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
