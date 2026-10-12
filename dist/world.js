// A tiny, dependency-free isometric world. Coordinates remain stable for any seed.
const TILE_W = 64, TILE_H = 32;
const GRASS = ['#92b278', '#96b77c', '#9aba81', '#9fbc86', '#8fac77'];
const FLOOR = '#a9bd8b';
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
const diamond = [[0, -16], [32, 0], [0, 16], [-32, 0]];
function poly(c, points, fill, stroke, width = 1) {
  c.beginPath(); c.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function line(c, points, color, width = 1) {
  c.beginPath(); c.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]);
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
function rect(c, x, y, w, h, color) { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); }
function shadow(c, x = 0, y = 3, rx = 18, ry = 8) {
  c.fillStyle = 'rgba(45,66,42,.15)'; c.beginPath(); c.ellipse(x, y, rx, ry, -.12, 0, Math.PI * 2); c.fill();
}
function box(c, x, y, w, d, h, top = '#dedac4', left = '#eee4c9', right = '#c5c3aa') {
  poly(c, [[x, y], [x - w, y - w / 2], [x - w, y - w / 2 - h], [x, y - h]], left);
  poly(c, [[x, y], [x + d, y - d / 2], [x + d, y - d / 2 - h], [x, y - h]], right);
  poly(c, [[x, y - h], [x - w, y - w / 2 - h], [x - w + d, y - (w + d) / 2 - h], [x + d, y - d / 2 - h]], top);
}
function roof(c, x, y, w, d, h, color = '#ad6d55') {
  const backX = x - w + d, backY = y - (w + d) / 2;
  poly(c, [[x - w - 2, y - w / 2], [backX - 2, backY], [x - w / 2 + d, backY - h], [x - w / 2, y - w / 4 - h]], '#cc8969');
  poly(c, [[x - w / 2, y - w / 4 - h], [x - w / 2 + d, backY - h], [x + d + 2, y - d / 2], [x + 2, y]], color);
  poly(c, [[x - w - 2, y - w / 2], [x - w / 2, y - w / 4 - h], [x + 2, y]], '#e9d6b8');
  line(c, [[x - w / 2, y - w / 4 - h], [x + 2, y]], '#8b5d4b', 1);
  for (let i = 4; i < d; i += 5) line(c, [[x - w / 2 + i, y - w / 4 - h - i / 2], [x + i + 2, y - i / 2]], 'rgba(80,52,42,.16)', .8);
}
function tree(c, x, y, r, conifer = false, autumn = false) {
  c.save(); c.translate(x, y); shadow(c, 3, 2, r * .95, r * .34);
  rect(c, -2, -12, 4, 15, '#786953'); rect(c, 0, -11, 2, 13, '#917b5b');
  if (conifer) {
    poly(c, [[-r, -9], [0, -30 - r * .6], [r, -9]], '#567c62');
    poly(c, [[0, -30 - r * .6], [r, -9], [0, -5]], '#658a69');
    poly(c, [[-r * .8, -18], [0, -37 - r * .5], [r * .8, -18]], '#6f956b');
    poly(c, [[0, -37 - r * .5], [r * .8, -18], [0, -15]], '#81a574');
    line(c, [[-6, -20], [0, -17], [6, -20]], '#94ad78', 1);
  } else {
    const a = autumn ? '#a8a064' : '#668c63', b = autumn ? '#c2b376' : '#80a570', d = autumn ? '#d3bf80' : '#9abb7f';
    poly(c, [[-r, -10], [-r - 2, -22], [-r + 4, -31], [-5, -34], [0, -39], [r - 3, -34], [r + 3, -25], [r + 2, -13], [5, -8]], a);
    poly(c, [[-r, -24], [-r + 4, -32], [-5, -35], [0, -39], [r - 3, -34], [r, -26], [7, -20], [-4, -19]], b);
    poly(c, [[-r + 4, -30], [-5, -35], [0, -39], [7, -36], [8, -30], [1, -27], [-5, -28]], d);
    rect(c, -r + 2, -20, 4, 3, b); rect(c, 5, -14, 5, 3, b); rect(c, 3, -31, 3, 2, d);
  }
  c.restore();
}
function window(c, x, y, side = 'left', color = '#678c91') {
  const points = side === 'left' ? [[x, y], [x + 5, y + 2.5], [x + 5, y + 9.5], [x, y + 7]] : [[x, y], [x + 5, y - 2.5], [x + 5, y + 4.5], [x, y + 7]];
  poly(c, points, color, '#eddfba', 1.1);
  line(c, [[x + 2.5, y + (side === 'left' ? 1.25 : -1.25)], [x + 2.5, y + (side === 'left' ? 8.25 : 5.75)]], '#d9d7bb', .7);
}
function flower(c, x, y, col = '#e9dbb2') { rect(c, x, y, 1, 4, '#6e925a'); rect(c, x - 1, y - 1, 3, 2, col); }
function flag(c, x, y, col = '#c97c64') { rect(c, x, y, 1, 16, '#726e58'); poly(c, [[x + 1, y], [x + 9, y + 2], [x + 1, y + 5]], col); }
function drawRoad(c, x, y, buildings) {
  poly(c, diamond, '#98ab7c');
  poly(c, [[0, -12], [25, 0], [0, 12], [-25, 0]], '#d6c9aa');
  const dirs = [[0, -1, [[-8,-4],[8,4],[24,-4],[8,-12]]], [1, 0, [[-8,4],[8,-4],[24,4],[8,12]]], [0, 1, [[-8,-4],[8,4],[-8,12],[-24,4]]], [-1, 0, [[-8,4],[8,-4],[-8,-12],[-24,-4]]]];
  for (const [dx, dy, p] of dirs) if (buildings[`${x + dx},${y + dy}`]?.type === 'road') poly(c, p, '#d6c9aa');
  rect(c, -3, -3, 3, 1, '#c1b695'); rect(c, 10, 2, 4, 1, '#e9debd'); rect(c, -14, 1, 2, 1, '#b9ad91');
}
function drawBuilding(c, type, time = 0, options = {}) {
  if (type === 'road') { drawRoad(c, options.x || 0, options.y || 0, options.buildings || {}); return; }
  shadow(c, 3, 3, 23, 9);
  if (type === 'garden') {
    poly(c, [[0, 11], [-25,-2], [0,-14], [25,-2]], '#809d6d', '#d7c9a6', 2);
    poly(c, [[0,9],[-18,0],[0,-9],[18,0]], '#ccbea0');
    box(c, 0, 4, 7, 7, 5, '#82b6b6', '#b4c2ac', '#94a695');
    poly(c, [[0,-2],[-5,-4],[0,-7],[5,-4]], '#b9dbcd');
    rect(c, -1, -15, 2, 11, '#b4d8d0'); rect(c, -3, -15, 6, 2, '#d4e6d6');
    for (let i = 0; i < 8; i++) flower(c, [-18,-12,12,18,18,12,-12,-18][i], [-2,-6,-6,-2,3,7,7,3][i], i % 2 ? '#d88f84' : '#e8d6a2');
    return;
  }
  if (type === 'farm') {
    poly(c, [[0,13],[-29,-2],[-1,-16],[29,-1]], '#a18e60', '#bbc193', 2);
    for (let i = 0; i < 6; i++) { const xx = -23 + i * 5; line(c, [[xx,-1 + i * .2],[xx + 24,-13 + i * .2]], '#6d8953', 3); for (let j = 0; j < 5; j++) rect(c, xx + j * 5, -3 - j * 2 + i * .4, 2, 4, '#cab966'); }
    c.save(); c.translate(8,3); box(c, 0, 0, 12, 12, 13, '#bcb499', '#bd7960', '#955e4b'); roof(c,0,-13,12,12,7,'#9f6854'); poly(c,[[-8,-7],[-3,-4],[-3,-12],[-8,-15]],'#ead8b0'); c.restore();
    return;
  }
  if (type === 'harbor') {
    poly(c, [[-5,13],[-28,1],[0,-13],[27,0]], '#88b5b6');
    for (let i = 0; i < 6; i++) poly(c, [[-21+i*5,1+i*2.5],[-16+i*5,-1.5+i*2.5],[8+i*5,-13.5+i*2.5],[3+i*5,-11+i*2.5]], '#bc9c73', '#9c805e', .7);
    box(c, -6, -2, 13, 12, 16, '#d5c49f', '#e4d5b4', '#c4b58f'); roof(c,-6,-18,13,12,8,'#5c8080');
    rect(c, 16,-13,2,21,'#806d57'); line(c,[[17,-13],[26,-10],[26,-5]],'#806d57',2); flag(c,-17,-37,'#d79377');
    return;
  }
  if (type === 'airport') {
    poly(c, [[0,14],[-29,-1],[0,-15],[29,0]], '#82988d');
    line(c,[[-22,0],[22,0]],'#e5d9b9',2);
    for (let i = -20; i < 21; i += 8) rect(c,i,-1,4,1,'#f0e8cb');
    box(c,-2,-3,12,17,13,'#d5d7c7','#e9dec4','#a1b2ad');
    window(c,-12,-20); window(c,2,-15,'right');
    box(c,17,-4,5,5,26,'#b5c6bd','#dbd9bd','#97ada7'); box(c,17,-26,8,8,8,'#e4dbc2','#6e999b','#6c888c');
    poly(c,[[-5,6],[-16,5],[-14,2],[-6,1],[-3,-5],[0,-5],[0,1],[8,5],[7,7],[0,5],[-1,10],[-4,10]],'#f0e9d7');
    return;
  }
  if (type === 'factory') {
    box(c,1,8,23,23,20,'#b7b5a0','#bba486','#948f7b');
    for (let i = 0; i < 3; i++) { poly(c,[[-22+i*8,-23],[-22+i*8,-31],[-14+i*8,-23]],'#b66f58'); window(c,-17+i*7,-21+i*3.5); }
    box(c,14,-12,6,6,34,'#bba890','#af896f','#8c7261');
    window(c,4,-15,'right'); window(c,15,-21,'right');
    const drift = (time * .0003) % 1;
    c.globalAlpha *= .3;
    for (let i = 0; i < 3; i++) { c.fillStyle = '#dfe0ca'; c.beginPath(); c.ellipse(13 + i * 5 + drift * 4,-57 - i * 7 - drift * 5,5 + i*2,3 + i,0,0,Math.PI*2); c.fill(); }
    return;
  }
  const tall = type === 'apartment', civic = ['school','clinic','police','fire'].includes(type);
  const height = tall ? 40 : civic ? 26 : 19;
  const w = tall ? 21 : civic ? 23 : 20, d = tall ? 20 : civic ? 23 : 20;
  const cream = type === 'fire' ? '#d4a285' : type === 'police' ? '#c1c8c0' : '#ebddbc';
  box(c, 0, 10, w, d, height, '#dfd0ad', cream, type === 'fire' ? '#b78770' : '#c5bea1');
  if (tall) {
    box(c, 0, 10 - height, w+1, d+1, 3, '#86998a', '#b6b9a0', '#96a58f');
    for (let row = 0; row < 3; row++) { window(c,-16,-height + 2 + row*11); window(c,-8,-height + 6 + row*11); window(c,5,-height + 6 + row*11,'right'); window(c,13,-height + 2 + row*11,'right'); }
    box(c,2,-36,6,7,7,'#b6b7a4','#d6c7a8','#a9ac93');
  } else {
    const roofs = { cottage: '#a97059', shop:'#77958a', school:'#c18b63', clinic:'#7e9893', police:'#6d8586', fire:'#ac705c' };
    roof(c,0,10-height,w,d,11,roofs[type] || '#ab7158');
    window(c,-16,0-height+14);
    if (civic) { window(c,-8,4-height+14); window(c,14,-height+14,'right'); }
    else window(c,10,-height+15,'right');
    if (type === 'cottage') { box(c,9,-22,4,4,11,'#b79677','#c3a180','#9b7f68'); flower(c,-19,7,'#d99785'); flower(c,22,0,'#e4c88f'); }
  }
  poly(c,[[-5,7],[-5,-3],[-1,-1],[-1,9]],'#85755c'); rect(c,-3,2,1,1,'#d9bb82');
  if (type === 'shop') {
    for (let i = 0; i < 5; i++) poly(c,[[1+i*4,-9-i*2],[5+i*4,-11-i*2],[7+i*4,-5-i*2],[3+i*4,-3-i*2]],i%2?'#ede0b9':'#ca886c');
    box(c,17,5,5,6,5,'#98a477','#bdc090','#91a274');
  }
  if (type === 'clinic') { rect(c,-14,-29,3,10,'#b57061'); rect(c,-17,-26,9,3,'#b57061'); }
  if (type === 'school') { flag(c,10,-49); rect(c,-14,-30,6,6,'#e8d8af'); rect(c,-12,-29,1,3,'#8f876b'); rect(c,-12,-27,2,1,'#8f876b'); }
  if (type === 'police') poly(c,[[-16,-29],[-10,-26],[-10,-20],[-13,-18],[-16,-23]],'#6a8589');
  if (type === 'fire') { poly(c,[[3,6],[3,-8],[11,-12],[11,2]],'#6f7873'); poly(c,[[13,1],[13,-13],[21,-17],[21,-3]],'#6f7873'); line(c,[[3,-1],[11,-5]],'#afa58c',1); line(c,[[13,-6],[21,-10]],'#afa58c',1); }
}

