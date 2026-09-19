const path = require('node:path');
const { bindings } = require('./native.cjs');
const { cleanWxid, normalizeSessions, normalizeMessages } = require('./model.cjs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { parentPort } = require('node:worker_threads');
const { openPure, messages: pureMessages, initializeReader,readMessages } = require('./pure-reader.cjs');
const run = promisify(execFile);
let api, key = null, handle = null, self = '', stopped = false, busy = false, initialized = false, pure = null;
let sessionIds = new Set();
const send = (m) => { if (parentPort) parentPort.postMessage(m); else if (process.connected) process.send(m); };
const fail = (code) => { throw new Error(code); };
function closeDatabase() {
  if(pure){for(const f of pure.files)f.db.close();pure=null;}
  if (handle !== null) { try { api.close(handle); } finally { handle = null; } }
  if (initialized) { try { api.shutdown(); } finally { initialized = false; } }
  sessionIds.clear();
}
async function listProcesses() {
  const script = "Get-Process -Name Weixin,WeChat -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,@{n='HasWindow';e={$_.MainWindowHandle -ne 0}} | ConvertTo-Json -Compress; exit 0";
  const { stdout } = await run('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script], {windowsHide: true, timeout: 10000});
  if (!stdout.trim()) return [];
  const result = JSON.parse(stdout.replace(/^\uFEFF/, ''));
  return (Array.isArray(result) ? result : [result]).map(p => ({pid: p.Id, name: p.ProcessName, hasWindow: p.HasWindow}));
}
async function dispatch(action, data) {
  if (action === 'processes') return listProcesses();
  if (action === 'open' && key) {
    closeDatabase();self=data.wxid||'';
    pure = await openPure(data.account, key.toString('ascii'));
    sessionIds = new Set(pure.sessions.map(s=>s.id));
    return {sessions:pure.sessions};
  }
  if (['messages','export'].includes(action) && pure) {
    if(!sessionIds.has(data.session)) fail('NO_SESSION');
    return readMessages(pure,data.session,key.toString('ascii'),self,{start:data.start,end:data.end,offset:data.offset??0,all:action==='export'});
  }
  if (action === 'preflight') {
    try { const SQL=await initializeReader(); const test=new SQL.Database();test.exec('SELECT 1');test.close();return {resources:true,exports:true,readerReady:true,code:0,stage:'pure-wasm'}; }
    catch { return {resources:false,exports:false,readerReady:false,code:-2001,stage:'pure-wasm'}; }
  }
  if (!api) api = bindings(process.env.CHATKEEP_NATIVE_DIR);
  if (action === 'preflight') {
    // Initialization is checked without attaching to WeChat or opening any database.
    const code = api.protection(process.env.CHATKEEP_NATIVE_DIR);
    if(code!==0)return {resources:true,exports:true,readerReady:false,code,stage:'protection'};
    if(initialized)return {resources:true,exports:true,readerReady:true,code:0,stage:'initialized'};
    const initCode=api.init();
    if(initCode===0)api.shutdown();
    return {resources:true,exports:true,readerReady:initCode===0,code:initCode,stage:'initialized'};
  }
  if (action === 'close') { closeDatabase(); return {closed:true}; }
  if (action === 'capture') {
    const processes = await listProcesses();
    if (!Number.isInteger(data.pid) || !processes.some(p => p.pid === data.pid)) fail('PROCESS_CHANGED');
    closeDatabase(); key?.fill(0); key = null; stopped = false;
    const buffer = Buffer.alloc(128);
    try {
      if (!api.hook(data.pid)) fail('CONNECT_FAILED');
      const deadline = Date.now() + 90000;
      let checkAt = 0;
      while (Date.now() < deadline) {
        if (stopped) fail('CANCELLED');
        if (Date.now() > checkAt) {
          checkAt = Date.now() + 1500;
          if (!(await listProcesses()).some(p => p.pid === data.pid)) fail('PROCESS_CHANGED');
        }
        if (api.poll(buffer, buffer.length)) {
          const value = buffer.toString('utf8').split('\0')[0].trim();
          if (/^[a-f0-9]{64}$/i.test(value)) { key = Buffer.from(value, 'ascii'); return {captured: true}; }
        }
        // Drain diagnostic queue, never expose native messages (may contain secrets).
        const status = Buffer.alloc(512);
        for (let i = 0; i < 5; i++) { if (!api.status(status, status.length, [0])) break; status.fill(0); }
        await new Promise(r => setTimeout(r, 150));
      }
      fail('CAPTURE_TIMEOUT');
    } finally { buffer.fill(0); api.cleanup(); }
  }
  if (action === 'set-key') {
    const value = String(data.key || '').trim();
    if (!/^[a-f0-9]{64}$/i.test(value)) fail('KEY_FORMAT');
    key?.fill(0); key = Buffer.from(value, 'ascii');
    closeDatabase();
    return {accepted:true, key:value};
  }
  if (action === 'get-key') {
    if (!key) fail('NO_KEY');
    return {key:key.toString('ascii')};
  }
  if (action === 'open') {
    if (!key) fail('NO_KEY');
    pure = await openPure(data.account, key.toString('ascii'));
    sessionIds = new Set(pure.sessions.map(s=>s.id));
    return {sessions:pure.sessions};
    /* Native fallback below is intentionally unreachable while the pure reader is active. */
    closeDatabase();
    const code = api.protection(process.env.CHATKEEP_NATIVE_DIR);
    if (code !== 0) fail(`READER_INIT:${code}`);
    const rc = api.init(); if (rc !== 0) fail(`READER_INIT:${rc}`); initialized = true;
    const out = [0];
    const result = api.open(path.join(data.account, 'db_storage', 'session', 'session.db'), key.toString('ascii'), out);
    if (result !== 0 || !out[0]) { closeDatabase(); fail(`OPEN_FAILED:${result}`); }
    handle = out[0]; self = data.wxid || cleanWxid(path.basename(data.account));
    try {
      const setSelf = api.self(handle, self); if (setSelf !== 0) fail(`READ_FAILED:${setSelf}`);
      const rows = api.json(api.sessions, handle);
      let sessions = normalizeSessions(rows);
      const names = {};
      for (let i=0; i<sessions.length; i+=100) {
        try { Object.assign(names, api.json(api.names, handle, JSON.stringify(sessions.slice(i,i+100).map(s=>s.id)))); } catch { /* Names optional, IDs remain usable. */ }
      }
      sessions = normalizeSessions(rows, names); sessionIds = new Set(sessions.map(s=>s.id));
      return {sessions};
    } catch (e) { closeDatabase(); throw e; }
  }
  if (action === 'messages') {
    if (pure) { if(!sessionIds.has(data.session)) fail('NO_SESSION'); return {messages:pureMessages(pure.files,data.session),scanned:100}; }
    if (handle === null || !sessionIds.has(data.session)) fail('NO_SESSION');
    const rows = api.json(api.messages, handle, data.session, 100, 0);
    return {messages: normalizeMessages(rows, self), scanned: rows.length};
  }
  fail('BAD_ACTION');
}
async function handleMessage(m) {
  if (m.action === 'cancel') { stopped = true; return; }
  if (m.action === 'shutdown') { stopped = true; const timer = setInterval(()=>{if (!busy) {clearInterval(timer); closeDatabase(); key?.fill(0); process.exit(0);}},50); return; }
  if (busy) {send({id:m.id, ok:false, code:'BUSY'});return;}
  busy = true;
  try { send({id:m.id, ok:true, value:await dispatch(m.action, m.data || {})}); }
  catch(e) {
    const code = String(e.message || '');
    if(code==='DATE_RANGE'){send({id:m.id,ok:false,code});return;}
    send({id:m.id, ok:false, code:/^(PROCESS_CHANGED|CONNECT_FAILED|CANCELLED|CAPTURE_TIMEOUT|NO_KEY|NO_SESSION|KEY_FORMAT|BAD_ACTION|RESOURCE_INTEGRITY|SESSION_FORMAT|MESSAGE_FORMAT|(?:READER_INIT|OPEN_FAILED|READ_FAILED|READER_LOAD):(?:-?\d+|KEY_OR_FORMAT|PAGE_GEOMETRY|NO_SESSION_DB|SQLITE|WASM))$/.test(code) ? code : 'COMPONENT_FAILED'});
  } finally {busy = false;}
}
if (parentPort) parentPort.on('message', handleMessage); else process.on('message', handleMessage);
const disconnect = ()=>{stopped=true;try {api?.cleanup();closeDatabase();} finally {key?.fill(0);if(!parentPort)process.exit(0);}};
if (parentPort) parentPort.on('close', disconnect); else process.on('disconnect', disconnect);
