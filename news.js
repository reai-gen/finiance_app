(() => {
 const byId=id=>document.getElementById(id);
 const chooser=byId('news-stock'), newsList=byId('news-list'), macroList=byId('macro-list');
 const status=byId('news-status'), macroStatus=byId('macro-status'), more=byId('news-more');
 let current=null,page=0,controller=null,macroController=null,seen=new Set(),macroItems=[];
 stocks.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(stock=>{
  const option=document.createElement('option');option.value=stock.id;option.textContent=stock.name+' · '+stock.ticker+' ('+stock.market+')';chooser.append(option);
 });
 const text=(tag,value,className)=>{const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el};
 const time=value=>value?String(value).replace('T',' ').replace('Z',' UTC'):'Time not supplied';
 async function get(path,signal){
  if(location.protocol==='file:')throw new Error('Open the app through its local server to connect to news. See README for setup.');
  const res=await fetch(path,{signal});
  let data;try{data=await res.json()}catch{throw new Error('The news server is not running. Start the app using node server.mjs.')}
  if(!res.ok)throw new Error(data.error||'News request failed.');
  return data;
 }
 function report(error,target){if(error.name!=='AbortError')target.textContent=error.message}
 async function loadNews(reset=false){
  if(!current)return;
  controller?.abort();controller=new AbortController();const signal=controller.signal;
  if(reset){page=0;seen=new Set();newsList.replaceChildren()}
  more.hidden=true;more.disabled=true;status.textContent='Loading headlines for '+current.name+'…';
  try{
   const data=await get('/api/news?stock='+encodeURIComponent(current.id)+'&page='+page,signal);
   if(signal.aborted)return;
   for(const article of data.items){
    if(seen.has(article.url))continue;
    let url;try{url=new URL(article.url)}catch{continue}
    if(!['https:','http:'].includes(url.protocol))continue;
    seen.add(article.url);
    const item=text('article','', 'headline'),link=text('a',article.title);
    link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';
    item.append(text('div',(article.publisher||'Publisher')+' · '+time(article.date),'story-meta'),link);
    newsList.append(item);
   }
   status.textContent=seen.size?seen.size+' headlines · retrieved '+new Date(data.asOf).toLocaleString('en-GB')+' · FMP':'No provider headlines found for this stock in the last 30 days. Coverage varies, especially for UK listings.';
   more.hidden=!data.hasMore;more.disabled=false;
  }catch(error){if(signal.aborted)return;report(error,status);if(page>0){more.hidden=false;more.disabled=false;page--}}
 }
 function context(stock){
  const sectors={
   Technology:'For technology companies, rate expectations are one lens for considering valuations and financing costs.',
   Financials:'For financial companies, consider lending margins, funding costs and credit demand when reviewing rate news.',
   Consumer:'For consumer companies, jobs and inflation releases offer context on household spending and costs.',
   Energy:'For energy companies, economic growth can be relevant to demand; commodity-specific news also matters.',
   Materials:'For materials companies, consider industrial demand and economic growth alongside commodity prices.',
   Utilities:'For utilities, consider financing costs and how regulation may affect the response to rates.',
   Healthcare:'For healthcare companies, macro conditions are one input alongside company results and regulatory developments.',
   Communication:'For communication companies, consider advertising demand, household spending and financing costs.'
  };
  return (sectors[stock.sector]||'Consider financing costs and demand alongside company-specific news.')+' These are general research prompts, not a prediction of this stock’s price.';
 }
 function renderMacro(){
  macroList.replaceChildren();
  const filter=byId('macro-filter').value,today=new Date().toISOString().slice(0,10);
  const items=macroItems.filter(e=>filter==='all'||e.category===filter);
  for(const event of items){
   const card=text('article','','macro-event');
   card.append(text('div',event.country+' · '+event.category+' · '+event.date.slice(0,10),'story-meta'),text('h4',event.name));
   const phase=event.actual!==null?'Actual reported':event.date.slice(0,10)<today?'Past date · result unavailable':'Scheduled · result pending';
   card.append(text('p',phase+' · Provider impact: '+event.impact,'event-phase'));
   const values=text('div','','event-values');
   [['Actual',event.actual],['Forecast',event.estimate],['Previous',event.previous]].forEach(([label,value])=>values.append(text('span',label+': '+(value===null?'—':String(value)+(event.unit?' '+event.unit:'')))));
   card.append(values);
   const why=event.category==='Interest rates'?'Watch for changes to policy and guidance. Borrowing costs and valuation assumptions may change.':event.category.startsWith('Jobs')?'Compare jobs data with expectations and revisions. It may change the discussion around growth and interest rates.':event.category==='Inflation'?'Compare inflation with expectations. It may change the outlook for costs and monetary policy.':'Growth data offers context on demand; it does not determine an individual stock’s direction.';
   card.append(text('p',why,'event-context'));macroList.append(card);
  }
  if(!items.length)macroList.append(text('p','No matching UK/US events returned in this window. This does not mean there is no macro risk.','news-help'));
 }
 async function loadMacro(){
  macroController?.abort();macroController=new AbortController();const signal=macroController.signal;
  macroItems=[];macroList.replaceChildren();macroStatus.textContent='Loading recent and upcoming economic releases…';
  try{
   const data=await get('/api/macro',signal);if(signal.aborted)return;
   macroItems=data.items;macroStatus.textContent=data.from+' to '+data.to+' · retrieved '+new Date(data.asOf).toLocaleString('en-GB')+' · FMP';
   renderMacro();
  }catch(error){if(!signal.aborted)report(error,macroStatus)}
 }
 function select(stock){
  controller?.abort();current=stock;more.hidden=true;
  if(!stock){newsList.replaceChildren();status.textContent='Choose a stock to load its news.';return}
  chooser.value=stock.id;byId('news-context').textContent=context(stock);loadNews(true);
 }
 chooser.addEventListener('change',()=>{
  // Selecting here also updates the original explorer.
  const stock=stocks.find(s=>s.id===chooser.value);
  market='all';search.value='';sector.value='all';selectedId=stock.id;
  document.querySelectorAll('[data-market]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.market==='all')));
  renderRows();
 });
 window.addEventListener('stock-selected',e=>{if(e.detail?.id!==current?.id)select(e.detail)});
 byId('news-refresh').addEventListener('click',()=>{loadNews(true);loadMacro()});
 more.addEventListener('click',()=>{page++;loadNews()});
 byId('macro-filter').addEventListener('change',renderMacro);
 select(stocks.find(s=>s.id===selectedId));loadMacro();
})();
