const test=require('node:test'),assert=require('node:assert/strict');const {copyKey}=require('../src/clipboard.cjs');
test('copies validated plaintext with no secret returned',()=>{let written;const fake={writeText:s=>{written=s;},readText:()=>written};assert.deepEqual(copyKey(fake,'  '+'AB'.repeat(32)+'  '),{copied:true});assert.equal(written,'AB'.repeat(32));});
test('invalid input never changes clipboard',()=>{assert.throws(()=>copyKey({writeText:()=>assert.fail('write should not occur')},'invalid'),/KEY_FORMAT/);});
test('clipboard mismatch is reported as failure',()=>{assert.throws(()=>copyKey({writeText:()=>{},readText:()=>''},'12'.repeat(32)),/CLIPBOARD_FAILED/);});
