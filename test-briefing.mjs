import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseFeed,briefPoints,createBriefing} from './briefing.mjs';
import {createServer} from './server.mjs';
const item=(title='Company update',description='The company reported results and described its outlook.',link='https://example.com/story',date=new Date().toUTCString())=>'<item><title><![CDATA['+title+']]></title><description><![CDATA['+description+']]></description><link>'+link+'</link><pubDate>'+date+'</pubDate><News:Source>Example publisher</News:Source></item>';
const rss=body=>'<rss><channel>'+body+'</channel></rss>';
const response=xml=>({ok:true,text:async()=>xml});
test('RSS parser handles excerpts and entities; rejects unsafe, stale and undated entries',()=>{
 const rows=parseFeed(rss(item('Profit &amp; outlook','<b>Revenue</b> grew. <script>bad()</script>')+item('Unsafe','bad','javascript:alert(1)')+item('Old','old','https://example.com/old','Tue, 01 Jan 2019 00:00:00 GMT')+item('Undated','x','https://example.com/x','')));
 assert.equal(rows.length,1);assert.equal(rows[0].title,'Profit & outlook');assert.equal(rows[0].excerpt,'Revenue grew.');
});
test('brief extracts source language, preserves uncertainty and labels headline fallback',()=>{
 const points=briefPoints([{title:'Outlook',excerpt:'The analyst said demand could soften later this year. More detail follows.'},{title:'New filing',excerpt:''}]);
 assert.equal(points[0].summary,'The analyst said demand could soften later this year.');
 assert.equal(points[1].basis,'Headline only');
});
test('every listed stock is supported without credentials; UK uses London ticker',async()=>{
 const urls=[];
 const briefing=createBriefing({fetchImpl:async url=>{urls.push(new URL(url));return response(rss(item()))}});
 for(const id of ['US:AAPL','US:MSFT','US:NVDA','US:GOOGL','US:AMZN','US:META','US:TSLA','US:JPM','US:V','US:JNJ','US:XOM','US:WMT','UK:AZN','UK:SHEL','UK:HSBA','UK:ULVR','UK:BP.','UK:GSK','UK:LLOY','UK:BARC','UK:TSCO','UK:VOD','UK:RIO','UK:NG.']){
  const result=await briefing(id);assert.equal(result.stock,id);assert(result.company.points.length);assert.equal(result.macro.length,3);
 }
 assert(urls.some(url=>url.searchParams.get('s')==='BP.L'));
 assert(!urls.some(url=>url.searchParams.has('apikey')));
});
test('company feed failure falls back to Bing; macro failures remain explicit',async()=>{
 const briefing=createBriefing({fetchImpl:async url=>{
  if(url.hostname==='finance.yahoo.com')throw Error('Unavailable');
  if(url.searchParams.get('q').includes('"Apple"'))return response(rss(item()));
  throw Error('Unavailable');
 }});
 const result=await briefing('US:AAPL');assert.equal(result.company.points.length,1);assert(result.macro.every(group=>group.error&&group.points.length===0));
});
test('no-key endpoint returns a briefing and rejects unknown symbols',async()=>{
 const server=createServer({apiKey:'',fetchImpl:async()=>response(rss(item()))});
 const call=url=>new Promise(resolve=>server.listeners('request')[0]({method:'GET',url},{writeHead(status){this.status=status},end(body){resolve({status:this.status,data:JSON.parse(body)})}}));
 const good=await call('/api/briefing?stock=US:AAPL');assert.equal(good.status,200);assert.equal(good.data.name,'Apple');
 assert.equal((await call('/api/briefing?stock=US:FAKE')).status,400);
});

