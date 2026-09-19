const {app, BrowserWindow, ipcMain, dialog, session,clipboard} = require('electron');
const {copyKey}=require('./clipboard.cjs');
const {timestampOf,serializeMessage}=require('./export-time.cjs');
const {formatTxt}=require('./export-txt.cjs');
const {sameLocalPage}=require('./page-origin.cjs');
const path = require('node:path');
const fs = require('node:fs/promises');
const {Worker} = require('node:worker_threads');
const {pathToFileURL} = require('node:url');
const {snapshot} = require('./snapshot.cjs');
const {cleanWxid} = require('./model.cjs');
const crypto=require('node:crypto');
let win, worker, counter=0, account=null, snapshotDir=null, operation=false, quitting=false;
app.setName('ChatKeep');
app.setPath('userData',path.join(app.getPath('appData'),'ChatKeep'));
const pending = new Map();
const root = app.isPackaged ? path.join(process.resourcesPath,'native') : path.join(__dirname,'..','native');
process.env.CHATKEEP_NATIVE_DIR = root;
const page = pathToFileURL(path.join(__dirname,'index.html')).href;
const smoke = process.argv.includes('--smoke');
const check = process.argv.includes('--check-components');
if(smoke)app.disableHardwareAcceleration();
if (smoke || check) app.setPath('userData',path.join(app.getPath('temp'),'chatkeep-check'));
const messages = {
  CLIPBOARD_FAILED:'复制未成功，请检查系统剪贴板是否被其他程序占用。',
  DATE_RANGE:'日期范围无效，请检查开始、结束日期。',
  PROCESS_CHANGED:'微信进程已变化。请刷新列表后重新连接。', CONNECT_FAILED:'未能连接微信。请确认所选窗口正确，且两个程序运行权限一致。',
  CANCELLED:'已取消连接。', CAPTURE_TIMEOUT:'等待登录超时。请回到微信登录界面，重新开始获取，再完成登录。',
  NO_KEY:'请先获取密钥。', NO_SESSION:'请先读取会话并选择一项。', BUSY:'上一步尚未结束。',
  COMPONENT_FAILED:'本地组件无法运行，请保留此错误编号用于排查。', RESOURCE_INTEGRITY:'本地组件校验失败，请重新获取完整程序。',
  READER_INIT:'本地读取服务初始化失败。', OPEN_FAILED:'未能打开数据库，请检查账号目录与当前登录账号是否对应。',
  READ_FAILED:'读取数据失败。', DATABASE_BUSY:'复制期间微信数据发生了变化，请稍后重试。',
  SNAPSHOT_TOO_LARGE:'当前最多复制 4 GB 数据。当前账号超出验证范围。', SNAPSHOT_FAILED:'无法创建数据副本，请检查目录与剩余空间。',
  ACCOUNT_REQUIRED:'请选择包含 db_storage 的账号目录。', KEY_FORMAT:'密钥必须是 64 位十六进制字符。',
  SESSION_FORMAT:'会话数据格式暂不支持。', MESSAGE_FORMAT:'消息数据格式暂不支持。', TIMEOUT:'操作超时，读取服务已停止，请重新获取密钥。',
  WORKER_EXIT:'读取服务已退出，请重新获取密钥。'
};
function error(code) {const specific={'OPEN_FAILED:KEY_OR_FORMAT':'密钥或数据库格式不匹配，第一页完整性校验未通过。','OPEN_FAILED:PAGE_GEOMETRY':'数据库大小不符合当前支持的页格式。','OPEN_FAILED:SQLITE':'数据库副本无法被读取。','READER_LOAD:WASM':'读取组件文件加载失败，请使用完整的新版本目录。'};return {ok:false,code,message:specific[code]||messages[code.split(':')[0]] || '操作未完成，请重试。'};}
function startWorker() {
  worker=new Worker(path.join(__dirname,'worker.cjs'),{env:{...process.env,CHATKEEP_NATIVE_DIR:root}});
  const current=worker;
  current.on('message',m=>{const p=pending.get(m.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);m.ok?p.resolve(m.value):p.reject(new Error(m.code));});
  current.on('exit',()=>{if(worker!==current)return;worker=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('WORKER_EXIT'));}pending.clear();try{if(win&&!win.isDestroyed()&&!win.webContents.isDestroyed())win.webContents.send('service-reset');}catch{}});
  current.on('error',()=>{});
}
function request(action,data={}) {
  if(!worker)startWorker();
  const id=++counter;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);void worker?.terminate();reject(new Error('TIMEOUT'));},action==='capture'?110000:60000);
    pending.set(id,{resolve,reject,timer});
    try { worker.postMessage({id,action,data}); }
    catch { clearTimeout(timer); pending.delete(id); reject(new Error('WORKER_EXIT')); }
  });
}
async function chooseAccount() {
  const result=await dialog.showOpenDialog(win,{title:'选择微信账号目录或 xwechat_files 目录',properties:['openDirectory']});
  if(result.canceled)return null;
  const selected=result.filePaths[0];
  const candidates=[];
  const valid=async p=>{try{await fs.access(path.join(p,'db_storage','session','session.db'));return true;}catch{return false;}};
  if(await valid(selected))candidates.push(selected);
  else for(const entry of await fs.readdir(selected,{withFileTypes:true})){if(entry.isDirectory()&&!entry.isSymbolicLink()){const p=path.join(selected,entry.name);if(await valid(p))candidates.push(p);}}
  if(!candidates.length)throw new Error('ACCOUNT_REQUIRED');
  return candidates.map(p=>({path:p,name:path.basename(p),wxid:cleanWxid(path.basename(p))}));
}
let allowedAccounts=new Set();
app.whenReady().then(async()=>{
  await fs.mkdir(app.getPath('userData'),{recursive:true});
  if(check){
    try{const value=await request('preflight');process.stdout.write(JSON.stringify(value)+'\n');worker?.postMessage({action:'shutdown'});setTimeout(()=>app.exit(value.readerReady?0:2),300);}
    catch(e){process.stdout.write(JSON.stringify(error(e.message))+'\n');app.exit(2);}return;
  }
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('file://')}));
  win=new BrowserWindow({width:1120,height:820,minWidth:860,minHeight:650,show:!smoke,autoHideMenuBar:true,title:'聊存 · ChatKeep',backgroundColor:'#f8f0df',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,devTools:false,offscreen:smoke,backgroundThrottling:false}});
  const screenshot=smoke?new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('RENDER_TIMEOUT')),15000);win.webContents.once('paint',(_event,_dirty,image)=>{clearTimeout(timer);resolve(image);});}):null;
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  ipcMain.handle('probe',async(event,action,data={})=>{
    if(!win||win.isDestroyed()||event.sender!==win.webContents)return error('BAD_ACTION');
    const frame=event.senderFrame,main=win.webContents.mainFrame;
    if(!frame||frame.processId!==main.processId||frame.routingId!==main.routingId||!sameLocalPage(frame.url,page))return error('BAD_ACTION');
    if(action==='cancel'){worker?.postMessage({action:'cancel'});return {ok:true};}
    if(operation)return error('BUSY');operation=true;
    try {
      let value;
      if(action==='choose-account'){value=await chooseAccount();if(value)allowedAccounts=new Set(value.map(v=>v.path));}
      else if(action==='select-account'){
        if(!allowedAccounts.has(data.path))throw new Error('ACCOUNT_REQUIRED');
        account=data.path;value={wxid:cleanWxid(path.basename(account))};
      }
      else if(action==='open'){
        if(!account)throw new Error('ACCOUNT_REQUIRED');
        await request('close');
        if(snapshotDir){await fs.rm(snapshotDir,{recursive:true,force:true});snapshotDir=null;}
        try{snapshotDir=await snapshot(account,path.join(app.getPath('userData'),'working-copies'));}
        catch(e){throw new Error(['DATABASE_BUSY','SNAPSHOT_TOO_LARGE'].includes(e.message)?e.message:'SNAPSHOT_FAILED');}
        value=await request('open',{account:snapshotDir,wxid:cleanWxid(path.basename(account))});
      }
      else if(['download','sync-local'].includes(action)){
        const result=await request('export',data);
        const payload={source:'wechat',self:cleanWxid(path.basename(account)),session:data.session,start:data.start||null,end:data.end||null,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,messages:result.messages.map(serializeMessage)};
        if(action==='download'){
          const format=data.format==='txt'?'txt':'json';
          const name=String(data.name||'会话').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,70);
          const chosen=await dialog.showSaveDialog(win,{title:'保存聊天文字记录',defaultPath:path.join(app.getPath('downloads'),name+'.'+format),filters:[{name:format==='txt'?'文字记录 TXT':'JSON',extensions:[format]}]});
          if(chosen.canceled)return {ok:true,value:null};await fs.writeFile(chosen.filePath,format==='txt'?formatTxt(payload,data.name):JSON.stringify(payload,null,2),'utf8');value={saved:true,count:result.messages.length};
        }else{
          const dir=path.join(app.getPath('userData'),'local-sync');await fs.mkdir(dir,{recursive:true});
          const filename=path.join(dir,crypto.createHash('sha256').update(account+'\0'+data.session).digest('hex')+'.json');
          let previous=[];try{previous=JSON.parse(await fs.readFile(filename,'utf8')).messages;}catch(e){if(e.code!=='ENOENT')throw new Error('READ_FAILED:LOCAL_SYNC');}
          const merged=new Map(previous.map(m=>[m.database+'\0'+m.id,m]));const before=merged.size;for(const m of result.messages)merged.set(m.database+'\0'+m.id,m);
          payload.messages=[...merged.values()].sort((a,b)=>timestampOf(a)-timestampOf(b)).map(serializeMessage);await fs.writeFile(filename,JSON.stringify(payload));value={added:merged.size-before,total:merged.size};
        }
      }
      else if(action==='copy-key'){value=copyKey(clipboard,data.key);}
      else if(['preflight','processes','capture','messages','set-key','get-key'].includes(action))value=await request(action,data);
      else throw new Error('BAD_ACTION');
      return {ok:true,value};
    }catch(e){return error(e.message);}finally{operation=false;}
  });
  await win.loadFile(path.join(__dirname,'index.html'));
  if(smoke){
    const ipcCheck=await win.webContents.executeJavaScript('window.probe.call("preflight")');
    const info=await win.webContents.executeJavaScript('({title:document.title,steps:document.querySelectorAll("section").length,buttons:document.querySelectorAll("button").length})');
    const picture=await screenshot;
    const target=path.join(app.getPath('temp'),'chatkeep-smoke.png');await fs.writeFile(target,picture.toPNG());
    const report={...info,ipcVerified:ipcCheck.ok&&ipcCheck.value?.readerReady===true,rawUrlEqual:win.webContents.getURL()===page,screenshot:target};
    await fs.writeFile(path.join(app.getPath('temp'),'chatkeep-ui-verification.json'),JSON.stringify(report));
    process.stdout.write(JSON.stringify(report)+'\n');app.exit(report.ipcVerified?0:2);
  }
}).catch(()=>{process.stdout.write(JSON.stringify({ok:false,code:'APP_START_FAILED'})+'\n');app.exit(2);});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',e=>{
  if(quitting)return; e.preventDefault();quitting=true;
  const cleanup=async()=>{if(snapshotDir)await fs.rm(snapshotDir,{recursive:true,force:true}).catch(()=>{});app.exit(0);};
  if(worker){const current=worker;const timer=setTimeout(()=>{void current.terminate();},2500);current.once('exit',()=>{clearTimeout(timer);cleanup();});current.postMessage({action:'shutdown'});}else cleanup();
});
