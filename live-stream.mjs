// One upstream Finnhub connection per server, distributed via same-origin SSE.
// Finnhub API keys never reach the browser.
const us=['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','JPM','V','JNJ','XOM','WMT'];
const uk=['AZN','SHEL','HSBA','ULVR','BP.','GSK','LLOY','BARC','TSCO','VOD','RIO','NG.'];
const pairs=[...us.map(s=>['US:'+s,s]),...uk.map(s=>['UK:'+s,(s.endsWith('.')?s.slice(0,-1):s)+'.L'])];
const bySymbol=new Map(pairs.map(([id,symbol])=>[symbol,id]));
export function createLiveStream({apiKey=process.env.FINNHUB_API_KEY,WebSocketImpl=globalThis.WebSocket,clock=()=>Date.now(),schedule=setTimeout,clear=clearTimeout}={}){
 const clients=new Set();
 let socket=null,retry=null,connected=false,stopped=false,lastReceived=0;
 function broadcast(value){const encoded='data: '+JSON.stringify(value)+'\n\n';for(const res of [...clients]){try{res.write(encoded)}catch{clients.delete(res)}}}
 function status(){return {type:'status',mode:!apiKey?'unconfigured':connected?'streaming':'fallback',connected,lastReceived:lastReceived?new Date(lastReceived).toISOString():null,detail:!apiKey?'Set FINNHUB_API_KEY to enable streaming.':'Streaming trades require provider entitlement; some symbols may not be supported.'}}
 function start(){
  if(stopped||socket||retry||!apiKey||!WebSocketImpl||!clients.size)return;
  const ws=new WebSocketImpl('wss://ws.finnhub.io?token='+encodeURIComponent(apiKey));
  socket=ws;
  function reconnect(){
   if(socket!==ws)return;
   socket=null;connected=false;broadcast(status());
   if(clients.size&&!stopped)retry=schedule(()=>{retry=null;start()},5000);
  }
  ws.addEventListener('open',()=>{
   if(socket!==ws)return;
   connected=true;broadcast(status());
   for(const symbol of bySymbol.keys())ws.send(JSON.stringify({type:'subscribe',symbol}));
  });
  ws.addEventListener('message',event=>{
   let payload;try{payload=JSON.parse(typeof event.data==='string'?event.data:String(event.data))}catch{return}
   if(payload.type!=='trade'||!Array.isArray(payload.data))return;
   for(const trade of payload.data){
    const stock=bySymbol.get(trade.s),price=trade.p,time=trade.t;
    if(!stock||typeof price!=='number'||!Number.isFinite(price)||price<=0||!Number.isFinite(time)||time<=0||time>clock()+60000||clock()-time>300000)continue;
    lastReceived=clock();
    broadcast({type:'trade',stock,price,quoteTime:new Date(time).toISOString(),source:'Finnhub',currency:stock.startsWith('UK:')?'GBX':'USD'});
   }
  });
  ws.addEventListener('error',()=>{broadcast({type:'status',mode:'fallback',connected:false,detail:'Streaming connection error. Snapshot fallback active.'})});
  ws.addEventListener('close',reconnect);
 }
 function subscribe(req,res){
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff'});
  res.write(': connected\n\n');
  clients.add(res);res.write('data: '+JSON.stringify(status())+'\n\n');
  const keepAlive=setInterval(()=>{try{res.write(': keepalive\n\n')}catch{}},20000);
  req.on('close',()=>{
   clearInterval(keepAlive);clients.delete(res);
   if(!clients.size){
    if(retry){clear(retry);retry=null}
    if(socket){const old=socket;socket=null;connected=false;old.close()}
   }
  });
  start();
 }
 function close(){stopped=true;if(retry)clear(retry);if(socket)socket.close();for(const res of clients)res.end();clients.clear()}
 return {subscribe,close,status};
}
