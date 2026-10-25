"use strict";

// Real published Dashboard data, local server, headless Chrome.
// Personal positions stay in the page profile and are checked against the network log.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const zlib = require("node:zlib");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const output = path.resolve(process.argv[2] || path.join(root, "reports/portfolio-research-browser"));
fs.mkdirSync(output, { recursive: true });
const index = JSON.parse(fs.readFileSync(path.join(root, "data/workspace_index.json"), "utf8"));

class CDP {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => { this.socket.onopen = resolve; this.socket.onerror = reject; });
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) {
        return;
      }
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    };
  }
  async send(method, params = {}, sessionId) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 60000);
      this.pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

function startServer() {
  const cache = new Map();
  const requests = [];
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    requests.push({ method: req.method, url: pathname });
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    if (!cache.has(file)) {
      const raw = fs.readFileSync(file);
      cache.set(file, { raw, gzip: zlib.gzipSync(raw) });
    }
    const body = cache.get(file);
    const gzip = /gzip/.test(req.headers["accept-encoding"] || "");
    const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".json") ? "application/json" : "text/html";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store", ...(gzip ? { "Content-Encoding": "gzip" } : {}) });
    res.end(gzip ? body.gzip : body.raw);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, requests, port: server.address().port })));
}

async function main() {
  const { server, requests, port } = await startServer();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "stocklookup-portfolio-"));
  const chrome = spawn(process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  const report = { session: index.as_of_session, tickers: Object.keys(index.cards).length, widths: [], requests: {} };
  let failed = null;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let text = "";
      const timer = setTimeout(() => reject(new Error("Chrome start timeout")), 20000);
      chrome.stderr.on("data", (chunk) => {
        text += chunk;
        const match = text.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      chrome.on("error", reject);
    });
    const cdp = new CDP(endpoint);
    await cdp.ready;
    const version = await cdp.send("Browser.getVersion");
    report.browser = version.product;
    for (const width of [375, 768, 1024, 1440]) {
      const row = { width, checks: {} };
      const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
      const send = (method, params = {}) => cdp.send(method, params, sessionId);
      const evaluate = async (expression) => {
        const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) {
          const message = result.exceptionDetails.exception && result.exceptionDetails.exception.description || JSON.stringify(result.exceptionDetails);
          throw new Error(message);
        }
        return result.result.value;
      };
      const wait = async (expression) => {
        const start = Date.now();
        let last = "";
        while (Date.now() - start < 30000) {
          try {
            if (await evaluate(`Boolean(${expression})`)) return;
          } catch (err) {
            last = String(err.message || err);
            if (!last.includes("navigated") && !last.includes("context")) throw err;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error(`${expression} :: ${last}`);
      };
      await send("Page.enable");
      await send("Runtime.enable");
      await send("Network.enable");
      await send("Performance.enable");
      await send("Page.addScriptToEvaluateOnNewDocument", { source: "try{localStorage.clear();sessionStorage.clear();}catch(e){} window.__errors=[]; addEventListener('error',(e)=>window.__errors.push(String(e.message)+' '+String(e.filename)+':'+e.lineno));" });
      await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
      const before = requests.length;
      await send("Page.navigate", { url: `http://127.0.0.1:${port}/portfolio.html` });
      await wait("document.documentElement.dataset.portfolioReady === '1'");
      let bootErrors = [];
      try { bootErrors = await evaluate("window.__errors || []"); }
      catch (err) { console.log("boot evaluate failed", requests.slice(-12)); throw err; }
      if (bootErrors.length) throw new Error(`page error: ${bootErrors.join(" | ")}`);
      const plainStart = requests.length;
      await evaluate("document.querySelector('#ticker').value='HPG'; document.querySelector('#amount').value='0.2'; document.querySelector('#basis').value='explicit_weight'; document.querySelector('#portfolio-form').requestSubmit()");
      const appeared = await evaluate("new Promise((resolve)=>{const end=performance.now()+15000;(function poll(){if(document.querySelector('[data-holding=\"HPG\"]'))resolve('yes'); else if(performance.now()>end)resolve('no'); else setTimeout(poll,50);})()})");
      if (appeared !== "yes") {
        const debug = await evaluate("({research:document.querySelector('#portfolio-research')&&document.querySelector('#portfolio-research').innerText, form:document.querySelector('#form-status')&&document.querySelector('#form-status').innerText, positions:document.querySelector('#positions')&&document.querySelector('#positions').innerText, storage:localStorage.getItem('stocklookup.portfolio-research.v1'), errors:window.__errors})");
        throw new Error(`HPG did not render ${JSON.stringify(debug)}`);
      }
      await evaluate("document.querySelector('#ticker').value='FPT'; document.querySelector('#amount').value='0.2'; document.querySelector('#portfolio-form').requestSubmit()");
      await wait("document.querySelector('[data-holding=\"FPT\"]')");
      await evaluate("document.querySelector('#ticker').value='PNJ'; document.querySelector('#amount').value='0.2'; document.querySelector('#portfolio-form').requestSubmit()");
      await wait("document.querySelector('[data-holding=\"PNJ\"]')");
      const plainRequests = requests.slice(plainStart).filter((item) => item.url.includes("/workspace_detail/"));
      row.checks.noDetailBeforeInspect = plainRequests.length === 0;
      const postures = await evaluate(`({
        HPG: document.querySelector('[data-holding="HPG"]').dataset.posture,
        FPT: document.querySelector('[data-holding="FPT"]').dataset.posture,
        PNJ: document.querySelector('[data-holding="PNJ"]').dataset.posture
      })`);
      row.postures = postures;
      row.checks.posturesMatch = postures.HPG === index.cards.HPG.research_action_posture
        && postures.FPT === "AVOID" && postures.PNJ === "AVOID";
      row.checks.dossierLink = await evaluate(`document.querySelector('[data-holding="HPG"] a[href*="view=dossier"]').href.includes("ticker=HPG")`);
      row.checks.fitsViewport = await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1");
      const detailStart = requests.length;
      await evaluate(`document.querySelector('[data-inspect="HPG"]').click()`);
      await wait(`document.querySelector('#pf-detail-heading')?.textContent.includes('HPG')`);
      row.detailRequests = requests.slice(detailStart).filter((item) => item.url.includes("/workspace_detail/")).map((item) => item.url);
      row.checks.oneShard = row.detailRequests.length === 1 && row.detailRequests[0].includes("/H.json");
      if (width === 1440) {
        await evaluate("document.querySelector('#ticker').value='NVL'; document.querySelector('#amount').value='100'; document.querySelector('#basis').value='quantity'; document.querySelector('#portfolio-form').requestSubmit()");
        await wait(`document.querySelector('[data-holding="NVL"]')`);
        const nvl = await evaluate(`({
          posture: document.querySelector('[data-holding="NVL"]').dataset.posture,
          text: document.querySelector('[data-holding="NVL"]').innerText
        })`);
        row.nvl = nvl;
        row.checks.nvlAdverse = nvl.posture === "AVOID" && !nvl.text.includes("diễn giải là đã kích hoạt: đã có cờ");
        const compareStart = requests.length;
        await evaluate(`document.querySelector('[data-compare-toggle="HPG"]').click(); document.querySelector('#pf-alternative').value='TCB'; document.querySelector('#pf-add-alternative').click(); document.querySelector('#pf-run-compare').click()`);
        await wait(`document.querySelector('[data-incompatible-count], [data-compare-refused]')`);
        row.checks.compareRefused = await evaluate(`Boolean(document.querySelector('[data-incompatible-count], [data-compare-refused]'))`);
        row.compareRequests = requests.slice(compareStart).filter((item) => item.url.includes("/workspace_detail/")).map((item) => item.url);
        row.checks.noPost = requests.slice(before).every((item) => item.method === "GET");
        const cash = "987654321";
        await evaluate(`document.querySelector('#cash').value='${cash}'; document.querySelector('#save').click()`);
        row.checks.cashNotInUrls = requests.every((item) => !item.url.includes(cash));
        const hostile = JSON.stringify({
          portfolio_id: "<img src=x onerror=alert(1)>",
          positions: [{ ticker: "<script>window.__pwned=1</script>", quantity: 1 }, { ticker: "HPG", quantity: 1, explicit_weight: 0.5 }],
        });
        const beforeStore = await evaluate("localStorage.getItem('stocklookup.portfolio-research.v1')");
        await evaluate(`const input=document.querySelector('#import'); const file=new File([${JSON.stringify(hostile)}],'bad.json',{type:'application/json'}); const list=new DataTransfer(); list.items.add(file); input.files=list.files; input.dispatchEvent(new Event('change',{bubbles:true}))`);
        await wait(`document.querySelector('#import-status')?.textContent.includes('giữ nguyên')`);
        row.checks.importKept = await evaluate("localStorage.getItem('stocklookup.portfolio-research.v1')") === beforeStore;
        row.checks.noScript = await evaluate("window.__pwned") !== 1;
        await evaluate(`document.querySelector('[data-inspect="FPT"]').click(); document.querySelector('[data-inspect="PNJ"]').click(); document.querySelector('[data-inspect="NVL"]').click()`);
        await wait(`document.querySelector('#pf-detail-heading')?.textContent.includes('NVL')`);
        const finalDetail = await evaluate(`document.querySelector('#pf-detail-heading').textContent`);
        row.finalDetail = finalDetail;
        row.checks.noStale = finalDetail.includes("NVL") && !finalDetail.includes("FPT");
        row.checks.positionsRemain = await evaluate(`['HPG','FPT','PNJ','NVL'].every((ticker)=>document.querySelector('[data-holding="'+ticker+'"]'))`);
        await send("HeapProfiler.collectGarbage");
        row.heap = (await send("Performance.getMetrics")).metrics.find((metric) => metric.name === "JSHeapUsedSize").value;
      }
      const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      fs.writeFileSync(path.join(output, `${width}.png`), Buffer.from(shot.data, "base64"));
      row.pass = Object.values(row.checks).every((value) => value === true);
      report.widths.push(row);
      console.log(width, JSON.stringify(row.checks));
    }
    report.pass = report.widths.every((row) => row.pass);
  } catch (err) {
    failed = err;
    report.error = String(err && err.stack || err);
  } finally {
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
    chrome.kill();
    server.close();
  }
  if (failed || !report.pass) {
    console.error(report.error || "portfolio browser checks failed");
    process.exit(1);
  }
  console.log("portfolio browser acceptance passed");
}

main().catch((err) => { console.error(err); process.exit(1); });
