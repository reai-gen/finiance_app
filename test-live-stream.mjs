import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createLiveStream} from './live-stream.mjs';
class Socket{
 static instances=[];
 constructor(url){this.url=url;this.handlers=new Map();this.sent=[];Socket.instances.push(this)}
 addEventListener(type,handler){this.handlers.set(type,handler)}
 fire(type,data){this.handlers.get(type)?.(data)}
 send(value){this.sent.push(JSON.parse(value))}
 close(){this.fire('close')}
}
function client(){
 const req=new EventEmitter(),chunks=[];
 const res={writeHead:(status,headers)=>{res.status=status;res.headers=headers},write:value=>chunks.push(value),end:()=>{}};
 return {req,res,chunks};
}
test('without credentials, SSE declares fallback and opens no upstream connection',()=>{
 Socket.instances.length=0;
 const stream=createLiveStream({apiKey:'',WebSocketImpl:Socket});
 const {req,res,chunks}=client();stream.subscribe(req,res);
 assert.equal(res.status,200);assert.match(chunks.join(''),/unconfigured/);
 assert.equal(Socket.instances.length,0);req.emit('close');stream.close();
});
test('one secure WebSocket fans out only validated trades across clients',()=>{
 Socket.instances.length=0;
 let t=1760000000000;
 const stream=createLiveStream({apiKey:'test-private-key',WebSocketImpl:Socket,clock:()=>t,schedule:()=>1,clear:()=>{}});
 const a=client(),b=client();
 stream.subscribe(a.req,a.res);stream.subscribe(b.req,b.res);
 assert.equal(Socket.instances.length,1);
 const ws=Socket.instances[0];assert(ws.url.includes('test-private-key'));
 assert(!a.chunks.join('').includes('test-private-key'));
 ws.fire('open');assert(ws.sent.some(x=>x.type==='subscribe'&&x.symbol==='AAPL'));assert(ws.sent.some(x=>x.symbol==='BP.L'));
 ws.fire('message',{data:JSON.stringify({type:'trade',data:[
  {s:'AAPL',p:230,t:t-1000},{s:'UKNOWN',p:999,t:t-1000},
  {s:'AAPL',p:-1,t:t-1000},{s:'MSFT',p:99,t:t-400000}
 ]})});
 for(const c of [a,b]){assert.match(c.chunks.join(''),/"stock":"US:AAPL"/);assert(!c.chunks.join('').includes('"stock":"US:MSFT"'));assert(!c.chunks.join('').includes('test-private-key'))}
 a.req.emit('close');b.req.emit('close');stream.close();
});
