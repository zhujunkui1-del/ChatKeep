const SIZE=50;
function compare(a,b){const time=b.time-a.time;if(time)return time;const x=BigInt(a.localId||0),y=BigInt(b.localId||0);if(x!==y)return x>y?-1:1;return String(a.database).localeCompare(String(b.database));}
function page(items,offset=0){if(!Number.isSafeInteger(offset)||offset<0)throw new Error('PAGE_RANGE');const sorted=items.slice().sort(compare);const selected=sorted.slice(offset,offset+SIZE);return {messages:selected.reverse(),olderOffset:sorted.length>offset+SIZE?offset+SIZE:null,newerOffset:offset>0?Math.max(0,offset-SIZE):null,pageSize:SIZE};}
module.exports={page,compare,SIZE};
