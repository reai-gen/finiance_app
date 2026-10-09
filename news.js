(() => {
 const get=id=>document.getElementById(id),chooser=get('news-stock'),status=get('news-status');
 let selected=null,controller;
 const node=(tag,value,className)=>{const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el};
 const source=(item)=>{
  const link=node('a',item.publisher+' · '+new Date(item.date).toLocaleDateString('en-GB')+' ↗');
  let url;try{url=new URL(item.url)}catch{return node('span','Source unavailable')}
  if(!['http:','https:'].includes(url.protocol))return node('span','Source unavailable');
  link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.className='story-meta';return link;
 };
 stocks.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(stock=>{
  const option=node('option',stock.name+' · '+stock.ticker+' ('+stock.market+')');option.value=stock.id;chooser.append(option);
 });
 function renderPoints(target,points){
  points.forEach(point=>{
   const card=node('article','','brief-point');
   card.append(node('p',point.summary),node('small',point.basis+' · ','story-meta'),source(point));target.append(card);
  });
 }
 function context(stock){
  const prompts={
   Technology:'For technology stocks, watch financing costs and valuation assumptions.',
   Financials:'For financial stocks, watch funding costs, lending margins and credit demand.',
   Consumer:'For consumer stocks, watch jobs, household spending and inflation.',
   Energy:'For energy stocks, watch demand, commodity prices and growth expectations.',
   Materials:'For materials stocks, watch industrial demand and commodity prices.',
   Utilities:'For utilities, watch borrowing costs and regulatory decisions.',
   Healthcare:'For healthcare stocks, company results and regulatory news may matter alongside macro news.',
   Communication:'For communication stocks, watch advertising demand and financing costs.'
  };
  return (prompts[stock.sector]||'Review company news alongside the wider economy.')+' These are general research considerations, not a prediction of this stock’s response.';
 }
 async function load(stock){
  controller?.abort();controller=new AbortController();const signal=controller.signal;selected=stock;
  get('company-brief').replaceChildren();get('macro-brief').replaceChildren();get('news-list').replaceChildren();get('news-setup').hidden=true;
  if(!stock){chooser.value='';status.textContent='Choose a stock to see its briefing.';get('news-context').textContent='';get('broader-news').hidden=true;return}
  chooser.value=stock.id;get('brief-title').textContent=stock.name+' · news in brief';
  get('news-context').textContent=context(stock);
  get('broader-news').hidden=false;get('broader-news').href='https://www.bing.com/news/search?q='+encodeURIComponent(stock.name+' stock');
  status.textContent='Reading recent news feeds for '+stock.name+'…';
  try{
   if(location.protocol==='file:')throw Error('Start the local app server, then open localhost:3000. No API key is needed.');
   const response=await fetch('/api/briefing?stock='+encodeURIComponent(stock.id),{signal});
   let data;try{data=await response.json()}catch{throw Error('The news server is not running. Start it using node server.mjs.')}
   if(!response.ok)throw Error(data.error||'Unable to load the briefing.');
   if(signal.aborted)return;
   if(data.company.error)get('company-brief').append(node('p',data.company.error,'news-help'));
   else if(!data.company.points.length)get('company-brief').append(node('p','No company stories from the last 7 days were returned. Try the broader news search.','news-help'));
   else renderPoints(get('company-brief'),data.company.points);
   const available=data.macro.filter(group=>!group.error).length;
   status.textContent='Briefing checked '+new Date(data.generatedAt).toLocaleString('en-GB')+' · '+(data.company.asOf?'Company feed retrieved '+new Date(data.company.asOf).toLocaleString('en-GB'):'Company feed unavailable')+' · '+available+'/3 macro feeds available.';
   data.macro.forEach(group=>{
    const section=node('section','','macro-event');section.append(node('h4',group.topic));
    if(group.error)section.append(node('p',group.error,'news-help'));
    else if(!group.points.length)section.append(node('p','No recent stories returned for this topic.','news-help'));
    else renderPoints(section,group.points);
    section.append(node('p','Possible relevance: '+group.why+' Direction and size of any effect are uncertain.','event-context'));
    get('macro-brief').append(section);
   });
   data.company.articles.forEach(article=>{
    const row=node('article','','headline');row.append(node('p',article.title),source(article));get('news-list').append(row);
   });
   get('sources-title').textContent='Browse source headlines ('+data.company.articles.length+')';
  }catch(error){
   if(signal.aborted)return;
   status.textContent=error.message;get('news-setup').hidden=false;
  }
 }
 chooser.addEventListener('change',()=>{
  market='all';search.value='';sector.value='all';selectedId=chooser.value;
  document.querySelectorAll('[data-market]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.market==='all')));
  renderRows();
 });
 window.addEventListener('stock-selected',event=>{if(event.detail?.id!==selected?.id)load(event.detail)});
 get('news-refresh').addEventListener('click',()=>load(selected));
 load(stocks.find(stock=>stock.id===selectedId));
})();

