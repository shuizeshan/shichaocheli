import fs from "fs";
import http from "http";
import { spawn } from "child_process";
import path from "path";
import os from "os";

const PORT = 9466;
/* 自定位：需先用 Edge 打开调试端口，例如
   msedge --headless=new --remote-debugging-port=9455 --user-data-dir=<临时目录> about:blank
   然后 node tools/cdp_shot.mjs */
const PROJ = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "..");
const GAME_URL = "file:///" + path.join(PROJ, "DeadExtraction.html").replace(/\\/g, "/");
const OUT = path.join(PROJ, "screenshots");
const PROFILE = path.join(os.tmpdir(), "marvis-edge", "loot_shot-" + process.pid + "-" + Date.now());

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
const go = await evalJS(`(function(){
  GAME.newGame();
  GAME.startRaid(Object.keys(GAME.MAPS)[0]);
  for (var i=0;i<30;i++) GAME.step(1/60);
  var r = GAME.raid;
  var c = r.map.containers.filter(function(x){ return x.loot && x.loot.length; })[0];
  if (!c) return 'no container';
  GAME.lootContainer(c);
  return GAME.getScreen() + '|' + c.type;
})()`);
console.log("after loot:", go);
await sleep(500);
await evalJS("for (var i=0;i<6;i++) GAME.render(); 'r'");
await sleep(400);
await shoot("04_loot_result.png");
const back = await evalJS("GAME.handleAction('loot_ok'); GAME.getScreen()");
console.log("after confirm:", back);
await sleep(400);
await shoot("05_after_confirm.png");
const html = await evalJS("GAME.uiHtml('lootResult').slice(0,0) + (document.getElementById('screen') ? document.getElementById('screen').innerText.slice(0,200) : 'no el')");
console.log("innerText:", html);
process.exit(0);
