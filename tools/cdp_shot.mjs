import fs from "fs";
import http from "http";
import { spawn } from "child_process";
import path from "path";
import os from "os";

const PORT = 9455;
/* 自定位：需先用 Edge 打开调试端口，例如
   msedge --headless=new --remote-debugging-port=9455 --user-data-dir=<临时目录> about:blank
   然后 node tools/cdp_shot.mjs */
const PROJ = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "..");
const GAME_URL = "file:///" + path.join(PROJ, "DeadExtraction.html").replace(/\\/g, "/");
const OUT = path.join(PROJ, "screenshots");
/* 独立临时 profile：不触碰真实用户配置，避免登录/同步弹窗 */
const PROFILE = path.join(os.tmpdir(), "marvis-edge", "cdp_shot-" + process.pid + "-" + Date.now());

const EDGE = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].find(p => fs.existsSync(p));
const child = spawn(EDGE, ["--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--disable-sync", "--disable-features=msEdgeIdentityFRE,msEdgeSync,msEdgeSigninPrompt",
  "--no-service-autorun", "--disable-background-networking",
  "--window-size=1380,860", "--allow-file-access-from-files", "about:blank"],
  { detached: true, stdio: "ignore" });
child.unref();

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = p => new Promise((res, rej) => {
  http.get({ host: "127.0.0.1", port: PORT, path: p }, r => {
    let d = ""; r.on("data", c => d += c); r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on("error", rej);
});

let tabs = null;
for (let i = 0; i < 40; i++) {
  try { tabs = await getJSON("/json/list"); if (tabs.length) break; } catch (e) { }
  await sleep(300);
}
const page = tabs.find(t => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
const pend = new Map(); let mid = 0;
ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
await new Promise(r => ws.addEventListener("open", r));
const send = (method, params = {}) => new Promise(res => { const i = ++mid; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJS = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1380, height: 860, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: GAME_URL });
await sleep(2500);

async function shoot(name) {
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const p = path.join(OUT, name);
  if (shot.result?.data) { fs.writeFileSync(p, Buffer.from(shot.result.data, "base64")); console.log("saved " + name); }
  else console.log("FAIL " + name);
}

console.log("screen=", await evalJS("window.GAME? GAME.getScreen() : 'NO_GAME'"));
await evalJS("GAME.newGame(); GAME.startRaid(Object.keys(GAME.MAPS)[0]); 'started:' + GAME.getScreen()");
await evalJS("for (var i=0;i<90;i++) GAME.step(1/60); 'ok'");
await sleep(400);
await shoot("03_raid_view.png");

/* 把玩家挪到第一个建筑门外 3 格，相机对准，再看门廊效果 */
const info = await evalJS(`(function(){
  var r=GAME.raid, m=r.map, p=r.p, T=GAME.TILE;
  var b=m.buildings[0], d=b.doors[0];
  var sp=d.span||{x1:d.x,x2:d.x,y1:d.y,y2:d.y};
  var cx=(sp.x1+sp.x2+1)/2*T, cy=(sp.y1+sp.y2+1)/2*T;
  var dir=d.dir||{x:0,y:1};
  p.x = cx - dir.x*T*3.2 + (dir.y!==0? 10 : 0);
  p.y = cy - dir.y*T*3.2 + (dir.x!==0? 10 : 0);
  p.ang = Math.atan2(dir.y, dir.x);
  GAME.cam.x = p.x; GAME.cam.y = p.y;
  for (var i=0;i<8;i++) GAME.render();
  return JSON.stringify({bx:b.x,by:b.y,bw:b.w,bh:b.h,name:b.name,door:d,me:{x:p.x,y:p.y}});
})()`);
console.log("doorinfo", info);
await sleep(500);
await shoot("01_door_outside.png");

/* 走进去验证：按住方向键 90 帧 */
const walked = await evalJS(`(function(){
  var r=GAME.raid, p=r.p, m=r.map;
  var b=m.buildings[0], d=b.doors[0], dir=d.dir||{x:0,y:1};
  var k=GAME.keys; for (var kk in k) k[kk]=false;
  if (dir.y>0) k.s=true; else if (dir.y<0) k.w=true; else if (dir.x>0) k.d=true; else k.a=true;
  for (var i=0;i<120;i++) GAME.step(1/60);
  for (var kk in k) k[kk]=false;
  for (var i=0;i<8;i++) GAME.render();
  return JSON.stringify({visited:!!b.visited, x:Math.round(p.x), y:Math.round(p.y), door:{x:d.x,y:d.y}});
})()`);
console.log("walkedIn", walked);
await sleep(400);
await shoot("02_inside_building.png");

process.exit(0);
