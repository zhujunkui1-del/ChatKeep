const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {decryptFile}=require('../src/pure-reader.cjs');
test('SQLCipher v4 page boundaries, HMAC and no padding',()=>{
 const key='12'.repeat(32),salt=Buffer.alloc(16,7),aes=crypto.pbkdf2Sync(Buffer.from(key,'hex'),salt,256000,32,'sha512'),mac=crypto.pbkdf2Sync(aes,Buffer.from(salt.map(x=>x^0x3a)),2,32,'sha512');
 const plain=Buffer.alloc(8192,0x23);Buffer.from('SQLite format 3\0').copy(plain);const encrypted=Buffer.alloc(8192);salt.copy(encrypted);
 for(let i=0;i<2;i++){const off=i?0:16,p=encrypted.subarray(i*4096,(i+1)*4096),iv=Buffer.alloc(16,9+i),c=crypto.createCipheriv('aes-256-cbc',aes,iv);c.setAutoPadding(false);Buffer.concat([c.update(plain.subarray(i*4096+off,i*4096+4016)),c.final()]).copy(p,off);iv.copy(p,4016);const n=Buffer.alloc(4);n.writeUInt32LE(i+1);crypto.createHmac('sha512',mac).update(p.subarray(off,4032)).update(n).digest().copy(p,4032);}
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'zy-reader-'));try{const file=path.join(folder,'fixture.db');fs.writeFileSync(file,encrypted);const decoded=decryptFile(file,key);assert.equal(decoded.length,8192);assert.deepEqual(decoded.subarray(0,4016),plain.subarray(0,4016));assert.deepEqual(decoded.subarray(4096,8112),plain.subarray(4096,8112));assert.throws(()=>decryptFile(file,'34'.repeat(32)),/KEY_OR_FORMAT/);}finally{fs.rmSync(folder,{recursive:true,force:true});}
});
