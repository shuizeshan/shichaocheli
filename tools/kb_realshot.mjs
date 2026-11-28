/* 游戏内击退真实浏览器验证 + 截图（headless Edge + CDP）
   要点：
   - isWallAt(map, x, y) 需先传地图对象（raid.map）
   - p.ang 由鼠标世界坐标每帧重算：用 API.aimAtWorld(z.x,z.y) + step 一步，让朝向真实对准目标
   - 僵尸体型抗性在 z.t.kbRes（不是 z.kbRes）
   - 每次开火前重置 attackCd/stam，避免冷却期空放导致测不到击退
   用法: node tools/kb_realshot.mjs  -> shots/kb_*.png + stdout JSON */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const GAME = join(ROOT, 'DeadExtraction.html');
const OUT = join(ROOT, 'shots');
mkdirSync(OUT, { recursive: true });

const W = 1380, H = 860;
const PORT = 9560 + Math.floor(Math.random() * 30);
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function ensureDir(d) {
  try { (globalThis.__mk || ((p) => { throw new Error('no mk'); }))(d); } catch (e) {}
  return d;
}
function pickProfileDir(tag, pid) {
  if (process.env.PROBE_DIR) return process.env.PROBE_DIR;
  var cands = ['E:/MarvisEdgeTmp', 'D:/MarvisEdgeTmp'];
  for (var i = 0; i < cands.length; i++) {
    var c = cands[i];
    try { mkdirSync(c, { recursive: true }); return c + '/' + tag + '-' + pid; } catch (e) {}
  }
  return (process.env.TEMP || '.').replace(/\\/g, '/') + '/' + tag + '-' + pid;
}

const PROFILE = pickProfileDir('kb_realshot', process.pid);
mkdirSync(PROFILE, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const proc = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--disable-sync', '--disable-features=msEdgeIdentityFRE,msEdgeSync,msEdgeSigninPrompt',
  '--no-service-autorun', '--disable-background-networking',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--window-size=' + W + ',' + H, '--hide-scrollbars',
  '--allow-file-access-from-files', '--about:blank'
], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) return page;
    } catch (e) {}
    await sleep(250);
  }
  throw new Error('CDP target not ready');
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, m => m.error ? reject(new Error(method + ': ' + m.error.message)) : resolve(m.result));
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 400));
  return r.result.value;
}
const J = (raw, tag) => {
  if (typeof raw !== 'string' || raw.trim()[0] !== '{') throw new Error(tag + ' 返回非 JSON: ' + raw);
  return JSON.parse(raw);
};
async function shoot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(r.data, 'base64'));
  return name;
}

/* 布置场景：清场 -> 切武器 -> 找可通行方向放僵尸 -> 对准 -> 渲染 */
const arm = (type, weapon, wantDist) => `(function(){
  try {
    var r = GAME.raid, p = r.p;
    r.zombies.length = 0;
    p.cur = ${JSON.stringify(weapon)};
    p.attackCd = 0; p.reloading = 0; p.stam = p.maxStam; p.hp = p.maxHp;
    if (p.mag !== undefined) p.mag = 12;
    for (var i = 0; i < 8; i++) { GAME.step(1/60); }
    var ang = p.ang, d = ${wantDist}, tries = 0, ok = false;
    while (tries++ < 24) {
      if (!GAME.isWallAt(r.map, p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d)) { ok = true; break; }
      ang += 0.32; if (d > 26) d -= 2;
    }
    var zx = p.x + Math.cos(ang) * d, zy = p.y + Math.sin(ang) * d;
    GAME.spawnZombie(r, zx, zy, ${JSON.stringify(type)});
    var z = r.zombies[r.zombies.length - 1];
    z.hp = 5000; z.maxHp = 5000; z.alert = 0; z.state = 'idle';
    GAME.aimAtWorld(z.x, z.y);
    GAME.step(1/60);
    window.__z = z; window.__x0 = z.x;
    for (var j = 0; j < 5; j++) { GAME.step(1/60); GAME.render(); }
    return JSON.stringify({ type: z.type, r: +z.r.toFixed(1), kbRes: (z.t && z.t.kbRes) || 0,
      armor: (z.t && z.t.armor) || 0, weapon: GAME.curWeapon().n || GAME.curWeapon().id || '',
      kb: GAME.curWeapon().kb || 0, free: ok, d0: +Math.hypot(z.x - p.x, z.y - p.y).toFixed(1) });
  } catch (e) { return 'ERR ' + e.message + ' @ ' + String(e.stack || '').split('\\n')[1]; }
})()`;

