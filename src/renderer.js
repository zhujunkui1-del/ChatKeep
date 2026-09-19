const $=id=>document.getElementById(id);
let busy=false,hasKey=false,hasAccount=false,sessions=[],selectedSession=null;
let olderOffset=null,newerOffset=null,pageRange=null,displayedCount=0,seenMessages=new Set(),pageLoading=false;
function resetPages(){olderOffset=null;newerOffset=null;pageRange=null;displayedCount=0;seenMessages.clear();}
function controls(){
  document.querySelectorAll('button,select').forEach(el=>el.disabled=busy);
  $('cancel').disabled=!busy || !$('capture').dataset.waiting;
  $('copyKey').disabled=busy||!/^[a-f0-9]{64}$/i.test($('manualKey').value.trim());$('open').disabled=busy||!hasKey||!hasAccount;$('useKey').disabled=busy;
  $('accounts').disabled=busy||!hasAccount;
  for(const id of ['download','applyDates','syncLocal'])$(id).disabled=busy||!selectedSession;
}
function clearPreview(){sessions=[];selectedSession=null;resetPages();$('count').textContent='尚未读取';$('sessionList').replaceChildren();$('messageList').replaceChildren();$('selected').textContent='文字预览';}
async function perform(action,data,text){
  if(busy)return null;busy=true;controls();$('status').textContent=text;
  try{
    const r=await window.probe.call(action,data);
    if(!r.ok){$('status').textContent=`${r.message}（${r.code}）`;return null;}
    $('status').textContent='操作完成。';return r.value;
  }catch{$('status').textContent='操作未完成，请重新打开程序。';return null;}
  finally{busy=false;controls();}
}
$('check').onclick=async()=>{const r=await perform('preflight',{},'正在检查本地组件，不连接微信…');if(r){$('checkResult').textContent=r.readerReady?'程序完整，读取服务初始化通过。':`程序完整，读取服务${r.stage==='protection'?'校验':'初始化'}未通过（${r.code}）。仍可单独验证密钥获取。`;}};
$('folder').onclick=async()=>{
  const r=await perform('choose-account',{},'请选择账号目录或 xwechat_files 文件夹…');if(!r)return;
  $('accounts').replaceChildren(...r.map(a=>{const o=document.createElement('option');o.value=a.path;o.textContent=a.name;return o;}));
  hasAccount=true;await selectAccount();controls();
};
async function selectAccount(){const p=$('accounts').value;const r=await perform('select-account',{path:p},'正在选择账号…');if(r){$('accountPath').textContent=`${p} · 本人账号：${r.wxid}`;clearPreview();}}
$('accounts').onchange=selectAccount;
$('refresh').onclick=async()=>{const r=await perform('processes',{},'正在查找微信窗口…');if(!r)return;
  r.sort((a,b)=>Number(b.hasWindow)-Number(a.hasWindow));
  $('processes').replaceChildren(...r.map(p=>{const o=document.createElement('option');o.value=p.pid;o.textContent=`${p.hasWindow?'有窗口':'后台进程'} · ${p.name} · ${p.pid}`;return o;}));
  if(!r.length){const o=document.createElement('option');o.value='';o.textContent='未找到微信，请启动后刷新';$('processes').append(o);}
};
$('capture').onclick=async()=>{
  const pid=Number($('processes').value);if(!pid){$('status').textContent='请先刷新并选择微信窗口。';return;}
  hasKey=false;clearPreview();$('capture').dataset.waiting='1';$('keyResult').textContent='正在等待本次连接…';
  const r=await perform('capture',{pid},'正在等待密钥，请在微信中完成登录。最长等待 90 秒…');
  delete $('capture').dataset.waiting;hasKey=!!r?.captured;if(hasKey){const k=await window.probe.call('get-key');if(k.ok)$('manualKey').value=k.value.key;}$('keyResult').textContent=hasKey?'已获取密钥，并已显示在输入框中。尚需读取会话验证其有效性。':'本次未获取到密钥。';controls();
};
$('useKey').onclick=async()=>{const value=$('manualKey').value.trim();const r=await perform('set-key',{key:value},'正在校验密钥格式…');if(r){hasKey=true;$('manualKey').value=r.key;$('keyResult').textContent='密钥格式正确。点击“创建副本并读取会话”验证它是否匹配账号。';controls();}};
$('copyKey').onclick=async()=>{const r=await perform('copy-key',{key:$('manualKey').value.trim()},'正在复制密钥…');if(r?.copied)$('status').textContent='密钥已复制到系统剪贴板。请妥善保存，不要泄露。';};
$('manualKey').addEventListener('input',controls);
$('cancel').onclick=()=>window.probe.call('cancel');
$('open').onclick=async()=>{clearPreview();const r=await perform('open',{},'正在复制数据库并读取会话，数据较多时需要一些时间…');if(r){sessions=r.sessions;$('count').textContent=`${sessions.length} 个会话`;$('keyResult').textContent='密钥已通过会话读取验证。';renderSessions();}};
function renderSessions(){const term=$('search').value.trim().toLowerCase();const matches=sessions.filter(s=>`${s.name} ${s.id}`.toLowerCase().includes(term));
  $('sessionList').replaceChildren(...matches.slice(0,200).map(s=>{const b=document.createElement('button');const kind=s.group?'群聊':s.id.startsWith('gh_')?'公众号':s.id.endsWith('@openim')?'外部联系人':['qqmail','opencustomerservicemsg','filehelper','newsapp','fmessage'].includes(s.id)?'服务会话':'好友';b.textContent=`${kind} · ${s.name===s.id?'未找到名称':s.name}`;const small=document.createElement('small');small.textContent=s.id;b.append(small);b.disabled=busy;b.onclick=()=>readMessages(s);return b;}));
  if(matches.length>200){const p=document.createElement('p');p.className='hint';p.textContent='当前显示前 200 项，可继续搜索缩小范围。';$('sessionList').append(p);}
}
$('search').oninput=renderSessions;
async function readMessages(s){
  if(busy||pageLoading)return;
  selectedSession=s;
  resetPages();$('messageList').replaceChildren();pageRange={start:$('startDate').value,end:$('endDate').value};
  const r=await perform('messages',{session:s.id,...pageRange,offset:0},'正在读取所选时段最近的 50 条文字…');if(!r)return;
  $('selected').textContent=`${s.name} · 文字预览`;
  olderOffset=r.olderOffset;newerOffset=r.newerOffset;
  $('messageList').replaceChildren(...messageElements(r.messages));
  if(!displayedCount){const p=document.createElement('p');p.className='empty';p.textContent='该日期范围内未找到文字记录。';$('messageList').append(p);}
  $('messageList').scrollTop=$('messageList').scrollHeight;pageStatus();
}
function messageElements(messages){return messages.filter(m=>{const id=m.database+'\0'+m.localId+'\0'+m.id;if(seenMessages.has(id))return false;seenMessages.add(id);return true;}).map(m=>{displayedCount++;const box=document.createElement('div');box.className='message';const small=document.createElement('small');small.textContent=`${m.direction} · ${m.time?new Date(m.time*1000).toLocaleString():'时间未知'}`;box.append(small,document.createTextNode(m.text));return box;});}
function pageStatus(){$('status').textContent=`已加载 ${displayedCount} 条文字。${olderOffset!==null?'上滑到顶端加载更早记录。':'已到最早记录。'}${newerOffset!==null?'下滑到底端加载更新记录。':'已到最新记录。'}`;}
async function loadPage(direction){
  if(busy||pageLoading||!selectedSession||!pageRange)return;
  const offset=direction==='older'?olderOffset:newerOffset;if(offset===null)return;
  if(pageRange.start!==$('startDate').value||pageRange.end!==$('endDate').value){$('status').textContent='日期已变更，请点击“查看所选时段”。';return;}
  pageLoading=true;const box=$('messageList'),height=box.scrollHeight,top=box.scrollTop;
  try{const r=await perform('messages',{session:selectedSession.id,...pageRange,offset},'正在加载相邻的 50 条文字…');if(!r)return;
    const elements=messageElements(r.messages);
    if(direction==='older'){olderOffset=r.olderOffset;box.prepend(...elements);box.scrollTop=top+box.scrollHeight-height;}
    else{newerOffset=r.newerOffset;box.append(...elements);box.scrollTop=top;}
    pageStatus();
  }finally{pageLoading=false;}
}
let lastScrollTop=0,userScroll=false;
const messageBox=$('messageList');
messageBox.addEventListener('wheel',e=>{userScroll=true;if(e.deltaY<0&&messageBox.scrollTop<=3)loadPage('older');else if(e.deltaY>0&&messageBox.scrollTop+messageBox.clientHeight>=messageBox.scrollHeight-3)loadPage('newer');},{passive:true});
messageBox.addEventListener('pointerdown',()=>{userScroll=true;});
messageBox.addEventListener('keydown',()=>{userScroll=true;});
messageBox.addEventListener('scroll',()=>{const top=messageBox.scrollTop,direction=top<lastScrollTop?'older':'newer';lastScrollTop=top;if(!userScroll||pageLoading||busy)return;if(direction==='older'&&top<=3)loadPage(direction);else if(direction==='newer'&&top+messageBox.clientHeight>=messageBox.scrollHeight-3)loadPage(direction);});
$('applyDates').onclick=()=>selectedSession&&readMessages(selectedSession);
$('download').onclick=async()=>{if(!selectedSession)return;const r=await perform('download',{session:selectedSession.id,name:selectedSession.name,start:$('startDate').value,end:$('endDate').value,format:$('downloadFormat').value},'正在导出所选范围内的全部文字…');if(r?.saved)$('status').textContent=`已导出 ${r.count} 条文字。`;};
$('syncLocal').onclick=async()=>{if(!selectedSession)return;const r=await perform('sync-local',{session:selectedSession.id,start:$('startDate').value,end:$('endDate').value},'正在增量保存所选时段到本机…');if(r)$('status').textContent=`本机保存完成，新增 ${r.added} 条，合计 ${r.total} 条。`;};
window.probe.onReset(()=>{hasKey=false;clearPreview();$('keyResult').textContent='连接已结束，请重新获取密钥。';controls();});
controls();
