/* 营地界面真实浏览器验证：进入 hub 后在 3 种分辨率下截图，
   断言所有按钮矩形都在视口内（不溢出）、面板不超屏。 */
import fs from "fs";
import http from "http";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import { fileURLToPath } from "node:url";
import { findBrowser } from "./browser.mjs";

const PORT = 9461;
const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAME_URL = "file:///" + path.join(PROJ, "DeadExtraction.html").replace(/\\/g, "/");
const OUT = path.join(PROJ, "screenshots");
fs.mkdirSync(OUT, { recursive: true });
const PROFILE = path.join(os.tmpdir(), "marvis-edge", "hub_shot-" + process.pid + "-" + Date.now());

const EDGE = findBrowser();
const child = spawn(EDGE, ["--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--disable-sync", "--no-service-autorun", "--disable-background-networking",
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
await send("Page.navigate", { url: GAME_URL });
await sleep(2500);
await evalJS("GAME.newGame(); GAME.showScreen('hub'); 'ok'");
await sleep(300);

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + (extra ? " :: " + extra : "")); }
}

async function shoot(name) {
  const shot = await send("Page.captureScreenshot", { format: "png" });
  if (shot.result?.data) { fs.writeFileSync(path.join(OUT, name), Buffer.from(shot.result.data, "base64")); console.log("saved " + name); }
}

for (const [W, H] of [[1380, 860], [1100, 720], [820, 620]]) {
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  await evalJS("GAME.showScreen('hub'); 'ok'");
  await sleep(300);
  const geo = await evalJS(`(function(){
    var btns=[].slice.call(document.querySelectorAll('#screen .panel .btn'));
    var panel=document.querySelector('#screen .panel');
    var out=[];
    for (var i=0;i<btns.length;i++){
      var b=btns[i];
      var r=b.getBoundingClientRect();
      var vis = r.left>=0&&r.top>=0&&r.right<=window.innerWidth+1&&r.bottom<=window.innerHeight+1;
      if (!vis) {
        /* 面板可滚动：滚动到该按钮后再测，仍不可见才算真溢出 */
        b.scrollIntoView({block:'nearest'});
        r=b.getBoundingClientRect();
        if (!(r.left>=0&&r.top>=0&&r.right<=window.innerWidth+1&&r.bottom<=window.innerHeight+1))
          out.push({t:b.textContent.trim(),r:{l:Math.round(r.left),t:Math.round(r.top),rt:Math.round(r.right),b:Math.round(r.bottom)}});
      }
    }
    var pb=panel?panel.getBoundingClientRect():null;
    return JSON.stringify({btns:btns.length, overflowBtns:out,
      panelOut: pb? (pb.left<0||pb.top<0||pb.right>window.innerWidth+1||pb.bottom>window.innerHeight+1) : null,
      panelH: pb?Math.round(pb.height):0, vw:window.innerWidth, vh:window.innerHeight});
  })()`);
  const g = JSON.parse(geo);
  await shoot(`hub_${W}x${H}.png`);
  ok(`[${W}x${H}] 按钮数 9~10`, g.btns >= 9 && g.btns <= 10, "btns=" + g.btns);
  ok(`[${W}x${H}] 无按钮溢出视口`, g.overflowBtns.length === 0, JSON.stringify(g.overflowBtns));
  ok(`[${W}x${H}] 面板不出屏`, g.panelOut === false, JSON.stringify({ panelOut: g.panelOut, panelH: g.panelH }));
  ok(`[${W}x${H}] 面板高度 < 视口 130%`, g.panelH < g.vh * 1.3, "panelH=" + g.panelH + " vh=" + g.vh);
}
/* 选图页也验一遍 */
await send("Emulation.setDeviceMetricsOverride", { width: 1380, height: 860, deviceScaleFactor: 1, mobile: false });
await sleep(300);
await evalJS("GAME.showScreen('map'); 'ok'");
await sleep(300);
const mech = await evalJS("document.querySelector('#screen').innerHTML.indexOf('稀有军械 20%')>=0 ? 'mech-ok' : 'mech-missing'");
ok("真实浏览器选图页显示机制标签", mech === "mech-ok", mech);
await shoot("map_mech_tags.png");

console.log("RESULT PASS=" + pass + " FAIL=" + fail);
try { ws.close(); } catch (e) { }
process.exit(fail ? 1 : 0);
