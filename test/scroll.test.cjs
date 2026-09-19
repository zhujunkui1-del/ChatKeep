const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');const {page}=require('../src/pagination.cjs');
class Element{constructor(){this.value='';this.dataset={};this.children=[];this.listeners={};this.scrollTop=0;this.clientHeight=380;}get scrollHeight(){return this.children.length*100;}append(...x){this.children.push(...x);}prepend(...x){this.children.unshift(...x);}replaceChildren(...x){this.children=x;}addEventListener(name,fn){this.listeners[name]=fn;}}
test('scroll boundary loads one batch on demand and preserves anchor',async()=>{
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},calls=[];
 const fixture=Array.from({length:123},(_,i)=>({time:i,id:String(i),localId:String(i),database:'one',text:'fixture',direction:'本人'}));
 const context=vm.createContext({document:{getElementById:get,querySelectorAll:()=>[],createElement:()=>new Element(),createTextNode:x=>x},window:{probe:{onReset:()=>{},call:async(action,data)=>{calls.push(data.offset);return {ok:true,value:page(fixture,data.offset)};}}},Date,Set,console,navigator:{}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8'),context);
 await vm.runInContext("readMessages({id:'fixture',name:'测试会话'})",context);assert.deepEqual(calls,[0]);const box=get('messageList');assert.equal(box.children.length,50);
 box.scrollTop=0;const oldHeight=box.scrollHeight;await vm.runInContext("loadPage('older')",context);assert.deepEqual(calls,[0,50]);assert.equal(box.children.length,100);assert.equal(box.scrollTop,box.scrollHeight-oldHeight);
 box.scrollTop=0;await vm.runInContext("loadPage('older')",context);assert.equal(box.children.length,123);await vm.runInContext("loadPage('older')",context);assert.deepEqual(calls,[0,50,100]);
});
