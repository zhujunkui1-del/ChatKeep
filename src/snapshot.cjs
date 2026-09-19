const fs = require('node:fs/promises');
const path = require('node:path');
async function inventory(root, relative = '') {
  const results = [];
  for (const entry of await fs.readdir(path.join(root, relative), {withFileTypes:true})) {
    if (entry.isSymbolicLink()) throw new Error('SNAPSHOT_FAILED');
    const rel = path.join(relative, entry.name);
    if (entry.isDirectory()) results.push(...await inventory(root,rel));
    else if (entry.isFile() && /\.db(?:-wal)?$/i.test(entry.name)) {
      const stat = await fs.stat(path.join(root,rel)); results.push({rel,size:stat.size,mtime:stat.mtimeMs});
    }
  }
  return results.sort((a,b)=>a.rel.localeCompare(b.rel));
}
async function snapshot(account, parent) {
  const src = path.join(account, 'db_storage');
  await fs.access(path.join(src, 'session', 'session.db'));
  await fs.mkdir(parent,{recursive:true});
  const target = await fs.mkdtemp(path.join(parent,'account-'));
  try {
    const before = await inventory(src);
    if (before.reduce((s,f)=>s+f.size,0)>4*1024**3) throw new Error('SNAPSHOT_TOO_LARGE');
    for (const file of before) {
      const dst = path.join(target,'db_storage',file.rel);
      await fs.mkdir(path.dirname(dst),{recursive:true});
      await fs.copyFile(path.join(src,file.rel),dst);
    }
    if (JSON.stringify(before)!==JSON.stringify(await inventory(src))) throw new Error('DATABASE_BUSY');
    return target;
  } catch(e) { await fs.rm(target,{recursive:true,force:true}); throw e; }
}
module.exports = {snapshot, inventory};
