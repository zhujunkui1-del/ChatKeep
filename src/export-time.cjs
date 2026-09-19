function timestampOf(message){
 const timestamp=typeof message.timestamp==='number'?message.timestamp:typeof message.time==='number'?message.time:NaN;
 if(!Number.isFinite(timestamp)||!Number.isFinite(new Date(timestamp*1000).getTime()))throw new Error('TIME_FORMAT');
 return timestamp;
}
function serializeMessage(message){
 const timestamp=timestampOf(message),d=new Date(timestamp*1000),pad=v=>String(v).padStart(2,'0');
 const time=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
 return {...message,time,timestamp};
}
module.exports={timestampOf,serializeMessage};
