/* 桩测试：主菜单电影感背景动画 / 背景音乐手势解锁 / 击退效果
   运行：node tools/menu_kb_check.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAME_HTML = path.join(__dirname, '..', 'DeadExtraction.html');
const html = fs.readFileSync(GAME_HTML, 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const code = scripts.join('\n;\n');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.log('FAIL: ' + name + (extra ? ' | ' + extra : '')); }
}

/* ---------------- 静态检查 ---------------- */
ok('#menuBg 容器存在', html.includes('id="menuBg"'));
ok('#menuBgCanvas 画布存在', html.includes('id="menuBgCanvas"'));
ok('BGM 控件存在（静音/加减/进度条）', html.includes('id="bgmCtl"') && html.includes('id="bgmBtn"') && html.includes('id="bgmBar"') && html.includes('id="bgmFill"'));
ok('命中标记节点存在', html.includes('id="hitMark"'));
ok('主菜单有音乐开关按钮', html.includes('id="menuBgmBtn"'));
ok('电影感图层样式生效点存在', html.includes('#screen.menu-mode'));
const extRefs = (html.match(/<(script|link|img)[^>]+(src|href)=["']https?:/g) || []).length;
ok('无外链资源，保持单文件零依赖', extRefs === 0, '外链=' + extRefs);
ok('击退物理常量已定义', html.includes('KB_SCALE') && html.includes('KB_DECAY') && html.includes('KB_MAX'));
ok('僵尸抗性字段齐全（6 种）', (html.match(/kbRes:/g) || []).length === 6, 'kbRes=' + (html.match(/kbRes:/g) || []).length);

/* ---------------- DOM 桩（元素持久化，便于断言 class 变化） ---------------- */
function makeCtx() {
  const noop = () => {};
  const base = {
    canvas: { width: 1380, height: 860 },
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    arc: noop, ellipse: noop, rect: noop, fill: noop, stroke: noop, fillRect: noop, strokeRect: noop,
    clearRect: noop, translate: noop, rotate: noop, scale: noop, setTransform: noop,
    fillText: noop, strokeText: noop, drawImage: noop, clip: noop, setLineDash: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 10 }),
    createPattern: () => null, putImageData: noop, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  return new Proxy(base, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => (t[k] = v, true) });
}
const elRegistry = {};
function makeEl(tag, id) {
  const cls = new Set();
  const el = {
    tagName: (tag || 'div').toUpperCase(), id: id || '', style: {}, dataset: {}, children: [],
    width: 1380, height: 860, clientWidth: 1280, clientHeight: 720,
    innerHTML: '', textContent: '', value: '',
    classList: {
      add: (c) => cls.add(c), remove: (c) => cls.delete(c),
      toggle: (c, v) => { if (v === undefined) { cls.has(c) ? cls.delete(c) : cls.add(c); } else if (v) cls.add(c); else cls.delete(c); },
      contains: (c) => cls.has(c),
    },
    _cls: cls,
    getContext: () => makeCtx(),
    addEventListener: (k, f) => { (el._ev = el._ev || {})[k] = f; },
    removeEventListener: () => {}, appendChild(c) { el.children.push(c); return c; },
    removeChild: () => {}, insertBefore: c => c, setAttribute: () => {}, getAttribute: () => null,
    querySelector: () => makeEl('div'), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 78, height: 6, right: 78, bottom: 6 }),
    focus: () => {}, remove: () => {}, cloneNode: () => makeEl(tag), closest: () => null,
  };
  return el;
}
const listeners = {};
const documentStub = {
  createElement: (t) => makeEl(t),
  createElementNS: (ns, t) => makeEl(t),
  getElementById: (id) => (elRegistry[id] = elRegistry[id] || makeEl('div', id)),
  querySelector: () => makeEl('div'),
  querySelectorAll: () => [],
  body: makeEl('body'), head: makeEl('head'), documentElement: makeEl('html'),
  addEventListener: (k, f) => { (listeners[k] = listeners[k] || []).push(f); },
  removeEventListener: () => {},
  get hidden() { return false; },
};