function drawTerrain(c, x, y, type, seed, time, getTerrain) {
  const r = rand(x,y,seed), v = noise(x*.18,y*.18,seed+17);
  if (type === 'water') {
    const color = ['#7faeb1','#85b4b5','#8bb9b8'][Math.floor(v*2.99)];
    poly(c,diamond,color,'rgba(87,139,139,.11)',.5);
    const edges = [[0,-1,[[0,-16],[32,0]]],[1,0,[[32,0],[0,16]]],[0,1,[[0,16],[-32,0]]],[-1,0,[[-32,0],[0,-16]]]];
    for(const [dx,dy,p] of edges) if(getTerrain(x+dx,y+dy)!=='water') { line(c,p,'#b9c29a',3); line(c,p,'#d0ceb0',1); }
    if(r>.38) { const wiggle = Math.sin(time*.0012 + r*20)*2; line(c,[[-11+wiggle,-3],[2+wiggle,-3]],'#abd0c6',1.2); line(c,[[3-wiggle,6],[11-wiggle,6]],'#a5c8c1',1); }
    if(r>.92) { poly(c,[[-9,2],[-5,-1],[0,1],[-1,4],[-7,5]],'#729c7e'); rect(c,-5,0,2,2,'#e2c4bc'); }
    return;
  }
  const index = Math.min(4,Math.floor(v*5));
  poly(c,diamond,GRASS[index],'rgba(116,147,91,.10)',.6);
  if(r>.23) {
    rect(c,-12+r*22,1,2,1,'#afc58e'); rect(c,9-r*14,-8,2,1,'#779d69');
    if(r>.55) { rect(c,6,5,1,2,'#7fa16a'); rect(c,8,4,1,2,'#7fa16a'); }
  }
  if(type==='mountain') {
    shadow(c,3,3,28,11);
    const h = 20 + Math.floor(r*22);
    poly(c,[[-27,0],[-14,-16],[-8,-h],[0,-h-8],[9,-h+1],[26,0],[1,11]],'#929c8a');
    poly(c,[[0,-h-8],[9,-h+1],[26,0],[1,11],[-5,-8]],'#7f8d7b');
    poly(c,[[-27,0],[-14,-16],[-8,-h],[0,-h-8],[-5,-8],[-12,-3]],'#b4b6a0');
    poly(c,[[-8,-h],[0,-h-8],[9,-h+1],[4,-h+2],[0,-h+1],[-4,-h+5]],'#d8d7bf');
    rect(c,-20,4,4,2,'#789065');
  } else if (type==='forest') {
    tree(c, r>.5 ? -5 : 3, 2, 11+r*4, r>.68, r<.14);
    if(r>.76) tree(c,15,4,7,true);
  } else {
    if(r>.89 && Math.hypot(x,y)>4) tree(c,-3,1,10,r>.97);
    else if(r>.67) { flower(c,-11+r*18,-3,r>.8?'#e9d7a5':'#dba8a0'); if(r>.78)flower(c,9,4,'#e1dcb6'); }
    if(r<.035) { poly(c,[[-8,3],[-6,-2],[-2,-3],[3,0],[2,4],[-4,5]],'#a1ad90'); line(c,[[-6,-2],[-2,-3],[3,0]],'#c2c7ae',1); }
  }
}

