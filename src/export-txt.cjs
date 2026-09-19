function formatTxt(payload,name){
 const lines=['聊存 · 聊天文字记录',`会话：${name||payload.session}`,`时间范围：${payload.start||'不限开始日期'} 至 ${payload.end||'不限结束日期'}`,`时区：${payload.timezone||'本机时区'}`,`文字消息：${payload.messages.length} 条`,''];
 for(const m of payload.messages){const sender=m.direction==='本人'?'我':m.senderName||(payload.session.endsWith('@chatroom')?m.sender||'未识别成员':m.direction==='对方'?name||'对方':m.sender||'未识别发送者');lines.push(`[${m.time}] ${sender}`,String(m.text??''),'');}
 if(!payload.messages.length)lines.push('此时间范围内没有文字记录。');
 return '\uFEFF'+lines.join('\n').replace(/\r?\n/g,'\r\n');
}
module.exports={formatTxt};
