import { createMarketData } from './market-data.mjs';
import { createBriefing } from './briefing.mjs';
import { createLiveStream } from './live-stream.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const symbols = new Map([
...['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','JPM','V','JNJ','XOM','WMT'].map(s=>['US:'+s,s]),
...['AZN','SHEL','HSBA','ULVR','GSK','LLOY','BARC','TSCO','VOD','RIO'].map(s=>['UK:'+s,s+'.L']),
['UK:BP.','BP.L'],['UK:NG.','NG.L']
]);
export function macroCategory(name='') {
 if (/non.?farm|payroll/i.test(name)) return 'Jobs / NFP';
 if (/interest rate|rate decision|fomc|bank rate|monetary policy|boe.*rate|fed.*rate/i.test(name)) return 'Interest rates';
 if (/inflation|\bcpi\b|\bpce\b/i.test(name)) return 'Inflation';
 if (/unemployment|employment change|jobless|claimant/i.test(name)) return 'Jobs';
 if (/\bgdp\b|gross domestic/i.test(name)) return 'Growth';
 return null;
}
function cleanNews(rows) {
 const seen=new Set();
 return rows.filter(x=>x && typeof x.title==='string' && typeof x.url==='string').flatMap(x=>{
  let url;try{url=new URL(x.url)}catch{return []}
  if(!['http:','https:'].includes(url.protocol)||seen.has(url.href))return [];
  seen.add(url.href);
  return [{title:x.title,url:url.href,publisher:x.publisher||x.site||url.hostname,date:x.publishedDate||null}];
 });
}
export function createServer({apiKey=process.env.FMP_API_KEY,fetchImpl=fetch}={}) {
 const cache=new Map();
 const briefing=createBriefing({fetchImpl});
 const marketData=createMarketData({fetchImpl});
 const liveStream=createLiveStream();
 async function provider(path,params) {
  if(!apiKey)throw {status:503,message:'News connection not configured. Add FMP_API_KEY to the server environment.'};
  const key=path+'?'+new URLSearchParams(params);
  const saved=cache.get(key);if(saved&&Date.now()-saved.at<300000)return saved;
  const url=new URL('https://financialmodelingprep.com/stable/'+path);
  Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,String(v)));url.searchParams.set('apikey',apiKey);
  let response,data;
  try{response=await fetchImpl(url,{signal:AbortSignal.timeout(12000)});data=await response.json()}catch{throw {status:502,message:'The news provider could not be reached. Please retry.'}}
  if(!response.ok||!Array.isArray(data)){
   const status=response.status===429?429:502;
   throw {status,message:response.status===429?'Provider rate limit reached. Please try again later.':'Provider access failed. Check the API key and plan access to stock news and the economic calendar.'};
  }
  const item={data,at:Date.now()};if(cache.size>=300)cache.delete(cache.keys().next().value);cache.set(key,item);return item;
 }
 return http.createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};
  try{
   const url=new URL(req.url,'http://localhost');
   if(req.method!=='GET')return send(405,{error:'Only GET is supported.'});
   if(url.pathname==='/api/live')return liveStream.subscribe(req,res);
   if(url.pathname==='/api/quote')return send(200,await marketData.quote(url.searchParams.get('stock')));
   if(url.pathname==='/api/chart')return send(200,await marketData.history(url.searchParams.get('stock'),url.searchParams.get('period')||'1M'));
   if(url.pathname==='/api/briefing')return send(200,await briefing(url.searchParams.get('stock')));
   if(url.pathname==='/api/news'){
    const symbol=symbols.get(url.searchParams.get('stock'));
    const page=Number(url.searchParams.get('page')||0);
    if(!symbol||!Number.isInteger(page)||page<0||page>49)return send(400,{error:'Invalid stock or page.'});
    const range=url.searchParams.get('range')||'all';
    if(!['all','7','30','90'].includes(range))return send(400,{error:'Invalid news range.'});
    const params={symbols:symbol,limit:20,page};
    if(range!=='all'){
     const now=new Date(),from=new Date(now);from.setUTCDate(from.getUTCDate()-Number(range));
     params.from=from.toISOString().slice(0,10);params.to=now.toISOString().slice(0,10);
    }
    const result=await provider('news/stock',params);
    return send(200,{items:cleanNews(result.data),hasMore:result.data.length===20&&page<49,range,limitReached:result.data.length===20&&page===49,page,asOf:new Date(result.at).toISOString(),provider:'Financial Modeling Prep',symbol});
   }
   if(url.pathname==='/api/macro'){
    const now=new Date(),from=new Date(now),to=new Date(now);
    from.setUTCDate(from.getUTCDate()-7);to.setUTCDate(to.getUTCDate()+14);
    const start=from.toISOString().slice(0,10),end=to.toISOString().slice(0,10);
    const result=await provider('economic-calendar',{from:start,to:end});
    const items=result.data.filter(x=>x&&['US','USA','United States','GB','GBR','UK','United Kingdom'].includes(x.country))
     .filter(x=>typeof x.event==='string'&&typeof x.date==='string'&&x.date.slice(0,10)>=start&&x.date.slice(0,10)<=end&&macroCategory(x.event))
     .map(x=>({name:x.event,country:['US','USA','United States'].includes(x.country)?'US':'UK',date:x.date,category:macroCategory(x.event),actual:x.actual??null,estimate:x.estimate??null,previous:x.previous??null,unit:x.unit||'',impact:x.impact||'Not supplied'}))
     .sort((a,b)=>a.date.localeCompare(b.date));
    return send(200,{items,from:start,to:end,asOf:new Date(result.at).toISOString(),provider:'Financial Modeling Prep'});
   }
   const files={'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/news.js':['news.js','text/javascript; charset=utf-8'],'/quotes.js':['quotes.js','text/javascript; charset=utf-8']};
   const file=files[url.pathname];if(!file)return send(404,{error:'Not found'});
   res.writeHead(200,{'Content-Type':file[1],'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(await readFile(resolve(root,file[0])));
  }catch(e){send(e.status||500,{error:e.message&&e.status?e.message:'Unable to complete the request.'})}
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||3000);
 createServer().listen(port,'127.0.0.1',()=>console.log('Finance World: http://localhost:'+port));
}

