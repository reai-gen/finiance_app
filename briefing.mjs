const names = {
'US:AAPL':'Apple','US:MSFT':'Microsoft','US:NVDA':'NVIDIA','US:GOOGL':'Alphabet','US:AMZN':'Amazon','US:META':'Meta Platforms','US:TSLA':'Tesla','US:JPM':'JPMorgan Chase','US:V':'Visa','US:JNJ':'Johnson & Johnson','US:XOM':'Exxon Mobil','US:WMT':'Walmart',
'UK:AZN':'AstraZeneca','UK:SHEL':'Shell','UK:HSBA':'HSBC','UK:ULVR':'Unilever','UK:BP.':'BP','UK:GSK':'GSK','UK:LLOY':'Lloyds Banking Group','UK:BARC':'Barclays','UK:TSCO':'Tesco','UK:VOD':'Vodafone','UK:RIO':'Rio Tinto','UK:NG.':'National Grid'
};
export function plain(value=''){
 return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
 .replace(/&(?:amp|lt|gt|quot|apos|#39|#x[0-9a-f]+|#\d+);/gi,e=>{
  const basic={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'"};
  if(basic[e.toLowerCase()])return basic[e.toLowerCase()];
  const n=e.toLowerCase().startsWith('&#x')?parseInt(e.slice(3,-1),16):parseInt(e.slice(2,-1),10);
  return Number.isFinite(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
 }).replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
export function parseFeed(xml,now=Date.now()){
 if(!/<rss\b/i.test(xml))throw Error('Invalid RSS response');
 const rows=[],seen=new Set();
 for(const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){
  const item=match[1],field=tag=>plain(item.match(new RegExp('<'+tag+'\\b[^>]*>([\\s\\S]*?)</'+tag+'>','i'))?.[1]||'');
  const title=field('title'),date=new Date(field('pubDate'));
  let url;try{url=new URL(field('link'))}catch{continue}
  if(url.hostname.endsWith('bing.com')&&url.searchParams.get('url')){
   try{url=new URL(url.searchParams.get('url'))}catch{continue}
  }
  if(!['https:','http:'].includes(url.protocol)||!title||!Number.isFinite(date.getTime())||date.getTime()<now-7*86400000||date.getTime()>now+3600000)continue;
  url.searchParams.delete('.tsrc');url.hash='';
  const key=title.toLowerCase().replace(/\W/g,'');
  if(seen.has(key))continue;seen.add(key);
  const publisher=field('News:Source')||field('source')||url.hostname.replace(/^www\./,'');
  rows.push({title,excerpt:field('description'),url:url.href,publisher,date:date.toISOString()});
 }
 return rows.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,25);
}
export function briefPoints(items,max=4){
 return items.slice(0,max).map(item=>{
  const content=item.excerpt||item.title;
  // Extractive summary: preserve attribution and qualifiers rather than inventing
  // a causal story. Bound excerpts; the full story remains at its publisher.
  const first=content.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
  let summary=first&&first.length>=45?first:content;
  if(summary.length>280)summary=summary.slice(0,277).replace(/\s+\S*$/,'')+'…';
  return {...item,summary,excerpt:undefined,basis:item.excerpt?'Publisher excerpt':'Headline only'};
 });
}
export function createBriefing({fetchImpl=fetch}={}){
 const cache=new Map();
 async function feed(url){
  const key=url.toString(),saved=cache.get(key);
  if(saved&&Date.now()-saved.at<300000)return saved;
  const response=await fetchImpl(url,{headers:{'User-Agent':'FinanceWorld/1.0 RSS reader','Accept':'application/rss+xml, application/xml, text/xml'},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('Feed unavailable');
  const xml=await response.text();if(xml.length>2000000)throw Error('Feed too large');
  const result={items:parseFeed(xml),at:Date.now()};
  if(cache.size>=80)cache.delete(cache.keys().next().value);cache.set(key,result);return result;
 }
 const bing=query=>{const url=new URL('https://www.bing.com/news/search');url.searchParams.set('q',query);url.searchParams.set('format','rss');return url};
 async function company(stock){
  const ticker=stock.split(':')[1].replace(/\.$/,'')+(stock.startsWith('UK:')?'.L':'');
  const url=new URL('https://finance.yahoo.com/rss/headline');url.searchParams.set('s',ticker);
  try{const result=await feed(url);if(result.items.length)return result}catch{}
  return feed(bing('"'+names[stock]+'" '+(stock.startsWith('UK:')?'UK shares':'stock')));
 }
 const macroQueries=[
 {topic:'US jobs / NFP',query:'US nonfarm payrolls jobs report',why:'Jobs surprises can change expectations for growth and Federal Reserve policy.'},
 {topic:'US interest rates',query:'Federal Reserve interest rate decision',why:'Changes in rate expectations may affect financing costs and stock valuations.'},
 {topic:'UK rates & inflation',query:'Bank of England interest rates UK inflation',why:'UK rate and inflation news can affect borrowing costs, sterling and consumer demand.'}
 ];
 return async stock=>{
  if(!Object.hasOwn(names,stock))throw {status:400,message:'Unknown stock.'};
  const [companyResult,...macroResults]=await Promise.allSettled([company(stock),...macroQueries.map(q=>feed(bing(q.query)))]);
  const companyData=companyResult.status==='fulfilled'?companyResult.value:null;
  const macro=macroQueries.map((q,i)=>{
   const result=macroResults[i],data=result.status==='fulfilled'?result.value:null;
   return {topic:q.topic,why:q.why,points:briefPoints(data?.items||[],2),asOf:data?new Date(data.at).toISOString():null,error:data?null:'This news feed is temporarily unavailable.'};
  });
  return {stock,name:names[stock],company:{points:briefPoints(companyData?.items||[]),articles:(companyData?.items||[]).map(({excerpt,...item})=>item),asOf:companyData?new Date(companyData.at).toISOString():null,error:companyData?null:'Company news is temporarily unavailable. Please retry.'},macro,generatedAt:new Date().toISOString(),method:'Extractive briefing from recent headlines and publisher excerpts. Full articles have not been read. Coverage is not exhaustive.'};
 };
}