function drawPerson(c,x,y,seed,time) {
  c.save(); c.translate(x,y); shadow(c,1,2,3,1.5);
  const hop = Math.sin(time*.009+seed)*.45;
  rect(c,-1,-7+hop,3,3,'#e9c69b'); rect(c,-1,-4+hop,3,5,['#d38a71','#668c91','#c9b16f','#aaa18b'][Math.abs(seed)%4]);
  rect(c,-1,1,1,2,'#626c61'); rect(c,1,1,1,2,'#626c61'); rect(c,-1,-8+hop,3,1,'#72735b'); c.restore();
}
function drawBoat(c,x,y,time,seed) {
  c.save();c.translate(x,y+Math.sin(time*.001+seed)*1.1);
  poly(c,[[-14,1],[-3,8],[13,0],[8,-4]],'#d5c4a1'); poly(c,[[-14,1],[-3,8],[13,0],[9,5],[-3,11],[-12,6]],'#866f58');
  rect(c,-1,-25,1,26,'#807d64'); poly(c,[[0,-25],[0,-3],[11,-8]],'#f0e6c9'); poly(c,[[-2,-22],[-11,-7],[-2,-5]],'#dcaa84');
  line(c,[[-14,9],[-8,12],[3,13],[10,9]],'rgba(199,223,209,.65)',1); c.restore();
}

