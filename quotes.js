(() => {
 const feedStatus=document.getElementById('quote-feed-status'),refresh=document.getElementById('quote-refresh');
 let refreshing=false,chartController=null,lastChartKey=null;
 const historyCache=new Map();
 async function api(path,signal){
  if(location.protocol==='file:')throw Error('Open localhost:3000 after starting the app with node server.mjs.');
  let response;try{response=await fetch(path,{signal})}catch(error){if(error.name==='AbortError')throw error;throw Error('The market-data server could not be reached. Please retry.')}
  let data;try{data=await response.json()}catch{throw Error('Start the app with node server.mjs, then open localhost:3000.')}
  if(!response.ok)throw Error(data.error||'Market data is unavailable.');
  return data;
 }
 async function refreshQuotes(){
  if(refreshing)return;refreshing=true;refresh.disabled=true;
  let completed=0;const order=stocks.slice().sort((a,b)=>a.id===selectedId?-1:b.id===selectedId?1:0);
  feedStatus.textContent='Retrieving the latest available prices…';
  let index=0;
  async function worker(){
   while(index<order.length){
    const stock=order[index++];
    try{stock.quote=await api('/api/quote?stock='+encodeURIComponent(stock.id));stock.quoteError=null}
    catch(error){stock.quote=null;stock.quoteError=error.message}
    paintQuote(stock);completed++;
    feedStatus.textContent='Checked '+completed+' / '+stocks.length+' companies…';
   }
  }
  await Promise.all(Array.from({length:4},worker));
  const available=stocks.filter(s=>s.quote).length;
  feedStatus.textContent=available+' / '+stocks.length+' quotes available · checked '+new Date().toLocaleTimeString('en-GB')+' · auto-check every minute · provider/exchange delays may apply.';
  if(!available)feedStatus.textContent+=' '+(stocks.find(s=>s.quoteError)?.quoteError||'Please retry.');
  refreshing=false;refresh.disabled=false;
  if(sort.value!=='name'){
   const focused=document.activeElement?.classList.contains('stock-button')?document.activeElement.dataset.stock:null;
   renderRows();
   if(focused)[...rows.querySelectorAll('.stock-button')].find(button=>button.dataset.stock===focused)?.focus({preventScroll:true});
  }
 }
 function drawHistory(data,stock){
  const target=document.getElementById('price-chart');if(!target)return;
  target.replaceChildren();
  const items=data.points;
  if(!items?.length){target.textContent='No OHLC candle data returned for this interval. The provider may not cover it.';return}
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 760 300');svg.setAttribute('class','chart candle-chart');svg.setAttribute('role','img');
  const title=document.createElementNS(ns,'title');title.textContent=stock.name+' '+data.period+' candlestick history in '+data.currency;svg.append(title);
  const low=Math.min(...items.map(x=>x.low)),high=Math.max(...items.map(x=>x.high)),pad=(high-low||high*.01)*.07;
  const min=low-pad,max=high+pad;
  const y=value=>270-(value-min)/(max-min)*245;
  const left=45,width=696,step=width/items.length,bodyWidth=Math.max(1,Math.min(step*.7,14));
  const add=(kind,attrs)=>{const el=document.createElementNS(ns,kind);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));svg.append(el);return el};
  for(let i=0;i<=4;i++){
   const v=min+(max-min)*i;
   add('line',{x1:left,y1:y(v),x2:755,y2:y(v),stroke:'#ece3eb','stroke-width':1});
   const label=add('text',{x:2,y:y(v)+4,fill:'#776674','font-size':11});label.textContent=v.toFixed(2);
  }
  items.forEach((c,i)=>{
   const x=left+(i+.5)*step,up=c.close>=c.open,color=up?'#15845f':'#bf4564';
   const wick=add('line',{x1:x,y1:y(c.high),x2:x,y2:y(c.low),stroke:color,'stroke-width':Math.max(1,Math.min(2,step*.25))});
   const top=Math.min(y(c.open),y(c.close)),height=Math.max(1,y(Math.min(c.open,c.close))-top);
   const rect=add('rect',{x:x-bodyWidth/2,y:top,width:bodyWidth,height,fill:color});
   const tip=document.createElementNS(ns,'title');tip.textContent=new Date(c.time).toLocaleString('en-GB')+' O '+c.open.toFixed(2)+' H '+c.high.toFixed(2)+' L '+c.low.toFixed(2)+' C '+c.close.toFixed(2)+' '+data.currency;rect.append(tip);
  });
  target.append(svg);
  const labels=document.createElement('div');labels.className='chart-labels';
  for(const item of [items[0],items.at(-1)]){const span=document.createElement('span');span.textContent=new Date(item.time).toLocaleString('en-GB');labels.append(span)}
  target.append(labels);
  const note=detail.querySelector('.chart-note');if(note)note.textContent='Candles: open, high, low, close · '+data.frequency+' · '+data.source+' · latest data may be delayed.';
 }
 async function loadChart(stock,requestedPeriod){
  chartController?.abort();chartController=new AbortController();const signal=chartController.signal;
  lastChartKey=stock?.id+'|'+requestedPeriod;
  if(!stock)return;
  const key=lastChartKey,target=document.getElementById('price-chart');
  if(!target)return;
  const cached=historyCache.get(key);
  if(cached&&Date.now()-cached.at<60000){drawHistory(cached.data,stock);return}
  target.textContent='Loading historical prices…';
  try{
   const data=await api('/api/chart?stock='+encodeURIComponent(stock.id)+'&period='+requestedPeriod,signal);
   if(signal.aborted||lastChartKey!==key||stock.id!==selectedId)return;
   historyCache.set(key,{data,at:Date.now()});drawHistory(data,stock);
  }catch(error){if(!signal.aborted&&lastChartKey===key){const el=document.getElementById('price-chart');if(el)el.textContent=error.message}}
 }
 window.addEventListener('chart-requested',event=>loadChart(event.detail.stock,event.detail.period));
 refresh.addEventListener('click',()=>{refreshQuotes();loadChart(stocks.find(s=>s.id===selectedId),period)});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshQuotes();loadChart(stocks.find(s=>s.id===selectedId),period)}});
 setInterval(()=>{if(!document.hidden){refreshQuotes();loadChart(stocks.find(s=>s.id===selectedId),period)}},60000);
 refreshQuotes();loadChart(stocks.find(s=>s.id===selectedId),period);
})();
