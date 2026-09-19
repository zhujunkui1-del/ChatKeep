const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const initSqlJs=require('sql.js');
const PAGE=4096,RESERVE=80;
function decryptFile(file,keyHex){
 const input=fs.readFileSync(file);
 if(!/^[a-f0-9]{64}$/i.test(keyHex))throw new Error('KEY_FORMAT');
 if(input.length<PAGE||input.length%PAGE)throw new Error('OPEN_FAILED:PAGE_GEOMETRY');
 const salt=input.subarray(0,16),aes=crypto.pbkdf2Sync(Buffer.from(keyHex,'hex'),salt,256000,32,'sha512'),macKey=crypto.pbkdf2Sync(aes,Buffer.from(salt.map(x=>x^0x3a)),2,32,'sha512');
 const out=Buffer.alloc(input.length);Buffer.from('SQLite format 3').copy(out);
 try{
  for(let base=0;base<input.length;base+=PAGE){
   const page=input.subarray(base,base+PAGE),off=base===0?16:0,ce=PAGE-RESERVE;
   const iv=page.subarray(ce,ce+16),expected=page.subarray(ce+16),n=Buffer.alloc(4);n.writeUInt32LE(base/PAGE+1);
   const actual=crypto.createHmac('sha512',macKey).update(page.subarray(off,ce+16)).update(n).digest();
   if(!crypto.timingSafeEqual(actual,expected))throw new Error('OPEN_FAILED:KEY_OR_FORMAT');
   const d=crypto.createDecipheriv('aes-256-cbc',aes,iv);d.setAutoPadding(false);
   Buffer.concat([d.update(page.subarray(off,ce)),d.final()]).copy(out,base+off);
  }
  return out;
 }finally{aes.fill(0);macKey.fill(0);}
}
function tables(db){return db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0]?.values.map(x=>String(x[0]))||[];}
function rows(db,sql){try{const r=db.exec(sql)[0];return r?r.values.map(v=>Object.fromEntries(r.columns.map((c,i)=>[c,v[i]]))):[];}catch{return[];}}
function sessions(db){for(const t of tables(db)){const c=rows(db,`PRAGMA table_info(${JSON.stringify(t)})`).map(r=>String(r.name)),id=c.find(x=>/^(username|user_name|talker|session_id)$/i.test(x));if(id){const n=c.find(x=>/display|name|nickname|remark/i.test(x)),tm=c.find(x=>/sort|last.*time|timestamp/i.test(x));return rows(db,`SELECT * FROM ${JSON.stringify(t)} LIMIT 2000`).map(r=>({id:String(r[id]??''),name:String(r[n]??r[id]??''),time:Number(r[tm]??0),group:String(r[id]??'').endsWith('@chatroom')})).filter(x=>x.id);}}return[];}
function messages(dbs,session){for(const {db} of dbs)for(const t of tables(db)){const c=rows(db,`PRAGMA table_info(${JSON.stringify(t)})`).map(r=>String(r.name)),content=c.find(x=>/message_content|content|msg_content/i.test(x)),sid=c.find(x=>/username|talker|session_id|talker_id/i.test(x));if(!content||!sid)continue;const id=c.find(x=>/server_id|svr_id|local_id/i.test(x)),tm=c.find(x=>/create_time|timestamp|time/i.test(x)),send=c.find(x=>/is_send|send_flag/i.test(x)),type=c.find(x=>/local_type|type/i.test(x));const out=rows(db,`SELECT * FROM ${JSON.stringify(t)} WHERE ${JSON.stringify(sid)}=${JSON.stringify(session)} LIMIT 100`).filter(r=>!type||[1,3,49].includes(Number(r[type]))).map(r=>({id:String(r[id]??''),time:Number(r[tm]??0),direction:Number(r[send])===1?'本人':Number(r[send])===0?'对方':'未确定',text:String(r[content]??'').slice(0,2000)})).filter(r=>r.text);if(out.length)return out;}return[];}
async function openPure(account,key){
 const SQL=await initializeReader(),file=path.join(account,'db_storage/session/session.db');
 if(!fs.existsSync(file))throw new Error('OPEN_FAILED:NO_SESSION_DB');
 const bytes=decryptFile(file,key);let db;
 try{db=new SQL.Database(bytes);const list=sessions(db);if(!list.length)throw new Error('SESSION_FORMAT');const names=new Map();let contactDb;
 const storage=path.join(account,'db_storage');const contactDir=fs.readdirSync(storage).find(n=>n.toLowerCase()==='contact');
 if(contactDir){const cFile=path.join(storage,contactDir,'contact.db');if(fs.existsSync(cFile)){const cBytes=decryptFile(cFile,key);try{contactDb=new SQL.Database(cBytes);for(const r of rows(contactDb,'SELECT username,remark,nick_name FROM contact'))names.set(String(r.username),String(r.remark||r.nick_name||r.username));}finally{contactDb?.close();cBytes.fill(0);}}}
 for(const r of rows(db,'SELECT username,session_title FROM SessionNoContactInfoTable'))if(!names.has(String(r.username))&&r.session_title)names.set(String(r.username),String(r.session_title));
 for(const s of list)s.name=names.get(s.id)||s.name;
 list.sort((a,b)=>b.time-a.time);
 const msgRoot=path.join(account,'db_storage/message');const messageFiles=fs.existsSync(msgRoot)?fs.readdirSync(msgRoot).filter(n=>/^message_\d+\.db$/.test(n)).map(n=>path.join(msgRoot,n)):[];return{files:[{name:'session.db',db}],sessions:list,messageFiles,SQL,namedCount:list.filter(s=>s.name!==s.id).length};}
 catch(e){db?.close();throw e;}finally{bytes.fill(0);}
}
function readMessages(reader,session,key,self,options={}){
 const offset=options.offset??0;if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw new Error('PAGE_RANGE');
 const table='Msg_'+crypto.createHash('md5').update(session).digest('hex'),items=[];
 const range=dateRange(options.start,options.end);
 for(const file of reader.messageFiles){const bytes=decryptFile(file,key);let db;try{db=new reader.SQL.Database(bytes);const actual=tables(db).find(t=>t.toLowerCase()===table.toLowerCase());if(!actual)continue;const result=db.exec(`SELECT msg.*, CAST(msg.server_id AS TEXT) AS server_id, n.user_name AS sender_username FROM "${actual}" AS msg LEFT JOIN Name2Id AS n ON msg.real_sender_id=n.rowid WHERE msg.local_type=1 AND msg.create_time>=${range.start} AND msg.create_time<${range.end} ORDER BY msg.create_time DESC, msg.local_id DESC ${options.all?'':`LIMIT ${offset+51}`}`)[0];if(result)for(const values of result.values){const row=Object.fromEntries(result.columns.map((c,i)=>[c,values[i]]));row.is_send=row.sender_username?Number(row.sender_username===self):null;row.database=path.basename(file);items.push(row);}}catch{throw new Error('READ_FAILED:SQLITE');}finally{db?.close();bytes.fill(0);}}
 const {decodeContent}=require('./model.cjs');const selected=items.sort((a,b)=>a.create_time-b.create_time);const out=selected.map(r=>({id:String(r.server_id&&String(r.server_id)!=='0'?r.server_id:r.local_id),localId:String(r.local_id||0),database:r.database,time:Number(r.create_time),sender:r.sender_username||'',direction:r.is_send===1?'本人':r.is_send===0?'对方':'未确定',text:decodeContent(r.compress_content)||decodeContent(r.message_content)})).filter(r=>r.text);
 return options.all?{messages:out,scanned:items.length}:{...require('./pagination.cjs').page(out,offset),scanned:items.length};
}
function dateRange(start,end){
 const parse=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new Error('DATE_RANGE');const d=new Date(s+'T00:00:00');if(Number.isNaN(d.getTime())||d.getFullYear()!==Number(s.slice(0,4))||d.getMonth()+1!==Number(s.slice(5,7))||d.getDate()!==Number(s.slice(8,10)))throw new Error('DATE_RANGE');return d;};
 const first=start?parse(start):null,last=end?parse(end):null;if(first&&last&&first>last)throw new Error('DATE_RANGE');if(last)last.setDate(last.getDate()+1);return {start:first?Math.floor(first.getTime()/1000):0,end:last?Math.floor(last.getTime()/1000):253402214400};
}
async function initializeReader(){
 try{return await initSqlJs({wasmBinary:fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))});}
 catch{throw new Error('READER_LOAD:WASM');}
}
module.exports={openPure,messages,decryptFile,initializeReader,readMessages,dateRange};
