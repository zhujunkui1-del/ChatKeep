const test=require('node:test'),assert=require('node:assert/strict');
const {dateRange}=require('../src/pure-reader.cjs');const {decodeContent}=require('../src/model.cjs');
test('end date includes entire selected local day',()=>{const r=dateRange('2026-09-18','2026-09-18');assert.equal(r.start,new Date(2026,8,18).getTime()/1000);assert.equal(r.end,new Date(2026,8,19).getTime()/1000);});
test('reversed and impossible dates rejected',()=>{assert.throws(()=>dateRange('2026-09-19','2026-09-18'));assert.throws(()=>dateRange('2026-02-30',''));});
test('SQLite WASM binary text decoded',()=>{assert.equal(decodeContent(new Uint8Array(Buffer.from('真实文字'))),'真实文字');});
