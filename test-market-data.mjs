import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMarketData,normaliseQuote,aggregateFourHour} from './market-data.mjs';
const stock='UK:BP.';
const sample={chart:{result:[{meta:{currency:'GBp',regularMarketPrice:412.5,regularMarketTime:1760000000,previousClose:400,currentTradingPeriod:{regular:{start:1759990000,end:1760020000}}},timestamp:[1759800000,1759886400],indicators:{quote:[{open:[408,411],high:[413,416],low:[405,409],close:[410,412.5]}]}}]}};
test('normalises UK penny quotes and percentage change without inventing currency',()=>{
 const q=normaliseQuote(sample.chart.result[0],stock,1760000000000);
 assert.equal(q.currency,'GBX');assert.equal(q.price,412.5);assert.equal(q.change,3.125);
 assert.equal(q.source,'Yahoo Finance');assert.match(q.quoteTime,/Z$/);
});
test('invalid quote metadata is rejected',()=>{
 assert.throws(()=>normaliseQuote({meta:{currency:'USD',regularMarketPrice:0,regularMarketTime:1}},'US:AAPL'),/undefined|./);
});
test('historical points are daily, sorted and use actual provider prices',async()=>{
 const urls=[];
 const market=createMarketData({now:()=>1760000000000,fetchImpl:async url=>{urls.push(url);return {ok:true,status:200,json:async()=>sample}}});
 const q=await market.quote(stock);assert.equal(q.price,412.5);
 const history=await market.history(stock,'1Y');
 assert.equal(history.period,'1Y');assert.equal(history.frequency,'OHLC 1Y');
 assert.deepEqual(history.points.map(p=>p.close),[410,412.5]);
 assert(urls.some(url=>url.searchParams.get('range')==='1y'&&url.searchParams.get('interval')==='1d'));
});
test('unknown tickers and chart periods do not request upstream data',async()=>{
 const market=createMarketData({fetchImpl:()=>{throw Error('unexpected fetch')}});
 await assert.rejects(market.quote('US:UNKNOWN'),e=>e.status===400);
 await assert.rejects(market.history('US:AAPL','invalid'),e=>e.status===400);
});

test('all nine timeframe requests map to provider-supported candle intervals',async()=>{
 const requested=[];
 const market=createMarketData({fetchImpl:async url=>{requested.push([url.searchParams.get('range'),url.searchParams.get('interval')]);return {ok:true,status:200,json:async()=>sample}}});
 for(const period of ['1m','5m','15m','1h','4h','1d','1W','1M','1Y']){
  const result=await market.history(stock,period);
  assert.equal(result.period,period);assert.equal(result.points[0].open,408);assert.equal(result.points[0].high,413);
 }
 assert(requested.some(([range,interval])=>range==='1d'&&interval==='1m'));
 assert(requested.some(([range,interval])=>range==='1mo'&&interval==='60m'));
});
test('4h aggregation respects trading day boundaries',()=>{
 const points=[
  ['2026-10-08T08:00:00Z',100,104,99,102],['2026-10-08T09:00:00Z',102,106,101,105],
  ['2026-10-09T08:00:00Z',105,107,103,104]
 ].map(([time,open,high,low,close])=>({time,open,high,low,close}));
 const output=aggregateFourHour(points,'Europe/London');
 assert.equal(output.length,2);assert.deepEqual(output[0],{time:points[0].time,open:100,high:106,low:99,close:105});
});