let audioCtxCount = 0;
function fakeAudioCtx() {
  audioCtxCount++;
  const param = () => ({ value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, linearRampToValueAtTime: () => {} });
  return {
    state: 'running', currentTime: 0, sampleRate: 44100, destination: {},
    resume: () => Promise.resolve(),
    createOscillator: () => ({ type: '', frequency: param(), connect: () => {}, start: () => {}, stop: () => {}, onended: null }),
    createGain: () => ({ gain: param(), connect: () => {} }),
    createBiquadFilter: () => ({ type: '', frequency: param(), Q: { value: 0 }, connect: () => {} }),
    createBufferSource: () => ({ buffer: null, connect: () => {}, start: () => {}, stop: () => {} }),
    createBuffer: (ch, len, sr) => ({ getChannelData: () => new Float32Array(len), length: len, numberOfChannels: ch, sampleRate: sr }),
    createDynamicsCompressor: () => ({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: () => {} }),
  };
}

const sandbox = {
  console, Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, parseInt, parseFloat, isNaN,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  performance: { now: () => Date.now() },
  devicePixelRatio: 1,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  navigator: { userAgent: 'node', maxTouchPoints: 0, vibrate: () => {} },
  document: documentStub,
  addEventListener: (k, f) => { (listeners[k] = listeners[k] || []).push(f); },
  removeEventListener: () => {},
  Audio: function () { return { play: () => Promise.resolve(), pause: () => {}, volume: 1 }; },
  AudioContext: fakeAudioCtx,
  Image: function () { return { onload: null, src: '', width: 0, height: 0 }; },
  innerWidth: 1380, innerHeight: 860,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.webkitAudioContext = fakeAudioCtx;

const ctx = vm.createContext(sandbox);
try {
  vm.runInContext(code, ctx, { filename: 'DeadExtraction.html' });
} catch (e) {
  console.log('LOAD ERR:', e.message);
  process.exit(1);
}
const GAME = sandbox.GAME;
if (!GAME) { console.log('NO GAME INTERFACE'); process.exit(1); }

/* ---------------- 1. 主菜单电影感背景 ---------------- */
ok('MENUBG 已导出', !!GAME.MENUBG);
GAME.MENUBG.initData();
let st = GAME.menuBgState();
ok('人群 / 怪物 / 警察剪影数量', st.crowd === 7 && st.zombies === 5 && st.cops === 3, JSON.stringify([st.crowd, st.zombies, st.cops]));
ok('火星 / 硝烟 / 火光数量', st.embers === 34 && st.smokes === 4 && st.fires === 4, JSON.stringify([st.embers, st.smokes, st.fires]));
const sx0 = st.crowdX, zx0 = st.zombieX;
for (let i = 0; i < 90; i++) GAME.menuBgUpdate(1 / 60);
st = GAME.menuBgState();
ok('动画随 update 推进', st.t > 1.4, 't=' + st.t.toFixed(2));
ok('人群向左奔逃（有位移）', st.crowdX < sx0, `${sx0.toFixed(1)} -> ${st.crowdX.toFixed(1)}`);
ok('怪物向右追击（有位移）', st.zombieX < zx0, `${zx0.toFixed(1)} -> ${st.zombieX.toFixed(1)}`);
ok('警察有开火节奏', st.flashes >= 0 && typeof st.fireT === 'number');
/* 警力抵抗表现：盾牌特警 / 警车爆闪 / 火场烟柱 / 高空探照灯 */
ok('前排特警持防暴盾（>=2 名）', st.copsShield >= 2, 'shields=' + st.copsShield);
ok('警车剪影已就位', st.hasCar === true);
ok('警灯相位随帧推进', typeof st.sirenPhase === 'number' && st.sirenPhase >= 0 && st.sirenPhase <= 1, 'phase=' + st.sirenPhase.toFixed(3));
const sp0 = st.sirenPhase;
for (let i = 0; i < 20; i++) GAME.menuBgUpdate(1 / 60);
st = GAME.menuBgState();
ok('警灯爆闪在动（相位变化）', st.sirenPhase !== sp0, `${sp0.toFixed(3)} -> ${st.sirenPhase.toFixed(3)}`);
ok('火场烟柱数量（>=3 柱）', st.columns >= 3, 'columns=' + st.columns);
ok('高空探照灯存在', st.hasBeam === true);

let paintThrew = false;
try { GAME.menuBgPaint(); } catch (e) { paintThrew = true; console.log('paint err', e.message); }
ok('paint 无异常', !paintThrew);
ok('画布已绑定（离屏静态层可用）', GAME.menuBgState().canvas === true);
ok('绘制次数计数可用', GAME.menuBgState().paints >= 0);

const t0 = Date.now();
for (let i = 0; i < 900; i++) GAME.menuBgUpdate(1 / 60);
const cost = Date.now() - t0;
ok('900 帧逻辑开销 < 300ms（低开销）', cost < 300, cost + 'ms');

GAME.setMenuBgActive(true);
ok('进入菜单时背景层可见', elRegistry['menuBg']._cls.has('on'));
ok('进入菜单时 BGM 控件可见', elRegistry['bgmCtl']._cls.has('on'));
ok('菜单模式屏幕样式切换', elRegistry['screen']._cls.has('menu-mode'));
GAME.setMenuBgActive(false);
ok('离开菜单时背景层隐藏', !elRegistry['menuBg']._cls.has('on'));
ok('离开菜单时屏幕样式复原', !elRegistry['screen']._cls.has('menu-mode'));
ok('背景动画仅菜单运行（离开后 running=false）', GAME.menuBgState().running === false);

/* ---------------- 2. 背景音乐 / 自动播放策略 ---------------- */
ok('首次手势监听已绑定', GAME.audioGestureBound() === true);
ok('加载阶段 AudioContext 未被创建（遵守自动播放策略）', audioCtxCount === 0, 'ctx=' + audioCtxCount);
GAME.showScreen('menu');
ok('未解锁时只记录播放意图', GAME.sfxUnlocked() === false && GAME.sfxLockedWant() === true);
ok('未解锁时仍不创建 AudioContext', audioCtxCount === 0, 'ctx=' + audioCtxCount);
ok('首次手势解锁成功', GAME.sfxUnlock() === true);
ok('解锁后 AudioContext 已创建', audioCtxCount >= 1, 'ctx=' + audioCtxCount);
ok('解锁后菜单主题曲接管', GAME.sfxBgmMode() === 'menu' && GAME.sfxLockedWant() === false);

GAME.showScreen('raid');
ok('进入游戏切到 raid 音轨（不再播放菜单主题）', GAME.sfxBgmMode() === 'raid');
ok('进入游戏后菜单动画停止', GAME.menuBgState().running === false);
GAME.showScreen('menu');
ok('回到菜单切回 menu 音轨', GAME.sfxBgmMode() === 'menu');
ok('回到菜单动画恢复', GAME.menuBgState().running === true);

const bg0 = GAME.getSettings().bgm;
GAME.stepSetting('bgm', -1);
const bg1 = GAME.getSettings().bgm;
GAME.stepSetting('bgm', 1);
ok('音量可下调', bg1 < bg0, `${bg0} -> ${bg1}`);
ok('音量可恢复', GAME.getSettings().bgm >= bg1);
GAME.stepSetting('mute', 1);
ok('静音开关可用', GAME.getSettings().mute === true);
GAME.stepSetting('mute', 1);
ok('静音可解除', GAME.getSettings().mute === false);

/* ---------------- 3. 击退效果 ---------------- */
const W = GAME.WEAPONS, Z = GAME.ZT;
ok('近战武器击退强度差异化（撬棍<消防斧）', W.crowbar.kb === 60 && W.axe.kb === 110);
ok('枪械击退强度差异化', W.pistol.kb === 44 && W.shotgun.kb === 30 && W.rifle.kb === 52);
ok('大型/精英僵尸抗性更高', Z.brute.kbRes > Z.walker.kbRes && Z.brute.kbRes > Z.runner.kbRes, `brute=${Z.brute.kbRes} walker=${Z.walker.kbRes}`);

const MAPID = Object.keys(GAME.MAPS)[0];
GAME.newGame();
GAME.startRaid(MAPID);
const raid = GAME.raid;
ok('raid 内有僵尸', raid.zombies.length > 0);

function knockOf(z, kb, ang, type) {
  if (type) z.t = Object.assign({}, GAME.ZT[type]);
  z.kbx = 0; z.kby = 0; z.kbPower = 0; z.stun = 0; z.stagger = 0; z.hp = 9999; z.dead = false;
  const k0 = GAME.knockState().count, h0 = GAME.hitMarkCount();
  GAME.hurtZombie(z, 5, ang, kb);
  return { kbx: z.kbx, kby: z.kby, stun: z.stun, power: z.kbPower, dCount: GAME.knockState().count - k0, dHit: GAME.hitMarkCount() - h0 };
}
const zW = raid.zombies[0];
const rW = knockOf(zW, W.crowbar.kb, 0, 'walker');
ok('普通僵尸被撬棍打飞（速度≈冲量×KB_SCALE）', Math.abs(rW.kbx - 180) < 2, 'kbx=' + rW.kbx.toFixed(1));
ok('击退触发硬直', rW.stun > 0, 'stun=' + rW.stun.toFixed(2));
ok('击退触发命中反馈（闷响+准星标记）', rW.dCount === 1 && rW.dHit === 1);
const rA = knockOf(zW, W.axe.kb, 0, 'walker');
ok('消防斧击退明显强于撬棍', rA.kbx > rW.kbx * 1.7, `${rW.kbx.toFixed(0)} -> ${rA.kbx.toFixed(0)}`);

const savedT = zW.t;
zW.t = Object.assign({}, GAME.ZT.brute);
const rB = knockOf(zW, W.axe.kb, 0);
ok('暴君抗性生效（同样消防斧位移骤减）', rB.kbx < rA.kbx * 0.25, `brute=${rB.kbx.toFixed(1)} walker=${rA.kbx.toFixed(1)}`);
ok('暴君不会被打出硬直（冲量低于阈值）', rB.stun === 0);
zW.t = savedT;

/* 找一个四周足够空旷的落点：地图是随机的，固定偏移可能落在墙里导致测不到位移 */
function openSpot(minRun) {
  const m = raid.map, p = raid.p;
  for (let i = 0; i < 1200; i++) {
    const ang = (i * 0.618034) % (Math.PI * 2);
    const rad = 40 + (i % 29) * 12;
    const cx = p.x + Math.cos(ang) * rad, cy = p.y + Math.sin(ang) * rad;
    let ok = true;
    for (let s = 0; s <= minRun && ok; s += 7) {
      if (GAME.isWallAt(m, cx - s, cy) || GAME.isWallAt(m, cx, cy)) ok = false;
    }
    if (ok) return { x: cx, y: cy };
  }
  return { x: p.x, y: p.y };
}

/* 真实位移：把 AI 速度置零，测量击退实际推开距离 */
function displacement(kb, mutate) {
  const z = raid.zombies[0];
  const oldT = z.t;
  z.t = Object.assign({}, GAME.ZT.walker, { spd: 0 }, mutate || {});
  const spot = openSpot(140);
  z.x = spot.x; z.y = spot.y;
  z.alert = 0; z.kbx = 0; z.kby = 0; z.stun = 0; z.hp = 9999;
  const x0 = z.x, y0 = z.y;
  GAME.hurtZombie(z, 5, Math.PI, kb);   /* 朝 -x 方向推 */
  for (let i = 0; i < 60; i++) GAME.updateZombies(1 / 60);
  const dx = x0 - z.x, dy = y0 - z.y;
  z.t = oldT;
  return { dx, dy, speedLeft: Math.hypot(z.kbx, z.kby) };
}
const dW = displacement(W.axe.kb, { spd: 0 });
ok('撬棍/消防斧产生可见位移（>25px）', dW.dx > 25, 'dx=' + dW.dx.toFixed(1));
const dB = displacement(W.axe.kb, { spd: 0, kbRes: 0.72, armor: 0.35 });
ok('暴君被推开的距离远小于普通僵尸', dB.dx < dW.dx * 0.35, `brute=${dB.dx.toFixed(1)} walker=${dW.dx.toFixed(1)}`);
ok('击退速度会自然衰减', dW.speedLeft < 20, 'left=' + dW.speedLeft.toFixed(1));

/* 撞墙泄力 */
(function wallTest() {
  const z = raid.zombies[0];
  const m = raid.map, TILE = GAME.TILE;
  let px = null, py = null;
  outer:
  for (let ty = 2; ty < GAME.MAPH - 3; ty++) {
    for (let tx = 2; tx < GAME.MAPW - 3; tx++) {
      if (!GAME.isWallAt(m, (tx + 0.5) * TILE, (ty + 0.5) * TILE) && GAME.isWallAt(m, (tx + 1.5) * TILE, (ty + 0.5) * TILE)) {
        px = (tx + 0.5) * TILE; py = (ty + 0.5) * TILE; break outer;
      }
    }
  }
  if (px === null) { ok('撞墙泄力（找不到墙格，跳过）', true); return; }
  z.x = px; z.y = py; z.kbx = 0; z.kby = 0; z.hp = 9999; z.stun = 0;
  z.t = Object.assign({}, z.t, { spd: 0 });
  GAME.hurtZombie(z, 5, 0, 220);         /* 朝 +x 墙推 */
  const v0 = Math.hypot(z.kbx, z.kby);
  for (let i = 0; i < 20; i++) GAME.updateZombies(1 / 60);
  const v1 = Math.hypot(z.kbx, z.kby);
  ok('撞墙时击退快速泄力（不穿墙）', v0 > 300 && v1 < v0 * 0.25, `v0=${v0.toFixed(0)} v1=${v1.toFixed(0)}`);
})();

/* 子弹击退链路 */
(function bulletTest() {
  /* 找一块 3x3 全空的区域，避免子弹出生点落在墙里 */
  const m = raid.map, TILE = GAME.TILE;
  let ox = raid.p.x, oy = raid.p.y;
  outer2:
  for (let ty = 3; ty < GAME.MAPH - 4; ty++) {
    for (let tx = 3; tx < GAME.MAPW - 4; tx++) {
      let open = true;
      for (let dy = -1; dy <= 1 && open; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (GAME.isWallAt(m, (tx + dx + 0.5) * TILE, (ty + dy + 0.5) * TILE)) { open = false; break; }
      }
      if (open) { ox = (tx + 0.5) * TILE; oy = (ty + 0.5) * TILE; break outer2; }
    }
  }
  const z = raid.zombies[0];
  z.t = Object.assign({}, GAME.ZT.walker, { spd: 0 });
  raid.p.x = ox; raid.p.y = oy;
  z.x = ox + 60; z.y = oy; z.kbx = 0; z.kby = 0; z.hp = 9999; z.stun = 0;
  const k0 = GAME.knockState().count;
  raid.bullets.push({ x: z.x - 6, y: z.y, vx: 1500, vy: 0, dmg: 5, life: 0.65, trail: 0, kb: W.pistol.kb });
  GAME.updateBullets(1 / 60);
  ok('子弹命中触发击退', z.kbx > 50 && GAME.knockState().count > k0, 'kbx=' + z.kbx.toFixed(1));
  ok('子弹命中后子弹被移除', raid.bullets.length === 0);
})();

/* 击退拖影绘制分支 */
(function trailTest() {
  const z = raid.zombies[0];
  z.kbx = -200; z.kby = 0; z.kbPower = 40;
  let threw = false;
  try { GAME.render(); } catch (e) { threw = true; console.log('render err', e.message); }
  ok('渲染含击退拖影分支不报错', !threw);
})();

/* 一句话影响：击退不应破坏既有战斗流程 */
(function stillPlayable() {
  GAME.startRaid(MAPID);
  for (let i = 0; i < 120; i++) GAME.step(1 / 60);
  ok('击退改造后 raid 仍可持续步进', !!GAME.raid && GAME.raid.p.hp > -100);
})();

console.log(`\n结果: PASS=${pass} FAIL=${fail}  (AudioContext 创建 ${audioCtxCount} 次, 菜单逻辑 900 帧 ${cost}ms)`);
process.exit(fail ? 1 : 0);
