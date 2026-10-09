import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMarketData,normaliseQuote} from './market-data.mjs';
const stock='UK:BP.';
const sample={chart:{result:[{meta:{currency:'GBp',regularMarketPrice:412.5,regularMarketTime:1760000000,previousClose:400,currentTradingPeriod:{regular:{start:1759990000,end:1760020000}}},timestamp:[1759800000,1759886400],indicators:{quote:[{close:[410,412.5]}]}}]}};
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
 assert.equal(history.period,'1Y');assert.equal(history.frequency,'Daily closing prices');
 assert.deepEqual(history.points.map(p=>p.price),[410,412.5]);
 assert(urls.some(url=>url.searchParams.get('range')==='1y'&&url.searchParams.get('interval')==='1d'));
});
test('unknown tickers and chart periods do not request upstream data',async()=>{
 const market=createMarketData({fetchImpl:()=>{throw Error('unexpected fetch')}});
 await assert.rejects(market.quote('US:UNKNOWN'),e=>e.status===400);
 await assert.rejects(market.history('US:AAPL','invalid'),e=>e.status===400);
});
