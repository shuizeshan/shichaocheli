/* 真实浏览器验证阶段4：走通 失败→复盘→result→hub 与 结局→专页 两条路径并截图 */
import fs from "fs";
import http from "http";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import { fileURLToPath } from "node:url";
import { findBrowser } from "./browser.mjs";

const PORT = 9462;
const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAME_URL = "file:///" + path.join(PROJ, "DeadExtraction.html").replace(/\\/g, "/");
const OUT = path.join(PROJ, "screenshots");
fs.mkdirSync(OUT, { recursive: true });
const PROFILE = path.join(os.tmpdir(), "marvis-edge", "fail_shot-" + process.pid + "-" + Date.now());

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
async function shoot(name) {
  const shot = await send("Page.captureScreenshot", { format: "png" });
  if (shot.result?.data) { fs.writeFileSync(path.join(OUT, name), Buffer.from(shot.result.data, "base64")); console.log("saved " + name); }
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1380, height: 860, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: GAME_URL });
await sleep(2500);

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + (extra ? " :: " + extra : "")); }
}

/* 路径1：失败 → 复盘 → hub */
const dead = await evalJS(`(function(){
  GAME.newGame(); GAME.showScreen('hub');
  GAME.startRaid('city');
  var r=GAME.raid;
  GAME.bagAdd(r.p.bag,'medkit',2);
  r.p.lastHitBy='暴君';
  r.p.hp=0; GAME.endRaid(false);
  return JSON.stringify({screen:GAME.getScreen(),killer:r.result.killer,lost:r.result.lost.length,tips:r.result.tips.length});
})()`);
const d = JSON.parse(dead);
ok("浏览器阵亡进入 result", d.screen === "result", JSON.stringify(d));
await sleep(400);
const dom1 = await evalJS("document.querySelector('#screen').innerHTML.indexOf('失败复盘')>=0 && document.querySelector('#screen').innerHTML.indexOf('暴君')>=0 ? 'review-ok' : 'review-missing'");
ok("浏览器渲染失败复盘卡", dom1 === "review-ok", dom1);
await shoot("result_fail_review.png");
const back = await evalJS("GAME.handleAction('hub'); GAME.getScreen()");
ok("复盘后返回营地正常", back === "hub", back);

/* 路径2：结局 → 专页 */
const endp = await evalJS(`(function(){
  var b=GAME.base;
  b.ending=true; b.endingDay=9; b.raids=12; b.extracts=8; b.deaths=4; b.totalKills=66;
  b.notes=['note1','note2','note3','note4','note5','note6'];
  GAME.showScreen('hub'); GAME.handleAction('ending');
  return JSON.stringify({screen:GAME.getScreen()});
})()`);
ok("浏览器结局专页路由", JSON.parse(endp).screen === "ending", endp);
await sleep(400);
const dom2 = await evalJS("document.querySelector('#screen').innerHTML.indexOf('结 局 · 起 飞')>=0 && document.querySelector('#screen').innerHTML.indexOf('存活天数 9 天')>=0 ? 'ending-ok' : 'ending-missing'");
ok("浏览器渲染结局专页", dom2 === "ending-ok", dom2);
await shoot("ending_page.png");

console.log("RESULT PASS=" + pass + " FAIL=" + fail);
try { ws.close(); } catch (e) { }
process.exit(fail ? 1 : 0);
