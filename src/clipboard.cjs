function copyKey(clipboard,value){
 const key=typeof value==='string'?value.trim():'';
 if(!/^[a-f0-9]{64}$/i.test(key))throw new Error('KEY_FORMAT');
 clipboard.writeText(key);
 if(clipboard.readText()!==key)throw new Error('CLIPBOARD_FAILED');
 return {copied:true};
}
module.exports={copyKey};
