/* 仅截取主菜单背景画布（隐藏标题面板），用于核验电影感动画细节
   用法: node tools/bg_probe.mjs [宽] [高] [前缀] */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'DeadExtraction.html');
const SHOTS = path.join(ROOT, 'shots');
mkdirSync(SHOTS, { recursive: true });

const W = Number(process.argv[2] || 1600);
const H = Number(process.argv[3] || 900);
const PREFIX = process.argv[4] || 'bgonly';

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].find(p => existsSync(p));
if (!EDGE) { console.error('未找到 Edge'); process.exit(2); }

const PORT = 9300 + Math.floor(Math.random() * 400);

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

const PROFILE = pickProfileDir('bg_probe', process.pid);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function httpJson(p) {
  return fetch(`http://127.0.0.1:${PORT}${p}`, { keepalive: true }).then(r => r.json());
}

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu-sandbox', '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  `--window-size=${W},${H}`, 'about:blank'
], { stdio: 'ignore', windowsHide: true });

let ws = null, msgId = 0;
const pending = new Map();

async function waitEndpoint() {
  for (let i = 0; i < 120; i++) {
    try { return await httpJson('/json/version'); } catch { await sleep(250); }
  }
  throw new Error('调试端口未就绪');
}

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 20000);
  });
}

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
}

async function shot(file, clip) {
  const out = await send('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: 1 } } : { format: 'png' });
  writeFileSync(path.join(SHOTS, file), Buffer.from(out.data, 'base64'));
}

try {
  await waitEndpoint();
  const targets = await httpJson('/json/list');
  const page = targets.find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  };
  await new Promise(r => ws.onopen = r);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const url = 'file:///' + HTML.replace(/\\/g, '/');
  await send('Page.navigate', { url });
  await sleep(2500);

  const info = await evaluate(`(function(){
    var api = window.GAME;
    if (!api) return {err:'no api'};
    api.showScreen('menu');
    api.setMenuBgActive(true);
    try { api.menuBgUpdate(0.016); api.menuBgPaint(); } catch(e) { return {err:e.message}; }
    var cv = document.querySelector('#menuBg canvas');
    var r = cv ? cv.getBoundingClientRect() : null;
    return { rect: r ? {x:r.x,y:r.y,w:r.width,h:r.height} : null, state: api.menuBgState() };
  })()`);

  /* 隐藏标题面板与页眉，只留背景动画 */
  await evaluate(`(function(){
    var p = document.querySelector('.panel.menu-card');
    if (p) p.style.visibility = 'hidden';
    var h = document.querySelector('.bgm-ctl');
    if (h) h.style.visibility = 'hidden';
    return true;
  })()`);
  await sleep(900);

  /* 像素探针：直接读 MENUBG 画布，确认警车灯条 / 盾牌 / 烟柱真的画出来了 */
  const probe = await evaluate(`(function(){
    var cv = document.querySelector('#menuBg canvas');
    if (!cv) return {err:'no canvas'};
    var ctx = cv.getContext('2d');
    var sx = cv.width / 960, sy = cv.height / 540;
    function maxIn(x0, y0, w, h) {
      var d = ctx.getImageData(Math.max(0, Math.round(x0*sx)), Math.max(0, Math.round(y0*sy)),
                               Math.max(1, Math.round(w*sx)), Math.max(1, Math.round(h*sy))).data;
      var mx = 0, mR = 0, mB = 0;
      for (var i = 0; i < d.length; i += 4) {
        var r = d[i], g = d[i+1], b = d[i+2];
        var v = (r + g + b) / 3;
        if (v > mx) mx = v;
        if (r - b > 30 && r > mR) mR = r;
        if (b - r > 30 && b > mB) mB = b;
      }
      return { max: Math.round(mx), red: mR, blue: mB };
    }
    var st = window.GAME.menuBgState();
    return {
      canvas: [cv.width, cv.height],
      carBar: maxIn(20, 372, 60, 30),      /* 车顶灯条区域 */
      carBody: maxIn(10, 400, 60, 22),     /* 车身区域 */
      copsZone: maxIn(80, 360, 90, 80),    /* 警察/盾牌区域 */
      columnZone: maxIn(200, 120, 520, 260),
      sirenPhase: st.sirenPhase,
      paintMs: (function(){
        var t0 = performance.now();
        for (var k = 0; k < 30; k++) window.GAME.menuBgPaint();
        return Math.round(((performance.now() - t0) / 30) * 100) / 100;
      })()
    };
  })()`);

  const rect = info.rect || { x: 0, y: 0, w: W, h: H };
  await shot(`${PREFIX}_full.png`);
  await shot(`${PREFIX}_canvas.png`, { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.w), height: Math.round(rect.h) });
  await sleep(1200);
  await shot(`${PREFIX}_canvas_b.png`, { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.w), height: Math.round(rect.h) });

  console.log(JSON.stringify({
    ok: true, prefix: PREFIX, viewport: [W, H], canvasRect: rect, probe: probe, menuBg: info.state
  }, null, 2));
} catch (e) {
  console.error('FAIL', e.message);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  proc.kill();
  await sleep(600);
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
}
