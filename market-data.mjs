const symbols=new Map([
 ...['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','JPM','V','JNJ','XOM','WMT'].map(s=>['US:'+s,s]),
 ...['AZN','SHEL','HSBA','ULVR','GSK','LLOY','BARC','TSCO','VOD','RIO'].map(s=>['UK:'+s,s+'.L']),
 ['UK:BP.','BP.L'],['UK:NG.','NG.L']
]);
const periods={'1m':{range:'1d',interval:'1m'},'5m':{range:'5d',interval:'5m'},'15m':{range:'5d',interval:'15m'},'1h':{range:'1mo',interval:'60m'},'4h':{range:'1mo',interval:'60m'},'1d':{range:'5d',interval:'1d'},'1W':{range:'5d',interval:'1d'},'1M':{range:'1mo',interval:'1d'},'1Y':{range:'1y',interval:'1d'}};
const currencyOf=value=>value==='GBp'||value==='GBX'?'GBX':value;
export function normaliseQuote(result,stock,fetchedAt=Date.now()){
 const meta=result?.meta;
 const currency=currencyOf(meta?.currency);
 const price=meta?.regularMarketPrice,stamp=meta?.regularMarketTime;
 if(typeof price!=='number'||!Number.isFinite(price)||price<=0||typeof stamp!=='number'||!Number.isFinite(stamp)||stamp<=0||!['USD','GBP','GBX'].includes(currency)){
  throw {status:502,message:'The provider did not return a valid price, timestamp and currency.'};
 }
 const previous=meta.previousClose??meta.chartPreviousClose;
 const validPrevious=typeof previous==='number'&&Number.isFinite(previous)&&previous>0;
 const session=meta.currentTradingPeriod?.regular;
 const now=fetchedAt/1000;
 return {stock,symbol:symbols.get(stock),price,currency,previousClose:validPrevious?previous:null,
  change:validPrevious?(price-previous)/previous*100:null,
  quoteTime:new Date(stamp*1000).toISOString(),fetchedAt:new Date(fetchedAt).toISOString(),
  session:session&&Number.isFinite(session.start)&&Number.isFinite(session.end)?(now>=session.start&&now<session.end?'Regular market hours':'Outside regular market hours'):'Regular-session quote',
  source:'Yahoo Finance',delayNote:'Latest available regular-session quote; provider/exchange delays may apply.'};
}
export function createMarketData({fetchImpl=fetch,now=Date.now}={}){
 const cache=new Map(),pending=new Map();
 async function chart(stock,config){
  const symbol=symbols.get(stock);
  if(!symbol)throw {status:400,message:'Unknown stock.'};
  const key=stock+':'+config.range+':'+config.interval;
  const saved=cache.get(key);
  if(saved&&now()-saved.at<60000)return saved;
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{
   const url=new URL('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol));
   url.searchParams.set('range',config.range);url.searchParams.set('interval',config.interval);url.searchParams.set('includePrePost','false');
   let response,data;
   try{
    response=await fetchImpl(url,{headers:{'User-Agent':'Mozilla/5.0 FinanceWorld','Accept':'application/json'},signal:AbortSignal.timeout(10000)});
    data=await response.json();
   }catch{throw {status:502,message:'Market data could not be reached. Please retry.'}}
   if(!response.ok)throw {status:response.status===429?429:502,message:response.status===429?'The market-data provider is limiting requests. Please retry later.':'Market data is temporarily unavailable.'};
   const result=data?.chart?.result?.[0];
   if(data?.chart?.error||!result)throw {status:502,message:'No market data returned for this listing.'};
   const item={result,at:now()};
   // Validate quote data for snapshot requests before caching.
   if(config.range==='1d')normaliseQuote(result,stock,item.at);
   cache.set(key,item);return item;
  })();
  pending.set(key,task);
  try{return await task}finally{pending.delete(key)}
 }
 return {
  async quote(stock){
   const data=await chart(stock,{range:'1d',interval:'5m'});
   return normaliseQuote(data.result,stock,data.at);
  },
  async history(stock,period){
   if(!Object.hasOwn(periods,period))throw {status:400,message:'Invalid chart period.'};
   const data=await chart(stock,periods[period]);
   const currency=currencyOf(data.result.meta?.currency);
   if(!['USD','GBP','GBX'].includes(currency))throw {status:502,message:'Chart currency unavailable.'};
   const values=data.result.indicators?.quote?.[0]?.close||[];
   const points=(data.result.timestamp||[]).flatMap((time,i)=>{
    const price=values[i];
    return Number.isFinite(time)&&typeof price==='number'&&Number.isFinite(price)&&price>0?[{time:new Date(time*1000).toISOString(),price}]:[];
   });
   points.sort((a,b)=>a.time.localeCompare(b.time));
   return {stock,period,currency,points,fetchedAt:new Date(data.at).toISOString(),source:'Yahoo Finance',frequency:'Daily closing prices'};
  }
 };
}
