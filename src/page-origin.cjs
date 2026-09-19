const path=require('node:path');const {fileURLToPath}=require('node:url');
function sameLocalPage(actual,expected){
 try{const a=new URL(actual),b=new URL(expected);if(a.protocol!=='file:'||b.protocol!=='file:'||a.search||b.search||a.hash||b.hash)return false;const normalize=u=>{const p=path.resolve(fileURLToPath(u));return process.platform==='win32'?p.toLowerCase():p;};return normalize(a)===normalize(b);}catch{return false;}
}
module.exports={sameLocalPage};
