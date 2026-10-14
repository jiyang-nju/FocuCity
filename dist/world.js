import { getFootprint, canBuildAt } from './model.js';
import { buildTransportNetwork, sampleRoute, buildingCells } from './transport.js';
import { drawTerrain, drawFacility, drawFacilityAnimation, drawPerson, drawVehicle, poly, shadow, diamond, ROAD_TYPES, RAIL_TYPES } from './visuals.js';
import { createRenderLoop, RENDER_MODES } from './render-loop.js';
export { drawBuildingIcon } from './visuals.js';

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
function seedNumber(seed) {
  if (typeof seed === 'number') return seed | 0;
  let h = 2166136261;
  for (const c of String(seed || 'moss')) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h | 0;
}
function rand(x, y, seed = 1) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967295;
}
function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = rand(ix, iy, seed), b = rand(ix + 1, iy, seed), c = rand(ix, iy + 1, seed), d = rand(ix + 1, iy + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
export function terrainAt(x, y, seed = 1) {
  const s = seedNumber(seed), radial = Math.hypot(x, y);
  if (radial < 4.5) return 'grass';
  const phase = (s % 1000) * .007;
  const river = 8.5 + Math.sin(y * .14 + phase) * 2.5 + Math.sin(y * .049) * 4;
  const lakeX = 12 + Math.sin(phase) * 2;
  const lake = (x - lakeX) ** 2 / 24 + (y - 7) ** 2 / 31;
  if (Math.abs(x - river) < 1.05 + noise(x * .2, y * .2, s + 8) * .65 || lake < 1) return 'water';
  const hills = noise(x * .083, y * .083, s + 12);
  if (radial > 10 && hills > .73 || radial > 19 && hills > .64) return 'mountain';
  const trees = noise(x * .17, y * .17, s + 41);
  if (radial > 4.9 && trees > .53 && rand(x, y, s + 72) > .12) return 'forest';
  return 'grass';
}

export function createWorld(canvas,{getState,onTileClick,onHover,createCanvas,loopOptions}={}) {
  const c=canvas.getContext('2d',{alpha:false});
  const makeLayer=createCanvas||(()=>globalThis.document?.createElement('canvas')||null);
  const scene=makeLayer(), overlay=makeLayer();
  const sceneContext=scene?.getContext('2d',{alpha:false}), overlayContext=overlay?.getContext('2d');
  let width=1,height=1,dpr=1,zoom=.95,panX=0,panY=0,tool=null,rotation=0,hover=null,keyboardCursor=null,down=null,dead=false,active=false,showMetro=false;
  let mode='balanced',sceneDirty=true,overlayDirty=true,networkDirty=true,lastBuildings=null;
  let currentSeed=seedNumber(getState?.()?.seed),terrainCache=new Map(),signature='',occupancy=new Map(),routes=[],entries=[],waterTiles=[],animatedBuildings=[];
  let visibleTraffic=false,network={routes:[],ports:[]},lastHover='',validationKey='',validation=null;
  const stats={frames:0,sceneBuilds:0,overlayBuilds:0,networkBuilds:0};
  const loop=createRenderLoop(render,{fps:30,...loopOptions});
  canvas.style.touchAction='none';canvas.style.cursor='grab';
  const terrain=(x,y)=>{const key=`${x},${y}`;let t=terrainCache.get(key);if(!t){t=terrainAt(x,y,currentSeed);terrainCache.set(key,t);}return t;};
  function invalidate(wholeScene=false){if(wholeScene)sceneDirty=true;overlayDirty=true;loop.invalidate();}
  function invalidateCity(){networkDirty=true;validationKey='';invalidate(true);}
  function syncState(){const s=getState?.()||{};if(s.buildings!==lastBuildings||seedNumber(s.seed)!==currentSeed)invalidateCity();}
  function refreshNetwork(){
    if(!networkDirty)return;
    networkDirty=false;
    const state=getState?.()||{},buildings=state.buildings||{},seed=seedNumber(state.seed);
    if(seed!==currentSeed){currentSeed=seed;terrainCache.clear();signature='';}
    lastBuildings=buildings;
    const items=Object.entries(buildings),next=seed+'|'+items.map(([key,b])=>`${key}:${b.type}:${b.width||1}:${b.height||1}:${b.rotation||0}`).join('|');
    if(next===signature)return;
    signature=next;entries=items.map(([key,building])=>{const [x,y]=key.split(',').map(Number);return {key,x,y,building};});
    occupancy=new Map();for(const entry of entries)for(const p of buildingCells(entry.key,entry.building))occupancy.set(`${p.x},${p.y}`,entry);
    network=buildTransportNetwork(buildings,terrain);routes=network.routes;stats.networkBuilds++;
    sceneDirty=overlayDirty=true;validationKey='';
  }
  function resize(){
    const r=canvas.getBoundingClientRect(),nextW=r.width||900,nextH=r.height||620,nextDpr=Math.min(globalThis.window?.devicePixelRatio||1,RENDER_MODES[mode].dpr);
    if(width===nextW&&height===nextH&&dpr===nextDpr)return;
    width=nextW;height=nextH;dpr=nextDpr;
    for(const layer of [canvas,scene,overlay])if(layer){layer.width=Math.round(width*dpr);layer.height=Math.round(height*dpr);}
    invalidate(true);
  }
  const ro=new ResizeObserver(resize);ro.observe(canvas);resize();
  function worldPoint(px,py){const a=(px-width/2-panX)/zoom,b=(py-height/2-panY)/zoom;return {x:(b/16+a/32)/2,y:(b/16-a/32)/2};}
  function tilePoint(event){const r=canvas.getBoundingClientRect(),p=worldPoint(event.clientX-r.left,event.clientY-r.top);return {x:Math.floor(p.x+.5),y:Math.floor(p.y+.5)};}
  function screenTile(x,y){return {x:(x-y)*32,y:(x+y)*16};}
  function tileInfo(pos){refreshNetwork();return {...pos,terrain:terrain(pos.x,pos.y),building:occupancy.get(`${pos.x},${pos.y}`)?.building||null};}
  function emitHover(pos){hover=pos;const key=`${pos.x},${pos.y}`;if(key!==lastHover){lastHover=key;onHover?.(tileInfo(pos));invalidate();}}
  function pointerDown(e){if(e.button!==0)return;keyboardCursor=null;canvas.focus({preventScroll:true});down={x:e.clientX,y:e.clientY,panX,panY,moved:false};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';invalidate();}
  function pointerMove(e){keyboardCursor=null;if(down){const dx=e.clientX-down.x,dy=e.clientY-down.y;if(Math.hypot(dx,dy)>5)down.moved=true;if(down.moved){panX=down.panX+dx;panY=down.panY+dy;invalidate(true);}}emitHover(tilePoint(e));}
  function pointerUp(e){if(!down)return;const moved=down.moved;down=null;canvas.style.cursor=tool?'crosshair':'grab';if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(!moved)onTileClick?.(tileInfo(tilePoint(e)));invalidate();}
  function pointerCancel(){down=null;canvas.style.cursor=tool?'crosshair':'grab';invalidate();}
  function pointerLeave(){if(!down&&!keyboardCursor){hover=null;lastHover='';onHover?.(null);invalidate();}}
  function keyDown(e){
    if(e.altKey||e.ctrlKey||e.metaKey)return;
    const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},pan={a:[100,0],d:[-100,0],w:[0,100],s:[0,-100]};
    if(pan[e.key.toLowerCase()]){e.preventDefault();const [x,y]=pan[e.key.toLowerCase()];panX+=x;panY+=y;invalidate(true);return;}
    if(['+','=','-'].includes(e.key)){e.preventDefault();zoomTo(zoom+(e.key==='-'?-.12:.12));return;}
    if(e.key==='Escape'){keyboardCursor=null;hover=null;lastHover='';onHover?.(null);invalidate();return;}
    if(!(e.key in directions)&&e.key!=='Enter'&&e.key!==' ')return;
    e.preventDefault();const pos={...(keyboardCursor||{x:0,y:0})};
    if(e.key in directions){const [dx,dy]=directions[e.key],step=e.shiftKey?8:1;pos.x+=dx*step;pos.y+=dy*step;}
    keyboardCursor=pos;emitHover(pos);
    const p=screenTile(pos.x,pos.y),sx=width/2+panX+p.x*zoom,sy=height/2+panY+p.y*zoom,mx=Math.min(110,width*.2),my=Math.min(140,height*.22),oldX=panX,oldY=panY;
    if(sx<mx)panX+=mx-sx;else if(sx>width-mx)panX+=width-mx-sx;
    if(sy<my)panY+=my-sy;else if(sy>height-my)panY+=height-my-sy;
    if(panX!==oldX||panY!==oldY)invalidate(true);
    if(e.key==='Enter'||e.key===' ')onTileClick?.(tileInfo(pos));
  }
  function zoomTo(value,px=width/2,py=height/2){const old=zoom;zoom=clamp(value,.4,2.3);panX=px-width/2-(px-width/2-panX)*zoom/old;panY=py-height/2-(py-height/2-panY)*zoom/old;invalidate(true);}
  function wheel(e){e.preventDefault();const r=canvas.getBoundingClientRect();zoomTo(zoom*Math.exp(-e.deltaY*.001),e.clientX-r.left,e.clientY-r.top);}
  const listeners={pointerdown:pointerDown,pointermove:pointerMove,pointerup:pointerUp,pointercancel:pointerCancel,pointerleave:pointerLeave,wheel,keydown:keyDown};
  for(const [name,handler]of Object.entries(listeners))canvas.addEventListener(name,handler,name==='wheel'?{passive:false}:undefined);
  function camera(ctx){ctx.translate(width/2+panX,height/2+panY);ctx.scale(zoom,zoom);}
  function inView(p,margin=120){return p.x*zoom+width/2+panX>=-margin&&p.x*zoom+width/2+panX<=width+margin&&p.y*zoom+height/2+panY>=-margin&&p.y*zoom+height/2+panY<=height+margin;}
  function buildScene(ctx){
    stats.sceneBuilds++;
    if(terrainCache.size>65000)terrainCache.clear();
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#9bb784';ctx.fillRect(0,0,width,height);ctx.imageSmoothingEnabled=false;ctx.save();camera(ctx);
    const corners=[worldPoint(-100,-180),worldPoint(width+100,-180),worldPoint(-100,height+220),worldPoint(width+100,height+220)];
    const minX=Math.floor(Math.min(...corners.map(p=>p.x)))-2,maxX=Math.ceil(Math.max(...corners.map(p=>p.x)))+2,minY=Math.floor(Math.min(...corners.map(p=>p.y)))-2,maxY=Math.ceil(Math.max(...corners.map(p=>p.y)))+2,tiles=[];
    for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){
      const p=screenTile(x,y);if(!inView(p,150))continue;
      const entry=occupancy.get(`${x},${y}`),ground=terrain(x,y);tiles.push({x,y,p,entry,ground});
    }
    tiles.sort((a,b)=>(a.x+a.y)-(b.x+b.y)||a.x-b.x);waterTiles=[];
    for(const t of tiles){ctx.save();ctx.translate(t.p.x,t.p.y);drawTerrain(ctx,t.x,t.y,t.entry&&t.ground!=='water'?'grass':t.ground,currentSeed,0,terrain);ctx.restore();if(t.ground==='water'&&!t.entry&&(t.x+t.y)%3===0&&waterTiles.length<90)waterTiles.push(t);}
    const visible=entries.filter(entry=>{const w=entry.building.width||1,h=entry.building.height||1;return entry.x<=maxX&&entry.y<=maxY&&entry.x+w>=minX&&entry.y+h>=minY;});
    const surface=id=>ROAD_TYPES.has(id)||RAIL_TYPES.has(id)||id==='metroLine';
    visible.sort((a,b)=>surface(a.building.type)!==surface(b.building.type)?surface(a.building.type)?-1:1:a.x+a.y+(a.building.width||1)+(a.building.height||1)-b.x-b.y-(b.building.width||1)-(b.building.height||1));
    animatedBuildings=[];
    for(const entry of visible){const p=screenTile(entry.x,entry.y),options={x:entry.x,y:entry.y,width:entry.building.width||1,height:entry.building.height||1,rotation:entry.building.rotation||0,occupancy,showMetro,staticPass:true};ctx.save();ctx.translate(p.x,p.y);drawFacility(ctx,entry.building.type,0,options);ctx.restore();if(['wind','factory'].includes(entry.building.type))animatedBuildings.push({entry,p,options});}
    ctx.restore();sceneDirty=false;overlayDirty=true;
  }
  function drawTraffic(time){
    const speeds={car:1.5,walker:.32,boat:.75,train:2.2,metro:2.8,plane:3.4};
    visibleTraffic=false;
    for(let i=0;i<routes.length;i++){
      const route=routes[i];if(route.kind==='metro'&&!showMetro)continue;
      // Distinct styles share a bounded route: more variety without all-pairs traffic.
      const styles=route.kind==='car'?['car','taxi','bus','coach','van']:route.kind==='boat'?(route.style==='cargo'?['cargo','liner']:route.style==='liner'?['liner','ferry']:['sailboat','ferry']):[route.style];
      const count=route.kind==='car'?Math.min(styles.length,Math.max(1,Math.floor((route.total||route.path.length)/5))):route.kind==='boat'&&route.total>8?2:1;
      for(let vehicle=0;vehicle<count;vehicle++){
        const offset=i*2.1+vehicle*(route.total||route.path.length)/Math.max(1,count),sample=sampleRoute(route,time/1000,speeds[route.kind],offset);if(!sample)continue;
        const p=screenTile(sample.x,sample.y);if(!inView(p))continue;visibleTraffic=true;
        if(route.kind==='car'&&occupancy.get(`${Math.round(sample.x)},${Math.round(sample.y)}`)?.building.type==='tunnel')continue;
        if(route.kind==='walker'){drawPerson(c,p.x+5,p.y+2,i,time);continue;}
        if(route.kind==='plane'){const altitude=Math.sin(sample.progress*Math.PI)*70;shadow(c,p.x+altitude*.3,p.y,16,5);drawVehicle(c,'plane',p.x,p.y-altitude,sample.direction,i,time,route.style);}
        else if(route.kind==='train'||route.kind==='metro'){
          for(let coach=2;coach>=0;coach--){const back=sampleRoute(route,time/1000-coach*.35,speeds[route.kind],offset),bp=screenTile(back.x,back.y);drawVehicle(c,route.kind,bp.x,bp.y-2,back.direction,i+coach,time,route.style);}
        }else drawVehicle(c,route.kind,p.x,p.y,sample.direction,i+vehicle,time,styles[vehicle%styles.length]);
      }
    }
  }
  function drawHover(ctx,state){
    if(!hover||down)return;
    const existing=occupancy.get(`${hover.x},${hover.y}`),demolition=tool==='demolish';
    let cells=existing?getFootprint(existing.building,existing.x,existing.y):[{x:hover.x,y:hover.y}],invalid=false;
    if(tool&&!demolition){
      cells=getFootprint(tool,hover.x,hover.y,rotation);const key=`${hover.x},${hover.y}:${tool}:${rotation}:${state.points}:${signature}`;
      if(key!==validationKey){validationKey=key;validation=canBuildAt(state,tool,hover.x,hover.y,terrain,rotation);}invalid=!validation?.ok;
    }else if(demolition)invalid=!existing;
    for(const cell of cells){const p=screenTile(cell.x,cell.y);ctx.save();ctx.translate(p.x,p.y);poly(ctx,diamond,invalid?'rgba(180,71,64,.36)':demolition?'rgba(204,134,81,.32)':'rgba(218,242,186,.28)',invalid?'#ffd3b7':demolition?'#f4c391':'#e3f4c7',1.5);ctx.restore();}
    if(tool&&!demolition&&cells.length){const p=screenTile(hover.x,hover.y),w=Math.max(...cells.map(p=>p.x))-hover.x+1,h=Math.max(...cells.map(p=>p.y))-hover.y+1;ctx.save();ctx.translate(p.x,p.y);ctx.globalAlpha=invalid?.24:.62;drawFacility(ctx,tool,0,{x:hover.x,y:hover.y,width:w,height:h,rotation,occupancy,showMetro,staticPass:true});ctx.restore();}
  }
  function render(time){
    if(dead||!active)return false;
    refreshNetwork();stats.frames++;
    if(sceneDirty||!sceneContext)buildScene(sceneContext||c);
    if(scene){c.setTransform(1,0,0,1,0,0);c.drawImage(scene,0,0);}
    c.setTransform(dpr,0,0,dpr,0,0);c.imageSmoothingEnabled=false;c.save();camera(c);
    if(mode!=='eco'){
      c.strokeStyle='rgba(209,234,218,.43)';c.lineWidth=.9;c.beginPath();
      for(const t of waterTiles){const shift=Math.sin(time*.0012+t.x*.5+t.y)*2;c.moveTo(t.p.x-6+shift,t.p.y+2);c.lineTo(t.p.x+3+shift,t.p.y+2);}c.stroke();
    }
    for(const item of animatedBuildings){c.save();c.translate(item.p.x,item.p.y);drawFacilityAnimation(c,item.entry.building.type,time,item.options);c.restore();}
    drawTraffic(time);c.restore();
    if(overlayContext){if(overlayDirty){stats.overlayBuilds++;overlayContext.setTransform(dpr,0,0,dpr,0,0);overlayContext.clearRect(0,0,width,height);overlayContext.save();camera(overlayContext);drawHover(overlayContext,getState?.()||{});overlayContext.restore();overlayDirty=false;}c.setTransform(1,0,0,1,0,0);c.drawImage(overlay,0,0);}
    else{c.save();camera(c);drawHover(c,getState?.()||{});c.restore();}
    // Offscreen traffic may enter view later; keep its low-rate simulation alive.
    return routes.some(r=>r.kind!=='metro'||showMetro)||animatedBuildings.length>0||(mode!=='eco'&&waterTiles.length>0);
  }
  function setPerformanceMode(value){const next=RENDER_MODES[value]?value:'balanced';if(mode===next)return;mode=next;loop.setFps(RENDER_MODES[mode].fps);resize();invalidate(true);}
  setPerformanceMode(getState?.()?.settings?.performanceMode);
  return {
    invalidateCity,syncState,invalidateOverlay(){invalidate();},
    setTool(id){tool=id||null;validationKey='';canvas.style.cursor=tool?'crosshair':'grab';invalidate();},
    setRotation(value){rotation=value===1?1:0;validationKey='';invalidate();},
    setActive(value){active=!!value;if(active&&!dead){syncState();resize();}loop.setActive(active&&!dead);},
    setPerformanceMode,
    setShowMetro(value){showMetro=!!value;invalidate(true);},
    setZoom(value){zoomTo(value);},zoomBy(delta){zoomTo(zoom+delta);},
    center(){panX=0;panY=0;zoom=.95;keyboardCursor=null;hover=null;lastHover='';onHover?.(null);invalidate(true);},
    getView(){return {zoom,x:panX,y:panY};},
    getPortStatus(key){refreshNetwork();return network.ports.find(p=>p.key===key)||null;},
    getTrafficSummary(){refreshNetwork();const summary={cars:0,walkers:0,boats:0,trains:0,metros:0,planes:0},keys={car:'cars',walker:'walkers',boat:'boats',train:'trains',metro:'metros',plane:'planes'};for(const route of routes)summary[keys[route.kind]]++;return summary;},
    getRenderStats(){return {...stats,mode,fpsLimit:RENDER_MODES[mode].fps,dpr,visibleTraffic};},
    destroy(){dead=true;loop.destroy();ro.disconnect();for(const [name,handler]of Object.entries(listeners))canvas.removeEventListener(name,handler);for(const layer of [scene,overlay])if(layer){layer.width=layer.height=1;}},
  };
}
