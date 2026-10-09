(() => {
 const root=document.getElementById('money-flow');if(!root)return;
 const status=document.getElementById('flow-status'),selector=document.getElementById('flow-topic'),details=document.getElementById('flow-details'),heading=document.getElementById('flow-result'),refresh=document.getElementById('flow-refresh');
 const routes={
  rates:{name:'Interest rates',headline:'Borrowing costs and savings can change',explanation:'When central banks change rates, mortgage and loan repayments may move, while savings interest can change too. Timing depends on contracts and banks.',paths:['International investors may shift capital in response to changing yields','Exchange rates and company funding costs may respond','Households can experience changes in repayments and savings returns']},
  inflation:{name:'Inflation',headline:'Everyday essentials can absorb more income',explanation:'Higher food, transport or energy costs can reduce what remains after bills if income does not keep pace.',paths:['Energy, imports and supply costs can affect prices','Companies may change prices or margins','Household purchasing power can rise or fall']},
  jobs:{name:'Jobs and wages',headline:'Employment affects income and confidence',explanation:'Changes in hiring and pay can affect household income and spending. Strong jobs data can also influence rate decisions.',paths:['Economic demand influences companies and hiring','Jobs and wages shape household income','Interest-rate expectations can respond to labour reports']},
  trade:{name:'Trade and politics',headline:'Policy and currencies influence import costs',explanation:'Tariffs, sanctions, budgets and trade agreements can influence exchange rates, costs and business investment. The household effects vary.',paths:['Political decisions influence cross-border trade and investment','Currencies and import costs may adjust','Prices, jobs and household budgets may be affected']}
 };
 let current='rates',latest=[],lastLabel='';
 const asText=(el,value)=>{el.textContent=value};
 function render(topic){
  current=topic;const item=routes[topic];asText(heading,item.headline);details.replaceChildren();
  const p=document.createElement('p');p.textContent=item.explanation;details.append(p);
  const ol=document.createElement('ol');for(const line of item.paths){const li=document.createElement('li');li.textContent=line;ol.append(li)}details.append(ol);
  const connected=latest.find(x=>(topic==='rates'&&x.category==='Interest rates')||(topic==='inflation'&&x.category==='Inflation')||(topic==='jobs'&&x.category?.startsWith('Jobs'))||(topic==='trade'&&x.category==='Growth'));
  const note=document.createElement('p');note.className='flow-evidence';
  note.textContent=connected?'Related calendar event: '+connected.country+' · '+connected.name+' · '+String(connected.date).slice(0,10)+'. This does not establish a measured household impact.':'Illustrative pathways only; no verified event-specific household impact.';
  details.append(note);selector.value=topic;root.dataset.topic=topic;
 }
 async function update(){
  status.textContent='Checking macro calendar…';
  try{
   const response=await fetch('/api/macro');const data=await response.json();
   if(!response.ok)throw Error(data.error||'Calendar unavailable');
   latest=Array.isArray(data.items)?data.items:[];
   lastLabel='Calendar checked '+new Date(data.asOf).toLocaleString('en-GB')+' · '+latest.length+' events · FMP';
   status.textContent=lastLabel;
  }catch{latest=[];status.textContent='Calendar unavailable — educational explanations remain available.'}
  render(current);
 }
 selector.addEventListener('change',()=>render(selector.value));
 refresh.addEventListener('click',update);
 render(current);update();
})();
