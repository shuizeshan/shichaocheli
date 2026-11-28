/* 主菜单布局 / 动画截图与几何校验脚本
   用法: node tools/menu_shot.mjs [width] [height] [outPrefix]
   输出: shots/<outPrefix>_a.png / _b.png（相隔 1.3s，用于确认动画在动）
        stdout 输出 JSON：面板几何、按钮是否溢出、背景层状态 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const GAME = join(ROOT, 'DeadExtraction.html');
const OUT = join(ROOT, 'shots');
mkdirSync(OUT, { recursive: true });

const W = parseInt(process.argv[2] || '1600', 10);
const H = parseInt(process.argv[3] || '900', 10);
const PREFIX = process.argv[4] || `menu_${W}x${H}`;
/* 第4参数传 hide 时临时隐藏菜单面板，仅用于审阅背景动画构图 */
const HIDE_PANEL = (process.argv[5] || '') === 'hide';
const PORT = 9460 + Math.floor(Math.random() * 60);

const EDGE = existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
  ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  : 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe';

function ensureDir(d) {
  try { (globalThis.__mk || ((p) => { throw new Error('no mk'); }))(d); } catch (e) {}
  return d;
}
/* 每次运行使用独立临时 user-data-dir，避免复用真实用户配置而触发微软账户登录/同步弹窗 */
function pickProfileDir(tag, pid) {
  if (process.env.PROBE_DIR) return process.env.PROBE_DIR;
  const base = join(tmpdir(), 'marvis-edge');
  try { mkdirSync(base, { recursive: true }); } catch (e) {}
  return join(base, tag + '-' + pid);
}

const PROFILE = pickProfileDir('menu_shot', process.pid);
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
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
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
await new Promise((res, rej) => {
  ws.addEventListener('open', res);
  ws.addEventListener('error', rej);
});

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, m => m.error ? reject(new Error(method + ': ' + m.error.message)) : resolve(m.result));
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}

async function shoot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(r.data, 'base64'));
  return name;
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: pathToFileURL(GAME).href });
  await sleep(2000);

  /* 可选第4参数 hide：临时隐藏菜单面板，单看背景动画构图（仅影响本次截图，不改动游戏文件） */
  if (HIDE_PANEL) {
    await evalJS(`(function(){var s=document.createElement('style');s.id='__hidePanel';s.textContent='#screen .panel.menu-card{opacity:0 !important;}';document.head.appendChild(s);return 1;})()`);
    await sleep(1200);
  }

  const info = await evalJS(`(function(){
    var card = document.querySelector('#screen .panel.menu-card');
    var btns = [].slice.call(document.querySelectorAll('.menu-actions .btn'));
    var vw = innerWidth, vh = innerHeight;
    var r = card ? card.getBoundingClientRect() : null;
    var over = btns.filter(function(b){ var q=b.getBoundingClientRect(); return q.right > vw + 0.6 || q.left < -0.6 || q.bottom > vh + 0.6 || q.top < -0.6; }).map(function(b){return b.textContent.trim();});
    var overflowY = card ? (card.scrollHeight - card.clientHeight > 1) : null;
    return JSON.stringify({
      vw: vw, vh: vh,
      card: r ? {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)} : null,
      cardBottomRatio: r ? +(r.bottom / vh).toFixed(3) : null,
      cardRightRatio: r ? +(r.right / vw).toFixed(3) : null,
      btnCount: btns.length, overflowBtns: over, cardScrollOverflow: overflowY,
      bgOn: document.getElementById('menuBg').classList.contains('on'),
      canvasSize: (function(){var c=document.getElementById('menuBgCanvas');return c?[c.width,c.height]:null;})(),
      bgmCtlOn: document.getElementById('bgmCtl').classList.contains('on'),
      title: (document.querySelector('.menu-card h1.title')||{}).textContent || null
    });
  })()`);

  const a = await shoot(`${PREFIX}_a.png`);
  await sleep(1300);
  const b = await shoot(`${PREFIX}_b.png`);

  console.log(JSON.stringify({ ok: true, prefix: PREFIX, shotA: a, shotB: b, layout: JSON.parse(info) }, null, 2));
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
