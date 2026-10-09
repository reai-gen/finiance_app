import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createMarketData,normaliseQuote} from './market-data.mjs';
import {createServer} from './server.mjs';
const now=Date.UTC(2026,9,9,15,0);
const result=(overrides={})=>({meta:{currency:'USD',regularMarketPrice:120,regularMarketTime:now/1000-30,chartPreviousClose:100,currentTradingPeriod:{regular:{start:now/1000-3600,end:now/1000+3600}},...overrides},timestamp:[now/1000-120,now/1000-60,now/1000],indicators:{quote:[{close:[110,null,120]}]}});
const response=data=>({ok:true,status:200,json:async()=>({chart:{result:[data],error:null}})});
test('quote uses actual metadata, regular-session previous close and provider timestamp',()=>{
 const quote=normaliseQuote(result(),'US:AAPL',now);
 assert.equal(quote.price,120);assert.equal(quote.change,20);assert.equal(quote.quoteTime,new Date(now-30000).toISOString());
 assert.equal(quote.fetchedAt,new Date(now).toISOString());assert.equal(quote.session,'Regular market hours');
});
test('UK pence stay pence, pounds stay pounds, missing prices never become zero',()=>{
 const pence=normaliseQuote(result({currency:'GBp',regularMarketPrice:712.4,chartPreviousClose:710}),'UK:HSBA',now);
 assert.equal(pence.currency,'GBX');assert.equal(pence.price,712.4);
 assert.equal(normaliseQuote(result({currency:'GBP'}),'UK:HSBA',now).currency,'GBP');
 for(const price of [undefined,null,NaN,0])assert.throws(()=>normaliseQuote(result({regularMarketPrice:price}),'US:AAPL',now));
 assert.equal(normaliseQuote(result({chartPreviousClose:undefined}),'US:AAPL',now).change,null);
});
test('quote requests use London ticker, daily close and sixty-second caching; failures do not return stale prices',async()=>{
 let time=now,calls=0,fail=false;
 const market=createMarketData({now:()=>time,fetchImpl:async url=>{
  calls++;assert.equal(url.pathname.split('/').at(-1),'BP.L');assert.equal(url.searchParams.get('range'),'1d');
  if(fail)throw Error('Offline');return response(result({currency:'GBp'}));
 }});
 await Promise.all([market.quote('UK:BP.'),market.quote('UK:BP.')]);assert.equal(calls,1);
 await market.quote('UK:BP.');assert.equal(calls,1);
 time+=61000;fail=true;await assert.rejects(market.quote('UK:BP.'),error=>error.status===502);assert.equal(calls,2);
});
test('history uses genuine prices, removes nulls and validates selectors before network calls',async()=>{
 const market=createMarketData({fetchImpl:async url=>{assert.equal(url.searchParams.get('range'),'1mo');return response(result())}});
 const data=await market.history('US:AAPL','1M');assert.deepEqual(data.points.map(p=>p.price),[110,120]);
 await assert.rejects(market.history('US:AAPL','BAD'),error=>error.status===400);
 await assert.rejects(market.quote('US:FAKE'),error=>error.status===400);
});
test('server exposes quote and chart without credentials and retains failures as errors',async()=>{
 const server=createServer({apiKey:'',fetchImpl:async()=>response(result())});
 const call=url=>new Promise(resolve=>server.listeners('request')[0]({method:'GET',url},{writeHead(status){this.status=status},end(body){resolve({status:this.status,data:JSON.parse(body)})}}));
 const quote=await call('/api/quote?stock=US:AAPL');assert.equal(quote.status,200);assert.equal(quote.data.price,120);
 assert.equal((await call('/api/chart?stock=US:AAPL&period=1M')).data.points.length,2);
 assert.equal((await call('/api/quote?stock=US:FAKE')).status,400);
});
test('frontend catalogue has no demo prices; formats missing quotes, GBX and GBP correctly',async()=>{
 const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
 const code=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 new vm.Script(code);
 assert(!code.includes('chartValues'));assert(!code.includes('214.32'));assert(!html.includes('fictional demo data'));
 const stub={value:'all',append(){},addEventListener(){}};
 const context=vm.createContext({document:{getElementById:()=>stub,createElement:()=>({})},Intl});
 vm.runInContext(code.slice(0,code.indexOf('function renderRows()')),context);
 assert.equal(vm.runInContext('stocks.length',context),24);
 assert.equal(vm.runInContext('stocks.every(s=>s.quote===null)',context),true);
 assert.equal(vm.runInContext('priceText(stocks[0])',context),'Loading…');
 assert.equal(vm.runInContext("priceText({quote:null,quoteError:'Offline'})",context),'Unavailable');
 assert.equal(vm.runInContext("priceText({quote:{price:712.4,currency:'GBX'}})",context),'712.40 GBX');
 assert.equal(vm.runInContext("priceText({quote:{price:7.124,currency:'GBP'}})",context),'£7.12');
});
test('automatic refresh removes previous prices on failure and old chart response cannot overwrite a new selection',async()=>{
 const code=await readFile(new URL('./quotes.js',import.meta.url),'utf8');
 let ticker='A',fail=false,resolveOld,intervalFn;const chart={textContent:'',replaceChildren(){},append(){}};
 const status={},button={addEventListener(){}};const painted=[];
 const chartPoints={points:[]};
 const windowHandlers={};
 const stocks=[{id:'US:AAPL',name:'Apple',quote:null},{id:'US:MSFT',name:'Microsoft',quote:null}];
 const context=vm.createContext({
  document:{hidden:false,getElementById:id=>id==='price-chart'?chart:id==='quote-refresh'?button:status,addEventListener(){},activeElement:null},
  window:{addEventListener:(event,fn)=>windowHandlers[event]=fn},stocks,selectedId:'US:AAPL',period:'1M',
  sort:{value:'name'},location:{protocol:'http:'},paintQuote:s=>painted.push(s.id),AbortController,Date,Intl,
  setInterval:fn=>{intervalFn=fn},
  fetch:async path=>{
   if(path.startsWith('/api/quote'))return {ok:!fail,json:async()=>fail?{error:'Offline'}:{price:123,quoteTime:new Date().toISOString()}};
   if(ticker==='A')return await new Promise(resolve=>resolveOld=()=>resolve({ok:true,json:async()=>chartPoints}));
   return {ok:true,json:async()=>chartPoints};
  }
 });
 vm.runInContext(code,context);
 await new Promise(resolve=>setImmediate(resolve));
 assert(stocks.every(s=>s.quote?.price===123));
 ticker='B';context.selectedId='US:MSFT';windowHandlers['chart-requested']({detail:{stock:stocks[1],period:'1M'}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(chart.textContent,/Not enough historical/);
 chart.textContent='New selection';resolveOld();await new Promise(resolve=>setImmediate(resolve));assert.equal(chart.textContent,'New selection');
 fail=true;intervalFn();await new Promise(resolve=>setImmediate(resolve));assert(stocks.every(s=>s.quote===null&&s.quoteError==='Offline'));
});