export function drawBuildingIcon(canvas,type) {
  const dpr = Math.min(window.devicePixelRatio || 1,2), size = canvas.clientWidth || 64, h = canvas.clientHeight || 64;
  canvas.width = Math.round(size*dpr); canvas.height = Math.round(h*dpr);
  const c = canvas.getContext('2d'); if(!c)return;
  c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,size,h);c.imageSmoothingEnabled=false;
  c.translate(size/2,h*.78);const scale=Math.min(size/68,h/74);c.scale(scale,scale);
  poly(c,[[0,-16],[30,-1],[30,4],[0,20],[-30,4],[-30,-1]],'#819b71');poly(c,diamond,FLOOR);
  drawBuilding(c,type);
}

export function createWorld(canvas,{getState,onTileClick,onHover}={}) {
  const c = canvas.getContext('2d',{alpha:false});
  let width=1,height=1,dpr=1,zoom=.95,panX=0,panY=0,tool=null,hover=null,keyboardCursor=null,down=null,dead=false,raf=0,lastHover='';
  let currentSeed=seedNumber(getState?.()?.seed),terrainCache=new Map(),frame=0;
  canvas.style.touchAction='none';canvas.style.cursor='grab';
  const terrain=(x,y)=>{const key=`${x},${y}`;let t=terrainCache.get(key);if(!t){t=terrainAt(x,y,currentSeed);terrainCache.set(key,t);}return t;};
  function resize(){const r=canvas.getBoundingClientRect();width=r.width||900;height=r.height||620;dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
  const ro=new ResizeObserver(resize);ro.observe(canvas);resize();
  function worldPoint(px,py){const a=(px-width/2-panX)/zoom,b=(py-height/2-panY)/zoom;return {x:(b/16+a/32)/2,y:(b/16-a/32)/2};}
  function tilePoint(event){const r=canvas.getBoundingClientRect(),p=worldPoint(event.clientX-r.left,event.clientY-r.top);return {x:Math.floor(p.x+.5),y:Math.floor(p.y+.5)};}
  function screenTile(x,y){return {x:(x-y)*32,y:(x+y)*16};}
  function emitHover(pos){hover=pos;const key=`${hover.x},${hover.y}`;if(key!==lastHover){lastHover=key;const state=getState?.()||{};onHover?.({...hover,terrain:terrain(hover.x,hover.y),building:state.buildings?.[key]||null});}}
  function setHover(event){emitHover(tilePoint(event));}
  function pointerDown(e){if(e.button!==0)return;keyboardCursor=null;canvas.focus({preventScroll:true});down={x:e.clientX,y:e.clientY,panX,panY,moved:false};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';}
  function pointerMove(e){keyboardCursor=null;if(down){const dx=e.clientX-down.x,dy=e.clientY-down.y;if(Math.hypot(dx,dy)>5)down.moved=true;if(down.moved){panX=down.panX+dx;panY=down.panY+dy;}}setHover(e);}
  function pointerUp(e){if(!down)return;const moved=down.moved;down=null;canvas.style.cursor=tool?'crosshair':'grab';if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(!moved){const pos=tilePoint(e),state=getState?.()||{};onTileClick?.({...pos,terrain:terrain(pos.x,pos.y),building:state.buildings?.[`${pos.x},${pos.y}`]||null});}}
  function pointerCancel(){down=null;canvas.style.cursor=tool?'crosshair':'grab';}
  function pointerLeave(){if(!down&&!keyboardCursor){hover=null;lastHover='';onHover?.(null);}}
  function keyDown(e){
    if(e.altKey||e.ctrlKey||e.metaKey)return;
    const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(e.key==='Escape'){keyboardCursor=null;hover=null;lastHover='';onHover?.(null);return;}
    if(!(e.key in directions)&&e.key!=='Enter'&&e.key!==' ')return;
    e.preventDefault();
    const pos={...(keyboardCursor||{x:0,y:0})};
    if(e.key in directions){const [dx,dy]=directions[e.key];pos.x+=dx;pos.y+=dy;}
    keyboardCursor=pos;emitHover(pos);
    const p=screenTile(pos.x,pos.y),sx=width/2+panX+p.x*zoom,sy=height/2+panY+p.y*zoom;
    const marginX=Math.min(80,width*.2),marginY=Math.min(90,height*.22);
    if(sx<marginX)panX+=marginX-sx;else if(sx>width-marginX)panX+=width-marginX-sx;
    if(sy<marginY)panY+=marginY-sy;else if(sy>height-marginY)panY+=height-marginY-sy;
    if(e.key==='Enter'||e.key===' '){const state=getState?.()||{};onTileClick?.({...pos,terrain:terrain(pos.x,pos.y),building:state.buildings?.[`${pos.x},${pos.y}`]||null});}
  }
  function zoomTo(value,px=width/2,py=height/2){const old=zoom;zoom=clamp(value,.45,2.1);panX=px-width/2-(px-width/2-panX)*zoom/old;panY=py-height/2-(py-height/2-panY)*zoom/old;}
  function wheel(e){e.preventDefault();const r=canvas.getBoundingClientRect();zoomTo(zoom*Math.exp(-e.deltaY*.001),e.clientX-r.left,e.clientY-r.top);}
  canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',pointerCancel);canvas.addEventListener('pointerleave',pointerLeave);canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('keydown',keyDown);
  function render(time){
    if(dead)return;raf=requestAnimationFrame(render);frame++;
    const state=getState?.()||{},buildings=state.buildings||{},seed=seedNumber(state.seed);
    if(seed!==currentSeed){currentSeed=seed;terrainCache.clear();}
    if(terrainCache.size>28000)terrainCache.clear();
    c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#9bb784';c.fillRect(0,0,width,height);c.imageSmoothingEnabled=false;
    c.save();c.translate(width/2+panX,height/2+panY);c.scale(zoom,zoom);
    const corners=[worldPoint(-100,-100),worldPoint(width+100,-100),worldPoint(-100,height+130),worldPoint(width+100,height+130)];
    const minX=Math.floor(Math.min(...corners.map(p=>p.x)))-2,maxX=Math.ceil(Math.max(...corners.map(p=>p.x)))+2,minY=Math.floor(Math.min(...corners.map(p=>p.y)))-2,maxY=Math.ceil(Math.max(...corners.map(p=>p.y)))+2;
    const tiles=[];
    for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){const p=screenTile(x,y);if(p.x*zoom+width/2+panX<-80||p.x*zoom+width/2+panX>width+80||p.y*zoom+height/2+panY<-70||p.y*zoom+height/2+panY>height+120)continue;tiles.push({x,y,p,t:terrain(x,y),b:buildings[`${x},${y}`]});}
    tiles.sort((a,b)=>(a.x+a.y)-(b.x+b.y)||a.x-b.x);
    // Paint cells back to front so foreground trees and buildings overlap naturally.
    for(const t of tiles){c.save();c.translate(t.p.x,t.p.y);drawTerrain(c,t.x,t.y,t.b&&t.t!=='water'?'grass':t.t,currentSeed,time,terrain);if(t.b)drawBuilding(c,t.b.type,time,{x:t.x,y:t.y,buildings});c.restore();}
    // Only populated streets have residents. They follow real, adjacent road segments.
    const roads=Object.entries(buildings).filter(([,b])=>b.type==='road');
    for(let i=0;i<roads.length;i++){if(i%3!==0)continue;const [key]=roads[i],[x,y]=key.split(',').map(Number);const neighbors=[[1,0],[0,1],[-1,0],[0,-1]].filter(([dx,dy])=>buildings[`${x+dx},${y+dy}`]?.type==='road');const next=neighbors[i%Math.max(1,neighbors.length)]||[0,0];const f=(Math.sin(time*.00035+i*1.7)+1)/2,p=screenTile(x+next[0]*f,y+next[1]*f);drawPerson(c,p.x+3,p.y-1,i,time);}
    for(const [key,b] of Object.entries(buildings))if(b.type==='harbor'){const [x,y]=key.split(',').map(Number);const waters=[];for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)if(terrain(x+dx,y+dy)==='water'&&(dx||dy))waters.push([x+dx,y+dy]);if(waters.length){const [wx,wy]=waters[Math.abs(x+y)%waters.length],p=screenTile(wx,wy);drawBoat(c,p.x+Math.sin(time*.00025)*7,p.y,time,x+y);}}
    if(hover&&!down){
      const p=screenTile(hover.x,hover.y),existing=buildings[`${hover.x},${hover.y}`],ground=terrain(hover.x,hover.y);
      const demolition=tool==='demolish'||tool==='bulldozer';
      const shore=tool!=='harbor'||[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>terrain(hover.x+dx,hover.y+dy)==='water');
      const invalid=tool&&(demolition?!existing:existing||!['grass','forest'].includes(ground)||!shore);
      c.save();c.translate(p.x,p.y);
      poly(c,diamond,invalid?'rgba(181,76,65,.28)':demolition?'rgba(189,108,81,.25)':'rgba(248,245,209,.20)',invalid?'#f1b1a0':demolition?'#e8b197':'#f6edc5',2);
      if(tool&&!demolition&&!existing){c.globalAlpha=invalid ? .24 : .55;drawBuilding(c,tool,time,{x:hover.x,y:hover.y,buildings});}
      if(invalid){c.globalAlpha=.95;line(c,[[-5,-3],[5,3]],'#f8e5cc',2);line(c,[[-5,3],[5,-3]],'#f8e5cc',2);}
      c.restore();
    }
    c.restore();
    // A soft edge vignette keeps the main glade inviting without hiding the map.
    const vignette=c.createRadialGradient(width*.5,height*.46,Math.min(width,height)*.2,width*.5,height*.46,Math.max(width,height)*.7);vignette.addColorStop(0,'rgba(50,66,43,0)');vignette.addColorStop(1,'rgba(64,77,49,.09)');c.fillStyle=vignette;c.fillRect(0,0,width,height);
  }
  raf=requestAnimationFrame(render);
  return {setTool(id){tool=id||null;canvas.style.cursor=tool?'crosshair':'grab';},setZoom(value){zoomTo(value);},zoomBy(delta){zoomTo(zoom+delta);},center(){panX=0;panY=0;zoom=.95;keyboardCursor=null;hover=null;lastHover='';onHover?.(null);},getView(){return {zoom,x:panX,y:panY};},destroy(){dead=true;cancelAnimationFrame(raf);ro.disconnect();canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointercancel',pointerCancel);canvas.removeEventListener('pointerleave',pointerLeave);canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('keydown',keyDown);}};
}