/* 单次开火：重置冷却 -> 对准 -> 记录瞬时冲量/反馈 -> 沿击退轴追踪真实位移峰值 */
const fireMeasure = (frames, freezeAi) => `(function(){
  try {
    var r = GAME.raid, p = r.p, z = window.__z;
    var savedT = z.t;
    if (${freezeAi ? 1 : 0}) { z.t = Object.assign({}, z.t, { spd: 0 }); z.alert = 0; }
    p.attackCd = 0; p.stam = p.maxStam; p.reloading = 0; p.recoil = 0;
    GAME.aimAtWorld(z.x, z.y); GAME.step(1/60);
    var ang = Math.atan2(z.y - p.y, z.x - p.x);
    var ux = Math.cos(ang), uy = Math.sin(ang);
    var x0 = z.x, y0 = z.y;
    var hm0 = GAME.hitMarkCount(), kc0 = GAME.knockState().count;
    GAME.tryFire();
    var instant = { kbx: +(z.kbx || 0).toFixed(2), kby: +(z.kby || 0).toFixed(2),
      stun: +(z.stun || 0).toFixed(3), kbPower: +(z.kbPower || 0).toFixed(2),
      hitMark: GAME.hitMarkCount() - hm0, knock: GAME.knockState().count - kc0,
      hp: +z.hp.toFixed(1) };
    var peak = 0, peakAt = 0;
    for (var k = 0; k < ${frames}; k++) {
      GAME.step(1/60);
      var proj = (z.x - x0) * ux + (z.y - y0) * uy;
      if (proj > peak) { peak = proj; peakAt = k + 1; }
    }
    GAME.render();
    return JSON.stringify({ instant: instant, push: +peak.toFixed(2), peakFrame: peakAt,
      total: +Math.hypot(z.x - x0, z.y - y0).toFixed(2),
      speedLeft: +Math.hypot(z.kbx || 0, z.kby || 0).toFixed(2) });
  } catch (e) { return 'ERR ' + e.message; }
  finally { if (${freezeAi ? 1 : 0}) z.t = savedT; }
})()`;

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: pathToFileURL(GAME).href });
  await sleep(2400);

  const boot = await evalJS(`(function(){ GAME.newGame(); GAME.startRaid(Object.keys(GAME.MAPS)[0]);
    return GAME.raid.phase + '|hp=' + GAME.raid.p.hp; })()`);

  // A. 撬棍 × 普通僵尸
  const armW = J(await evalJS(arm('walker', 'crowbar', 44)), 'crowbarXwalker');
  const shotA = await shoot('kb_walker_before.png');
  const crowbarWalker = J(await evalJS(fireMeasure(46, false)), 'crowbarFireAI');
  await evalJS(arm('walker', 'crowbar', 44));
  const crowbarPhys = J(await evalJS(fireMeasure(40, true)), 'crowbarFirePhysics');
  const shotB = await shoot('kb_walker_hit.png');
  await evalJS('(function(){ for (var i=0;i<36;i++) GAME.step(1/60); GAME.render(); return 1; })()');
  const shotC = await shoot('kb_walker_after.png');

  // B. 消防斧 × 普通僵尸 / 暴君（同一武器对比抗性）
  const armA = J(await evalJS(arm('walker', 'axe', 48)), 'axeXwalker');
  const axeWalker = J(await evalJS(fireMeasure(46, false)), 'axeFireWalkerAI');
  await evalJS(arm('walker', 'axe', 48));
  const axePhys = J(await evalJS(fireMeasure(40, true)), 'axeFirePhysics');
  const armB = J(await evalJS(arm('brute', 'axe', 52)), 'axeXbrute');
  const shotD = await shoot('kb_brute_before.png');
  const bruteAxe = J(await evalJS(fireMeasure(46, false)), 'axeFireBruteAI');
  await evalJS(arm('brute', 'axe', 52));
  const brutePhys = J(await evalJS(fireMeasure(40, true)), 'axeFireBrutePhysics');
  const shotE = await shoot('kb_brute_after.png');

  // C. 手枪（子弹飞行命中，击退较弱）
  const armG = J(await evalJS(arm('walker', 'pistol', 150)), 'pistolXwalker');
  const pistol = J(await evalJS(fireMeasure(40, false)), 'pistolFireAI');
  await evalJS(arm('walker', 'pistol', 150));
  const pistolPhys = J(await evalJS(fireMeasure(40, true)), 'pistolFirePhysics');

  const cr = crowbarPhys.push, ax = axePhys.push, br = brutePhys.push;
  console.log(JSON.stringify({
    boot,
    shots: { before: shotA, hit: shotB, after: shotC, bruteBefore: shotD, bruteAfter: shotE },
    physics: { crowbarWalker: crowbarPhys, axeWalker: axePhys, bruteAxe: brutePhys, pistol: pistolPhys },
    gameplay: { crowbarWalker: crowbarWalker, axeWalker: axeWalker, bruteAxe: bruteAxe, pistol: pistol },
    assertions: {
      crowbarKnockbackEq: Math.abs(crowbarWalker.instant.kbx + 152.76) < 30,
      meleeKnockbackVisible: cr > 30,
      axeStrongerThanCrowbar: ax > cr * 1.4,
      bruteResistant: br < cr * 0.35,
      gameplayKnockbackVisible: crowbarWalker.push > 12,
      bruteHitFeedback: bruteAxe.instant.hitMark >= 1,
      hitFeedback: crowbarWalker.instant.hitMark >= 1 && crowbarWalker.instant.knock >= 1,
      stunOnMelee: crowbarWalker.instant.stun > 0,
      gunKnockback: pistolPhys.push > 4
    }
  }, null, 2));
} catch (e) {
  console.error('ERR ' + e.message);
  process.exitCode = 1;
} finally {
  try { ws.close(); } catch (e) {}
  proc.kill();
  await sleep(600);
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(process.exitCode || 0);
}
