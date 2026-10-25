"use strict";
// Real committed data; isolated headless Chrome, local gzip HTTP, native CDP only.
// Run: node tests/workbench-browser-benchmark.cjs reports/workbench-before
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const http = require("node:http"), zlib = require("node:zlib"), { spawn } = require("node:child_process");
const { execFileSync } = require("node:child_process");
const { isDeepStrictEqual } = require("node:util");
const baseline = process.env.BENCH_BASELINE === "1";
const root = path.resolve(__dirname, ".."), output = path.resolve(process.argv[2] || "reports/workbench-browser");
fs.mkdirSync(output, { recursive: true });
const index = JSON.parse(fs.readFileSync(path.join(root, "data/workspace_index.json")));
const instrument = `(() => {
  try { localStorage.clear(); } catch (_) {} // Isolated benchmark profile only.
  window.__bench = {parses: [], longTasks: [], renders: 0, blobs: []};
  const readBlob = Response.prototype.blob;
  Response.prototype.blob = async function() { const blob = await readBlob.call(this); __bench.blobs.push(new WeakRef(blob)); return blob; };
  const parse = JSON.parse;
  JSON.parse = function(text, ...args) { const start = performance.now(); const value = parse.call(this,text,...args);
    if (text.length > 100000) __bench.parses.push({chars: text.length, ms: performance.now()-start, contract: value.contract_version || null}); return value; };
  Response.prototype.json = async function() { return JSON.parse(await this.text()); };
  new PerformanceObserver(list => __bench.longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});
  document.addEventListener('DOMContentLoaded',()=>new MutationObserver(()=>__bench.renders++).observe(document.getElementById('wb-dossier'),{childList:true}));
})();`;
class CDP {
  constructor(url) { this.socket = new WebSocket(url); this.id = 0; this.pending = new Map(); this.listeners = [];
    this.ready = new Promise((resolve,reject)=>{ this.socket.onopen=resolve; this.socket.onerror=reject; });
    this.socket.onmessage = event => { const m=JSON.parse(event.data); if(m.id){ const p=this.pending.get(m.id); this.pending.delete(m.id); if(m.error)p.reject(new Error(JSON.stringify(m.error))); else p.resolve(m.result); } else this.listeners.forEach(fn=>fn(m)); };
    this.socket.onclose=()=>{for(const p of this.pending.values())p.reject(new Error('CDP closed'));this.pending.clear();};
  }
  async send(method,params={},sessionId) { await this.ready; const id=++this.id; return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout: '+method))},55000);this.pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});this.socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));}); }
}
async function main() {
  const cache=new Map();
  const server=http.createServer((req,res)=>{
    let file=path.resolve(root,"."+decodeURIComponent(new URL(req.url,"http://localhost").pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    if(!cache.has(file)){const relative=path.relative(root,file).replaceAll('\\','/');
      const raw=baseline && relative.startsWith('assets/js/') ? execFileSync('git',['show',`13600821c5c6f610e04672a15112c6d576100fa0:${relative}`],{cwd:root,maxBuffer:10000000}) : fs.readFileSync(file);cache.set(file,{raw,gzip:zlib.gzipSync(raw)});}
    const b=cache.get(file), gzip=/gzip/.test(req.headers['accept-encoding']||'');
    res.writeHead(200,{'Content-Type':file.endsWith('.json')?'application/json':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',
      ...(gzip?{'Content-Encoding':'gzip'}:{}),'Cache-Control':'no-store'});res.end(gzip?b.gzip:b.raw);
  });
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),"stocklookup-benchmark-"));
  const chrome=spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let cdp;
  try {
    const endpoint=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('Chrome start timeout')),20000);chrome.stderr.on('data',b=>{text+=b;const m=text.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});chrome.on('error',reject);});
    cdp=new CDP(endpoint);await cdp.ready;
    fs.mkdirSync(path.join(output,'downloads'),{recursive:true});
    await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.join(output,'downloads')});
    const version=await cdp.send('Browser.getVersion');
    const report={base:'13600821c5c6f610e04672a15112c6d576100fa0', session:index.as_of_session, tickers:Object.keys(index.cards).length, browser:version.product,
      baselineCode:baseline, instrumentation:'Response.json -> text + timed JSON.parse; post-GC JS heap and live native Blob sizes, not total browser RSS. 2s cache-compression settling after latency measurement. Local gzip, no network throttling.', cases:[]};
    for(const width of [375,768,1024,1440]){
      const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'});
      const {sessionId:s}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
      const resources=[];
      const listener=m=>{if(m.sessionId===s && m.method==='Network.responseReceived')resources.push({id:m.params.requestId,url:m.params.response.url});if(m.sessionId===s && m.method==='Network.loadingFinished'){const r=resources.find(r=>r.id===m.params.requestId);if(r)r.encoded=m.params.encodedDataLength;}};
      cdp.listeners.push(listener);
      const send=(m,p={})=>cdp.send(m,p,s);
      const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression:`(()=>eval(${JSON.stringify(expression)}))()`,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
      const wait=expression=>evaluate(`new Promise((resolve,reject)=>{const end=performance.now()+45000; const poll=()=>{if(${expression})resolve(true);else if(performance.now()>end)reject(new Error('UI timeout: '+${JSON.stringify(expression)}));else setTimeout(poll,30)};poll()})`);
      const memory=async()=>{await send('HeapProfiler.collectGarbage');return (await send('Performance.getMetrics')).metrics.find(m=>m.name==='JSHeapUsedSize').value;};
      const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
      const select=ticker=>evaluate(`document.querySelector('#ticker-select').value=${JSON.stringify(ticker)};document.querySelector('#ticker-select').dispatchEvent(new Event('change',{bubbles:true}))`);
      const snapshot=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,`${width}-${name}.png`),Buffer.from(r.data,'base64'));};
      await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Performance.enable');
      await send('Network.setCacheDisabled',{cacheDisabled:true});
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await send('Page.addScriptToEvaluateOnNewDocument',{source:instrument});
      const url=`http://127.0.0.1:${server.address().port}/investment-workspace.html`;
      await send('Page.navigate',{url});await wait(`document.querySelector('#ticker-select')?.options.length===1683`);
      const row={width,plainHeap:await memory(),plainDetailRequests:resources.filter(r=>r.url.includes('/workspace_detail/')).length};
      // Cold worst-case five shards, with real high-interest issuers.
      const start=Date.now();
      await evaluate(`history.replaceState(null,'','?view=compare&tickers=VCB,SSI,TCB,PNJ,HPG&session=2026-10-23')`);
      await click('#ws-tab-compare');await wait(`document.querySelector('#wb-compare-heading')`);
      row.fiveShardMs=Date.now()-start;
      await evaluate('new Promise(resolve=>setTimeout(resolve,2000))');
      row.fiveHeap=await memory();row.liveBlobBytes=await evaluate(`__bench.blobs.reduce((sum,ref)=>sum+(ref.deref()?.size||0),0)`);
      row.fiveParse=await evaluate(`__bench.parses.filter(p=>p.contract==='workspace_detail_shard/v1')`);
      row.fiveRequests=resources.filter(r=>r.url.includes('/workspace_detail/'));await snapshot('comparison');
      await evaluate(`window.__downloaded=null;const create=URL.createObjectURL;URL.createObjectURL=function(blob){blob.text().then(t=>window.__downloaded=t);return create.call(this,blob)}`);
      await click('[data-wb-action="compare-export-json"]');await wait('window.__downloaded');
      const wb=require('../assets/js/investigation-workbench.js');
      const entries=['VCB','SSI','TCB','PNJ','HPG'].map(t=>({ticker:t,thin:index.cards[t],detail:JSON.parse(fs.readFileSync(path.join(root,`data/workspace_detail/${index.cards[t].detail_shard}.json`))).tickers[t]}));
      const expected=wb.buildDossierExport({comparison:wb.buildComparison(entries,{session:index.as_of_session,indexDoc:index}),indexDoc:index});
      const exported=await evaluate('JSON.parse(__downloaded)');
      row.comparisonExportParity=isDeepStrictEqual(expected.comparison,exported.comparison) && expected.source.source_artifact_identity===exported.source.source_artifact_identity;
      await click('#ws-tab-dossier');await select('HPG');await wait(`document.querySelector('#wb-dossier-heading')?.textContent.includes('HPG')`);
      const repeated=Date.now();for(let i=0;i<8;i++){await select('PNJ');await wait(`document.querySelector('#wb-dossier-heading')?.textContent.includes('PNJ')`);await select('HPG');await wait(`document.querySelector('#wb-dossier-heading')?.textContent.includes('HPG')`);}
      row.repeatedDossierMs=Date.now()-repeated;row.repeatedHeap=await memory();row.dossierRenders=await evaluate('__bench.renders');
      // Same-shard request concurrency and fresh same-shard comparison.
      const sameStart=Date.now(), sameRequestStart=resources.length;
      await send('Page.navigate',{url:url+'?view=compare&tickers=SSI,SHB,STB,SAB,SBT&session=2026-10-23'});await wait(`document.querySelector('#wb-compare-heading')`);
      row.sameShardMs=Date.now()-sameStart;row.sameShardRequests=resources.slice(sameRequestStart).filter(r=>r.url.includes('/workspace_detail/'));
      row.sameShardHeap=await memory();row.sameShardParse=await evaluate(`__bench.parses.filter(p=>p.contract==='workspace_detail_shard/v1')`);
      const before=resources.length;await click('#ws-tab-dossier');
      const rapidStart=Date.now();
      await evaluate(`for(const t of ['HPG','FPT','PNJ','NVL','VNM']){const el=document.querySelector('#ticker-select');el.value=t;el.dispatchEvent(new Event('change',{bubbles:true}));}`);
      await wait(`document.querySelector('#wb-dossier-heading')?.textContent.includes('VNM')`);
      row.rapidMs=Date.now()-rapidStart;
      row.rapidFinal=await evaluate(`document.querySelector('#wb-dossier-heading').textContent`);row.rapidRequests=resources.slice(before).filter(r=>r.url.includes('/workspace_detail/'));
      row.longTasks=await evaluate('__bench.longTasks');row.overflow=await evaluate('document.documentElement.scrollWidth>innerWidth');await snapshot('dossier');
      row.reliability={};
      console.log(width,'reliability: journal');
      const checks=row.reliability;
      const frames=()=>evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      // Capture the exact Blob passed to browser download, without changing its bytes.
      await evaluate(`window.__downloaded=null;const makeURL=URL.createObjectURL;URL.createObjectURL=function(blob){blob.text().then(t=>window.__downloaded=t);return makeURL.call(this,blob)};`);
      await click('[data-wb-action="save"]');await wait(`document.querySelector('#wb-hypothesis')`);
      await evaluate(`let field=document.querySelector('#wb-hypothesis');field.value='Bản nháp VNM chưa qua debounce';field.dispatchEvent(new Event('input',{bubbles:true}));`);
      await click('#ws-tab-dossier');await frames();
      checks.draftSurvivesRender=await evaluate(`document.querySelector('#wb-hypothesis').value.includes('Bản nháp VNM')`);
      await click('[data-wb-action="export-json"]');await wait('window.__downloaded');
      checks.immediateExport=await evaluate(`__downloaded.includes('Bản nháp VNM') && JSON.parse(__downloaded).dossiers[0].producer_state.research_action_posture==='AVOID'`);
      // Controlled response gates exercise stale completion without fake research data.
      console.log(width,'reliability: stale requests');
      await evaluate(`window.__originalDetail=VSWorkspaceReadModel.getTickerDetail;window.__gates=[];window.__outstanding=0;
        VSWorkspaceReadModel.getTickerDetail=(...args)=>{__outstanding++;return new Promise(resolve=>__originalDetail(...args).then(r=>{const release=()=>{__outstanding--;resolve(r)};release.ticker=args[0];__gates.push(release)}))};
        history.replaceState(null,'','?view=compare&tickers=HPG,PNJ&session=2026-10-23');`);
      await click('#ws-tab-compare');await wait('__gates.length>=2');await click('[data-wb-action="compare-clear"]');
      await evaluate('__gates.splice(0).forEach(resolve=>resolve())');await frames();
      checks.clearCancelsPending=await evaluate(`!document.querySelector('#wb-compare-heading')`);
      await evaluate(`history.replaceState(null,'','?view=compare&tickers=HPG,PNJ&session=2026-10-23');VSInvestigationWorkbench.renderView('compare');`);await wait('__gates.length>=2');
      await evaluate(`history.replaceState(null,'','?view=compare&tickers=HPG,ZZZZZZ&session=2026-10-23');VSInvestigationWorkbench.renderView('compare');__gates.splice(0).forEach(resolve=>resolve());`);await frames();
      checks.invalidRequestCancelsPending=await evaluate(`!document.querySelector('#wb-compare-heading') && !!document.querySelector('#wb-compare-result [role=alert]')`);
      await click('#ws-tab-dossier');await select('TCB');await evaluate(`VSInvestigationWorkbench.renderView('dossier',{focus:true})`);await wait('__outstanding>0 && __gates.length===__outstanding');
      await click('#ws-tab-journal');await evaluate('__gates.splice(0).forEach(resolve=>resolve())');await frames();
      checks.leavingViewCancelsPending=await evaluate(`!document.querySelector('[data-dossier-ticker="TCB"]')`);
      await click('#ws-tab-dossier');await select('HPG');await select('PNJ');await wait('__outstanding>0 && __gates.length===__outstanding');
      await evaluate(`__gates.filter(f=>f.ticker==='PNJ').forEach(f=>f());__gates=__gates.filter(f=>f.ticker!=='PNJ');`);await wait(`document.querySelector('[data-dossier-ticker="PNJ"]')`);
      await evaluate('__gates.splice(0).forEach(resolve=>resolve())');await frames();
      checks.olderTickerCannotReplaceNewer=await evaluate(`!!document.querySelector('[data-dossier-ticker="PNJ"]')`);
      await evaluate('VSWorkspaceReadModel.getTickerDetail=__originalDetail');
      await click('#ws-tab-dossier');await select('VNM');await wait(`document.querySelector('[data-dossier-ticker="VNM"]')`);
      // Real File/Blob content, delayed FileReader delivery, two imports and a draft edit.
      console.log(width,'reliability: imports');
      await click('#ws-tab-journal');
      await evaluate(`window.__readers=[];window.__FileReader=FileReader;window.FileReader=class{readAsText(file){file.text().then(text=>{this.result=text;__readers.push(()=>this.onload())})}};
        for(const [ticker,note] of [['HPG','older import'],['FPT','last import']]){
          const journal=VSInvestigationWorkbench.emptyJournal();const {entry}=VSInvestigationWorkbench.upsertEntry(journal,'dossier',[ticker],'2026-10-23');VSInvestigationWorkbench.setHypothesis(entry,note);
          const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(VSInvestigationWorkbench.exportJournal(journal))],'journal.json',{type:'application/json'}));
          const input=document.querySelector('[data-wb-import]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
        }`);
      await wait('__readers.length===2');await click('#ws-tab-dossier');await select('VNM');await wait(`document.querySelector('#wb-hypothesis')`);
      await evaluate(`const field=document.querySelector('#wb-hypothesis');field.value='Draft during import';field.dispatchEvent(new Event('input',{bubbles:true}));__readers[1]();__readers[0]();window.FileReader=__FileReader;`);await frames();
      await evaluate('window.__downloaded=null');await click('[data-wb-action="export-json"]');await wait('window.__downloaded');
      await click('#ws-tab-journal');await evaluate('window.__downloaded=null');await click('[data-wb-action="journal-export"]');await wait('window.__downloaded');
      checks.importRace=await evaluate(`const content=JSON.parse(__downloaded);content.entries.some(e=>e.hypothesis.includes('Draft during import')) && content.entries.some(e=>e.hypothesis.includes('last import')) && !content.entries.some(e=>e.hypothesis.includes('older import'))`);
      // Each bad shard is a response fault only: committed data remains untouched.
      for(const fault of ['http','malformed','identity','session','offline']){
        console.log(width,'reliability:',fault);
        await click('#ws-tab-journal');
        await evaluate(`VSWorkspaceReadModel.clearShardCache();window.__fetch=window.fetch;window.fetch=async (...args)=>{
          if(!String(args[0]).includes('/workspace_detail/'))return __fetch(...args);
          if(${JSON.stringify(fault)}==='http')return new Response('',{status:404});
          if(${JSON.stringify(fault)}==='malformed')return new Response('{broken');
          const res=await __fetch(...args);const doc=await res.json();
          if(${JSON.stringify(fault)}==='identity')doc.source_artifact_identity='wrong';
          if(${JSON.stringify(fault)}==='session')doc.as_of_session='2026-10-22';return new Response(JSON.stringify(doc));};`);
        if(fault==='offline')await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
        await click('#ws-tab-dossier');await select('HPG');await wait(`document.querySelector('[data-dossier-ticker="HPG"]')`);
        const refused=await evaluate(`document.querySelector('#wb-dossier').textContent.includes('Tạm chưa tải được dữ liệu chi tiết')`);
        await evaluate('window.fetch=__fetch');if(fault==='offline')await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
        if(await evaluate(`!!document.querySelector('[data-wb-action="dossier-retry"]')`))await click('[data-wb-action="dossier-retry"]');
        else await evaluate(`VSInvestigationWorkbench.renderView('dossier')`);
        await wait(`!document.querySelector('#wb-dossier').textContent.includes('Đang tải hồ sơ') && !!document.querySelector('[data-dossier-ticker="HPG"]')`);
        checks[fault+'Retry']=refused && await evaluate(`!document.querySelector('#wb-dossier').textContent.includes('Tạm chưa tải được dữ liệu chi tiết')`);
      }
      await evaluate(`document.querySelector('#ws-tab-dossier').focus()`);
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight'});
      checks.keyboard=await evaluate(`document.activeElement.id==='ws-tab-compare' && document.querySelector('#ws-tab-compare').getAttribute('aria-selected')==='true'`);
      report.cases.push(row);console.log(width,JSON.stringify({fiveMs:row.fiveShardMs,heap:row.fiveHeap,plainRequests:row.plainDetailRequests}));
      fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify(report,null,2));
      await cdp.send('Target.closeTarget',{targetId});cdp.listeners=cdp.listeners.filter(fn=>fn!==listener);
    }
    fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify(report,null,2));
    if(!baseline && report.cases.some(c=>!c.comparisonExportParity || c.overflow || c.plainDetailRequests || c.sameShardRequests.length!==1 || c.fiveRequests.length!==5 || new Set(c.fiveRequests.map(r=>r.url)).size!==5 || Object.values(c.reliability).some(v=>v!==true)))throw new Error('Browser reliability acceptance failed: see measurements.json');
  } finally {if(cdp){await cdp.send('Browser.close').catch(()=>{});cdp.socket.close();}else chrome.kill();server.closeAllConnections();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
