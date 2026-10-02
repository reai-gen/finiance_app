import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, macroCategory } from './server.mjs';
async function useServer(options,run) {
 const server=createServer(options);
 const request=async input=>new Promise((resolve,reject)=>{
  const url=new URL(input);let status=200,headers={};
  const res={writeHead:(code,h)=>{status=code;headers=h},end:body=>resolve(new Response(body,{status,headers}))};
  Promise.resolve(server.listeners('request')[0]({method:'GET',url:url.pathname+url.search},res)).catch(reject);
 });
 await run('http://localhost',request);
}
const mock=data=>async()=>({ok:true,status:200,json:async()=>data});
test('missing key reports setup, not empty news',async()=>{
 await useServer({apiKey:''},async (base,fetch)=>{const r=await fetch(base+'/api/news?stock=US:AAPL');assert.equal(r.status,503);assert.match((await r.json()).error,/configured/)});
});
test('normalises UK symbol, deduplicates URLs and rejects unsafe links; caches responses',async()=>{
 let calls=0;
 await useServer({apiKey:'private-test-key',fetchImpl:async url=>{
  calls++;assert.equal(url.searchParams.get('symbols'),'BP.L');
  return {ok:true,status:200,json:async()=>[
   {title:'Valid',url:'https://example.com/story',publisher:'Example'},
   {title:'Duplicate',url:'https://example.com/story'},
   {title:'Unsafe',url:'javascript:alert(1)'}
  ]};
 }},async (base,fetch)=>{
  const url=base+'/api/news?stock=UK:BP.';
  const data=await(await fetch(url)).json();assert.equal(data.items.length,1);assert.equal(data.symbol,'BP.L');assert.equal(data.hasMore,false);
  assert(!JSON.stringify(data).includes('private-test-key'));await fetch(url);assert.equal(calls,1);
 });
});
test('validates symbols and page limits before requesting data',async()=>{
 await useServer({apiKey:'x',fetchImpl:()=>{throw Error('Should not call')}},async (base,fetch)=>{
  for(const query of ['stock=US:FAKE','stock=US:AAPL&page=-1','stock=US:AAPL&page=1.5','stock=US:AAPL&page=50'])assert.equal((await fetch(base+'/api/news?'+query)).status,400);
 });
});
test('macro filter keeps relevant UK/US events and preserves zero',async()=>{
 const date=new Date().toISOString().slice(0,10)+' 12:30:00';
 await useServer({apiKey:'x',fetchImpl:mock([
  {event:'Nonfarm Payrolls',country:'US',date,actual:0,estimate:120,previous:150,unit:'K'},
  {event:'BoE Interest Rate Decision',country:'GB',date,actual:null,estimate:4},
  {event:'CPI',country:'US',date,actual:2},
  {event:'GDP',country:'GB',date},
  {event:'Nonfarm Payrolls',country:'CA',date},
  {event:'Unrelated survey',country:'US',date}
 ])},async (base,fetch)=>{const data=await(await fetch(base+'/api/macro')).json();assert.equal(data.items.length,4);assert.equal(data.items[0].actual,0);assert.equal(data.items[1].country,'UK')});
});
test('recognises NFP, rates, inflation and growth',()=>{
 assert.equal(macroCategory('CPI (YoY)'),'Inflation');
 assert.equal(macroCategory('GDP (QoQ)'),'Growth');
 assert.equal(macroCategory('Non-Farm Payrolls'),'Jobs / NFP');
 assert.equal(macroCategory('Fed Interest Rate Decision'),'Interest rates');
});
test('provider errors remain errors and do not expose key',async()=>{
 await useServer({apiKey:'secret',fetchImpl:async()=>({ok:false,status:403,json:async()=>({'Error Message':'secret'})})},async (base,fetch)=>{
  const r=await fetch(base+'/api/news?stock=US:AAPL');assert.equal(r.status,502);const data=await r.text();assert(!data.includes('secret'));assert.match(data,/plan access/);
 });
});
test('serves app assets but never environment or server source',async()=>{
 await useServer({apiKey:''},async (base,fetch)=>{
  assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/news.js')).status,200);
  for(const path of ['/.env','/server.mjs','/README.md'])assert.equal((await fetch(base+path)).status,404);
 });
});
