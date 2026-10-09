(() => {
 const feedStatus=document.getElementById('quote-feed-status'),refresh=document.getElementById('quote-refresh');
 let refreshing=false,chartController=null,lastChartKey=null;
 let streamLabel='Streaming not configured';
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
    try{const snapshot=await api('/api/quote?stock='+encodeURIComponent(stock.id));
     const previous=stock.quote;
     stock.quote=previous?.source==='Finnhub'&&Date.parse(previous.quoteTime)>Date.parse(snapshot.quoteTime)?previous:snapshot;
     stock.quoteError=null}
    catch(error){stock.quote=null;stock.quoteError=error.message}
    paintQuote(stock);completed++;
    feedStatus.textContent='Checked '+completed+' / '+stocks.length+' companies…';
   }
  }
  await Promise.all(Array.from({length:4},worker));
  const available=stocks.filter(s=>s.quote).length;
  feedStatus.textContent=available+' / '+stocks.length+' quotes available · checked '+new Date().toLocaleTimeString('en-GB')+' · '+streamLabel+' · snapshot fallback every minute.';
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
  if(data.points.length<2){target.textContent='Not enough historical prices returned for this period.';return}
  const prices=data.points.map(p=>p.price),lo=Math.min(...prices),hi=Math.max(...prices);
  const range=hi-lo||Math.max(1,hi*.01),times=data.points.map(p=>new Date(p.time).getTime()),start=times[0],end=times.at(-1);
  const coords=data.points.map((p,i)=>((times[i]-start)/(end-start||1)*330+5).toFixed(1)+','+(160-(p.price-lo)/range*135).toFixed(1)).join(' ');
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 340 190');svg.classList.add('chart');svg.setAttribute('role','img');
  const title=document.createElementNS(ns,'title');title.textContent=stock.name+' historical closing prices; '+data.currency+'. Low '+lo.toFixed(2)+', high '+hi.toFixed(2)+'.';svg.append(title);
  const line=document.createElementNS(ns,'polyline');line.setAttribute('points',coords);line.setAttribute('stroke','#92538c');line.setAttribute('stroke-width','2.8');line.setAttribute('fill','none');line.setAttribute('stroke-linejoin','round');svg.append(line);
  const label=document.createElementNS(ns,'text');label.setAttribute('x','5');label.setAttribute('y','185');label.setAttribute('fill','#776674');label.setAttribute('font-size','10');label.textContent=lo.toFixed(2)+' – '+hi.toFixed(2)+' '+data.currency;svg.append(label);target.append(svg);
  const dates=document.createElement('div');dates.className='chart-labels';
  for(const date of [data.points[0].time,data.points.at(-1).time]){const span=document.createElement('span');span.textContent=new Date(date).toLocaleDateString('en-GB');dates.append(span)}
  target.append(dates);
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
 const stream=new EventSource('/api/live');
 stream.addEventListener('message',event=>{
  let message;try{message=JSON.parse(event.data)}catch{return}
  if(message.type==='status'){
   streamLabel=message.mode==='streaming'?'Live stream connected (waiting for trades)':message.mode==='unconfigured'?'Streaming not configured':'Streaming offline';
   return;
  }
  if(message.type!=='trade')return;
  const stock=stocks.find(s=>s.id===message.stock);
  if(!stock||!stock.quote||stock.quote.currency!==message.currency)return;
  const timestamp=Date.parse(message.quoteTime);
  if(!Number.isFinite(timestamp)||timestamp<=Date.parse(stock.quote.quoteTime)||!Number.isFinite(message.price)||message.price<=0)return;
  // Prevent GBP/pence or mismatched listings silently corrupting displayed values.
  if(message.price<stock.quote.price*.5||message.price>stock.quote.price*2)return;
  const previousClose=stock.quote.previousClose;
  stock.quote={...stock.quote,price:message.price,quoteTime:message.quoteTime,source:'Finnhub',session:'Live trade update (exchange entitlement permitting)',change:Number.isFinite(previousClose)&&previousClose>0?(message.price-previousClose)/previousClose*100:null};
  streamLabel='Receiving live trade updates';
  paintQuote(stock);
  if(sort.value!=='name')renderRows();
 });
 stream.addEventListener('error',()=>{streamLabel='Streaming disconnected; using snapshot fallback'});
 refreshQuotes();loadChart(stocks.find(s=>s.id===selectedId),period);
})();
