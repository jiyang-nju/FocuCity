import { CATALOG } from './model.js';

// Cozy isometric artwork, isolated from world state so static scenes can be cached.
const GRASS = ['#92b278', '#96b77c', '#9aba81', '#9fbc86', '#8fac77'];
const FLOOR = '#a9bd8b';
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
export const diamond = [[0, -16], [32, 0], [0, 16], [-32, 0]];
export function poly(c, points, fill, stroke, width = 1) {
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
export function shadow(c, x = 0, y = 3, rx = 18, ry = 8) {
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
function lamp(c,x,y) {
  line(c,[[x,y],[x,y-17],[x+4,y-19]],'#73827c',1.4);
  poly(c,[[x+1,y-20],[x+7,y-20],[x+6,y-17],[x+2,y-17]],'#f2d99c','#88998a',.6);
}
function bench(c,x,y) {
  line(c,[[x-7,y-4],[x+7,y+3]],'#9b7959',3);
  line(c,[[x-7,y-8],[x+7,y-1]],'#b3916b',2);
  line(c,[[x-5,y-4],[x-5,y]],'#69796a',1.2);line(c,[[x+5,y+1],[x+5,y+5]],'#69796a',1.2);
}
function planter(c,x,y) {
  box(c,x,y,5,5,4,'#849c6a','#b69a79','#957d60');
  for(let n=0;n<3;n++)flower(c,x-3+n*3,y-6, n%2?'#e2b17e':'#c78286');
}
function shopWindow(c,x,y,width=12,height=12,side='left') {
  const slope=side==='left'?.5:-.5;
  poly(c,[[x,y],[x+width,y+width*slope],[x+width,y+width*slope+height],[x,y+height]],'#74a6a7','#e7dabc',1.2);
  poly(c,[[x+1,y+1],[x+width*.45,y+width*.45*slope+1],[x+width*.18,y+height-2],[x+1,y+height-3]],'#a2c6bd');
  line(c,[[x+width*.5,y+width*.5*slope],[x+width*.5,y+width*.5*slope+height]],'#e7dabc',1);
}
function wallSign(c,x,y,width,label,color='#668e85',side='left') {
  const slope=side==='left'?.5:-.5;
  poly(c,[[x,y],[x+width,y+width*slope],[x+width,y+width*slope+8],[x,y+8]],color,'#e5d9bc',.7);
  c.save();c.transform(1,slope,0,1,x+2,y+6);c.fillStyle='#fff1d1';c.font='bold 5px sans-serif';c.textAlign='left';c.fillText(label,0,0,Math.max(1,width-4));c.restore();
}
function awning(c,x,y,width,color='#b57966') {
  for(let i=0;i<width;i+=5){const end=Math.min(i+5,width);poly(c,[[x+i,y+i*.5],[x+end,y+end*.5],[x+end-4,y+end*.5+5],[x+i-4,y+i*.5+5]],Math.floor(i/5)%2?'#eee0bd':color);}
  line(c,[[x-4,y+5],[x+width-4,y+width*.5+5]],'#9c876c',1);
}
function chimneySmoke(c,time=0) {
  const drift=(time*.0003)%1;c.save();c.globalAlpha*=.3;
  for(let i=0;i<3;i++){c.fillStyle='#dfe0ca';c.beginPath();c.ellipse(13+i*5+drift*4,-57-i*7-drift*5,5+i*2,3+i,0,0,Math.PI*2);c.fill();}c.restore();
}
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
    if(!options.staticPass)chimneySmoke(c,time);
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
    if (type === 'cottage') {
      box(c,9,-22,4,4,11,'#b79677','#c3a180','#9b7f68');
      poly(c,[[-13,-13],[-7,-10],[-7,-7],[-13,-10]],'#a98368');
      for(let n=0;n<3;n++)flower(c,-13+n*2,-12+n,'#d99785');
      line(c,[[-23,5],[-11,11]],'#e7dcbd',2);for(let n=0;n<4;n++)line(c,[[-23+n*4,5+n*2],[-23+n*4,n*2]],'#e7dcbd',1.2);
      flower(c,22,0,'#e4c88f');lamp(c,20,8);
    }
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

export function drawTerrain(c, x, y, type, seed, time, getTerrain) {
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

export function drawPerson(c,x,y,seed,time) {
  c.save(); c.translate(x,y); shadow(c,1,2,3,1.5);
  const hop = Math.sin(time*.009+seed)*.45;
  rect(c,-1,-7+hop,3,3,'#e9c69b'); rect(c,-1,-4+hop,3,5,['#d38a71','#668c91','#c9b16f','#aaa18b'][Math.abs(seed)%4]);
  rect(c,-1,1,1,2,'#626c61'); rect(c,1,1,1,2,'#626c61'); rect(c,-1,-8+hop,3,1,'#72735b'); c.restore();
}
export function drawBoat(c,x,y,time,seed) {
  c.save();c.translate(x,y+Math.sin(time*.001+seed)*1.1);
  poly(c,[[-14,1],[-3,8],[13,0],[8,-4]],'#d5c4a1'); poly(c,[[-14,1],[-3,8],[13,0],[9,5],[-3,11],[-12,6]],'#866f58');
  rect(c,-1,-25,1,26,'#807d64'); poly(c,[[0,-25],[0,-3],[11,-8]],'#f0e6c9'); poly(c,[[-2,-22],[-11,-7],[-2,-5]],'#dcaa84');
  line(c,[[-14,9],[-8,12],[3,13],[10,9]],'rgba(199,223,209,.65)',1); c.restore();
}

const DEFINITIONS = new Map(CATALOG.map(item => [item.id, item]));
export const ROAD_TYPES = new Set(['road', 'asphalt', 'bridge', 'tunnel']);
export const RAIL_TYPES = new Set(['railway', 'railBridge']);
const METRO_TYPES = new Set(['metroLine', 'metroStation']);
const PORT_TYPES = new Set(['harbor', 'seaport', 'shippingHub']);
const AIRPORT_TYPES = new Set(['airport', 'internationalAirport']);
const iso = (x, y) => [(x - y) * 32, (x + y) * 16];
function groundQuad(c, x, y, w, h, fill, stroke, weight = 1) {
  poly(c, [iso(x-.5,y-.5),iso(x+w-.5,y-.5),iso(x+w-.5,y+h-.5),iso(x-.5,y+h-.5)], fill, stroke, weight);
}
function atCell(c, x, y, fn) { c.save();c.translate(...iso(x,y));fn();c.restore(); }
function campusBlock(c, x, y, w, h, height, color = '#e8dec1', top = '#80989b') {
  const front = iso(x + (w - 1) * .5, y + (h - 1) * .5);
  const breadth = Math.max(10,h * 23), depth = Math.max(10,w * 23);
  shadow(c,front[0],front[1]+7,(w+h)*11,(w+h)*4);
  box(c, front[0], front[1]+6, breadth, depth, height,top,color,'#aab5aa');
  for(let row=0;row<Math.floor(height/14);row++)for(let i=6;i<breadth-3;i+=10)window(c,front[0]-i,front[1]+2-height+row*13-i*.5);
  for(let row=0;row<Math.floor(height/14);row++)for(let i=5;i<depth-3;i+=10)window(c,front[0]+i,front[1]-3-height+row*13-i*.5,'right');
  line(c,[[front[0]-breadth,front[1]+6-height-breadth*.5],[front[0],front[1]+6-height],[front[0]+depth,front[1]+6-height-depth*.5]],'#e6e3cb',1.5);
  box(c,front[0]+4,front[1]-height-9,6,7,3,'#c4c9b5','#a8b5a4','#8c9f95');
  poly(c,[[front[0]-4,front[1]+5],[front[0]-4,front[1]-7],[front[0]+2,front[1]-4],[front[0]+2,front[1]+8]],'#6b9494','#e8dbbc',1);
  line(c,[[front[0]-8,front[1]+8],[front[0]+3,front[1]+13],[front[0]+10,front[1]+9]],'#b0b69f',2);
}
const RETAIL_TYPES=new Set(['shop','convenienceStore','supermarket','shoppingMall','grandMall','bakery','cafe','restaurant']);
function retailBlock(c,x,y,w,d,height,theme,label,canopy=true) {
  box(c,x,y,w,d,height,'#a9b6a5','#eadfc6','#c9cbb4');
  box(c,x,y-height,w+1,d+1,3,'#d3cbb0','#f1e5c7','#acb7a2');
  for(let i=4;i<w-7;i+=14)shopWindow(c,x-w+i,y-w*.5+i*.5-15,10,12);
  for(let i=4;i<d-6;i+=13)shopWindow(c,x+i,y-i*.5-15,9,12,'right');
  wallSign(c,x-w+2,y-w*.5-height+7,w-4,label,theme);
  if(canopy)awning(c,x-w,y-w*.5-16,w,theme);
  poly(c,[[x-3,y-11],[x+3,y-8],[x+3,y+2],[x-3,y-1]],'#608f91','#e4d6b7',1);
  rect(c,x,y-3,1,2,'#e1c48d');
  for(let i=5;i<w-4;i+=9)line(c,[[x-w+i,y-w*.5+i*.5-height+4],[x-w+i+3,y-w*.5+i*.5-height+5.5]],'#dfdbc3',1);
  box(c,x+3,y-height-8,7,7,4,'#c3cab8','#adb6a2','#8d9e93');
}
function drawRetail(c,type,width,height) {
  const maxX=width-1,maxY=height-1;
  const styles={shop:['#bd8e70','MARKET'],convenienceStore:['#4c9c87','24 / 7'],supermarket:['#759765','FRESH'],shoppingMall:['#718d9e','FOCU MALL'],grandMall:['#a18b68','CITY GALLERIA'],bakery:['#c68c65','BAKERY'],cafe:['#708d75','COFFEE'],restaurant:['#a76f60','BISTRO']};
  const [theme,label]=styles[type];
  groundQuad(c,0,0,width,height,'#c9c7ad','#9caf97',1);
  groundQuad(c,.06,.06,width-.12,height-.12,'#ddd4b6');
  if(type==='shoppingMall'||type==='grandMall') {
    const front=iso(width*.42,height*.43),w=height*23,d=width*23;
    retailBlock(c,front[0],front[1],w,d,type==='grandMall'?52:39,theme,label,false);
    for(let row=0;row<(type==='grandMall'?2:1);row++) {
      const yy=front[1]-29-row*14;
      for(let i=7;i<w-7;i+=11)shopWindow(c,front[0]-w+i,yy-w*.5+i*.5,7,8);
      for(let i=8;i<d-6;i+=11)shopWindow(c,front[0]+i,yy-i*.5,7,8,'right');
    }
    const roofY=front[1]-(type==='grandMall'?52:39)-13;
    box(c,front[0]+8,roofY,Math.min(w*.5,30),Math.min(d*.55,49),8,'#a7cbc3','#7fada9','#658e94');
    for(let n=5;n<Math.min(d*.55,49);n+=8)line(c,[[front[0]+8+n,roofY-n*.5-8],[front[0]+8+n-Math.min(w*.5,30),roofY-(n+Math.min(w*.5,30))*.5-8]],'#dce6cf',1);
    // Sheltered glass entrance and a paved forecourt distinguish a mall from a house.
    box(c,front[0],front[1]+9,16,18,7,'#a9c9bd','#82aaa4','#759692');
    for(let x=0;x<width;x+=1.5)atCell(c,x,maxY,()=>{planter(c,0,4);lamp(c,10,5);});
    atCell(c,maxX,maxY,()=>bench(c,0,5));
    if(type==='grandMall'){
      atCell(c,0,maxY-.5,()=>{box(c,0,4,14,14,4,'#86b5ab','#afa88b','#9e9f84');rect(c,-1,-7,2,9,'#c4ded1');});
      atCell(c,maxX-.5,0,()=>{tree(c,0,-45,11);planter(c,0,-40);});
    }
    return;
  }
  const p=iso(width*.36-.15,height*.38-.15),w=Math.min(37,height*22),d=Math.min(42,width*22);
  retailBlock(c,p[0],p[1]+4,w,d,type==='supermarket'?27:23,theme,label);
  atCell(c,0,maxY,()=>{
    if(type==='bakery'){box(c,-1,6,7,7,4,'#d2ac6d','#b88c60','#95724f');for(let i=0;i<3;i++){c.fillStyle='#edc180';c.beginPath();c.ellipse(-4+i*4,-1+i*.8,3,1.4,.4,0,Math.PI*2);c.fill();}}
    else if(type==='cafe'||type==='restaurant'){
      for(let i=0;i<2;i++){const xx=-11+i*22;box(c,xx,4,6,6,6,'#d6b88b','#af946f','#8c7b63');rect(c,xx-1,-15,1,13,'#8c8568');poly(c,[[xx-12,-14],[xx,-20],[xx+12,-14],[xx,-8]],i?'#cfaa85':'#9caf8b');rect(c,xx-9,7,4,2,'#947e61');}
    }else {for(let i=0;i<3;i++){box(c,-10+i*8,5+i*2,5,5,4,'#a7b47c','#bca77d','#9f8e68');rect(c,-12+i*8,i*2-1,3,2,i%2?'#d79a6c':'#b8c47e');}}
  });
  atCell(c,maxX,maxY,()=>{planter(c,13,8);lamp(c,20,2);});
  if(type==='convenienceStore'){wallSign(c,23,-22,14,'OPEN',theme,'right');line(c,[[23,-22],[23,0]],'#8d957e',1.5);}
  if(type==='supermarket')atCell(c,maxX,0,()=>{box(c,12,6,8,6,7,'#adc6b8','#8fa8a0','#748e88');line(c,[[5,-1],[2,-5]],'#d4d5ba',1);});
}
function drawNetwork(c, type, x, y, occupancy = new Map(), showMetro = true) {
  const rail = RAIL_TYPES.has(type), metro = type === 'metroLine';
  const bridge = type === 'bridge' || type === 'railBridge', tunnel = type === 'tunnel';
  const connected = (dx,dy) => {
    const next = occupancy.get(`${x+dx},${y+dy}`)?.building?.type;
    return rail ? RAIL_TYPES.has(next)||next==='station' : metro ? METRO_TYPES.has(next) : ROAD_TYPES.has(next)||next==='busStation';
  };
  const dirs = [[1,0],[0,1],[-1,0],[0,-1]].filter(([dx,dy])=>connected(dx,dy));
  if(!dirs.length)dirs.push([1,0],[-1,0]);
  if(metro && !showMetro) { poly(c,diamond,'#95b37b');return; }
  if(!bridge)poly(c,diamond,metro?'#94ad85':type==='road'?'#9eaf82':'#a8b696');
  if(bridge) { line(c,[[-19,1],[-19,11]],'#808d84',4);line(c,[[19,1],[19,11]],'#808d84',4); }
  const color = metro ? '#638b91' : rail ? '#a9a28d' : type==='road' ? '#d6c9aa' : '#697b7c';
  for(const [dx,dy] of dirs) {
    const p=iso(dx*.5,dy*.5);
    line(c,[[0,0],p],color,rail?13:metro?7:19);
    if(rail) {
      const length=Math.hypot(...p),nx=-p[1]/length*4,ny=p[0]/length*4;
      for(let f=.15;f<=1;f+=.25)line(c,[[p[0]*f+nx,p[1]*f+ny],[p[0]*f-nx,p[1]*f-ny]],'#685e50',2);
      line(c,[[nx*.6,ny*.6],[p[0]+nx*.6,p[1]+ny*.6]],'#d5ded6',1.4);
      line(c,[[-nx*.6,-ny*.6],[p[0]-nx*.6,p[1]-ny*.6]],'#d5ded6',1.4);
    } else if(type!=='road') {
      c.save();c.setLineDash([4,4]);line(c,[[0,0],p],metro?'#bde2db':'#e7dcaf',1);c.restore();
    }
    if(bridge){const side=5;line(c,[[0,-side],[p[0],p[1]-side]],'#cdd6c1',1.4);line(c,[[0,side],[p[0],p[1]+side]],'#cdd6c1',1.4);}
  }
  if(tunnel){
    poly(c,[[-27,-2],[-17,-19],[-3,-29],[15,-22],[28,0],[15,6],[8,-6],[-7,-11],[-18,5]],'#8b9987');
    line(c,[[-18,5],[-13,-7],[-5,-11],[5,-9],[13,1]],'#c4c3ab',4);
    line(c,[[-18,4],[-12,-5],[-5,-8],[4,-6],[9,2]],'#566962',2);
  }
}
export function drawFacility(c, type, time=0, options={}) {
  const definition = DEFINITIONS.get(type) || {}, width = options.width || definition.width || 1, height = options.height || definition.height || 1;
  if(options.rotation===1&&(width>1||height>1)){c.save();c.scale(-1,1);drawFacility(c,type,time,{...options,width:height,height:width,rotation:0});c.restore();return;}
  if(ROAD_TYPES.has(type)||RAIL_TYPES.has(type)||type==='metroLine') { drawNetwork(c,type,options.x||0,options.y||0,options.occupancy,options.showMetro);return; }
  if(RETAIL_TYPES.has(type)){drawRetail(c,type,width,height);return;}
  const canonical = {townhouse:'cottage',residentialTower:'apartment',villa:'cottage',highschool:'school',university:'school',hospital:'clinic',medicalCenter:'clinic',largeFarm:'farm',agriculturalPark:'farm',seaport:'harbor',shippingHub:'harbor',internationalAirport:'airport',park:'garden',plaza:'garden',fireCenter:'fire',policeCenter:'police',office:'apartment',library:'school',museum:'school'}[type] || type;
  if(width===1&&height===1&&!['solar','wind','landmark','metroStation'].includes(type)){drawBuilding(c,canonical,time,options);return;}
  groundQuad(c,0,0,width,height,['farm','largeFarm','agriculturalPark'].includes(type)?'#b5b486':'#bfc5a9','#8fa58e',1.3);
  // Every complex has paths around its buildings rather than stretching a one-cell sprite.
  groundQuad(c,.08,.08,width-.16,height-.16,'#d6d0b0');
  const maxX=Math.max(0,width-1),maxY=Math.max(0,height-1);
  if(['hotel','bank','postOffice','cinema','sportsCenter'].includes(type)){
    drawCityAmenity(c,type,width,height);return;
  }
  if(AIRPORT_TYPES.has(type)) {
    const runwayCount=type==='internationalAirport'?2:1;
    const runwayHeight=(height-1.3-(runwayCount-1)*.3)/runwayCount;
    for(let runway=0;runway<runwayCount;runway++) {
      const top=.15+runway*(runwayHeight+.3),middle=top+runwayHeight/2-.5;
      groundQuad(c,.13,top,width-.26,runwayHeight,'#677c7e','#a1af9c',2);
      c.save();c.setLineDash([12,10]);line(c,[iso(.15,middle),iso(width-.85,middle)],'#f2ead0',2);c.restore();
      for(const end of [.22,width-1.12])for(let n=0;n<4;n++)line(c,[iso(end,top-.32+n*runwayHeight/5),iso(end+.26,top-.32+n*runwayHeight/5)],'#eae5ca',2.5);
      for(let x=.15;x<width-.1;x+=.8){atCell(c,x,top-.5,()=>rect(c,-1,-1,2,2,'#eed48e'));atCell(c,x,top+runwayHeight-.5,()=>rect(c,-1,-1,2,2,'#eed48e'));}
    }
    campusBlock(c,1,maxY,Math.min(width-2,4),1,21,'#e7e0cd','#85a4a3');
    atCell(c,width-1,maxY,()=>{box(c,0,3,9,9,50,'#c2c9b7','#d7d1b9','#9bada4');box(c,0,-43,15,15,12,'#d5ded0','#71a0a6','#5d858d');line(c,[[0,-57],[0,-69]],'#637d7c',1);});
    atCell(c,.8,maxY-.4,()=>drawPlane(c,0,0,0,.6));
    if(type==='internationalAirport')campusBlock(c,width-4,maxY,2,1,25,'#e9e0c4','#9bb6ad');
    return;
  }
  if(PORT_TYPES.has(type)) {
    groundQuad(c,0,0,width,height,'#a9bbb1');
    for(let x=0;x<width;x++) { groundQuad(c,x,maxY,.7,1,'#b69774','#877c63');for(let t=0;t<5;t++)line(c,[iso(x-.45,maxY-.45+t*.2),iso(x+.15,maxY-.45+t*.2)],'#8f785e',.7); }
    campusBlock(c,.6,.4,Math.max(1,width*.45),1,25,'#e7dabd','#6f9695');
    for(let x=Math.ceil(width*.6);x<width;x++){atCell(c,x,.2,()=>{rect(c,0,-32,3,35,'#baaa77');line(c,[[1,-31],[17,-22],[17,-7]],'#b79c69',3);line(c,[[0,-17],[17,-22]],'#95876b',1);});if(type!=='harbor')campusBlock(c,x,Math.max(.5,height-2),.7,.65,10,'#b58674','#aa7968');}
    if(type!=='harbor')for(let x=0;x<width-1;x++)for(let y=1;y<height-1;y++)atCell(c,x,y,()=>{
      const colors=['#ac7967','#719795','#a8aa79'],color=colors[(x+y)%3];box(c,0,5,13,17,9,color,color,'#6c827b');
      for(let n=3;n<13;n+=3)line(c,[[n,4-n*.5],[n,-3-n*.5]],'#d2c5a4',.7);
    });
    for(let x=0;x<width;x++)atCell(c,x,maxY,()=>{rect(c,-4,6,3,5,'#586e6c');rect(c,-6,6,7,2,'#cbbf9c');});
    atCell(c,0,0,()=>flag(c,-9,-32,'#d5a16d'));return;
  }
  if(['farm','largeFarm','agriculturalPark'].includes(type)){
    for(let x=0;x<width;x++)for(let y=0;y<height;y++) {
      groundQuad(c,x+.08,y+.08,.82,.82,(x+y)%3===0?'#b9a45f':'#8eaa69','#a39670',.7);
      for(let r=0;r<4;r++)line(c,[iso(x-.34,y-.32+r*.18),iso(x+.3,y-.32+r*.18)],r%2?'#718c51':'#d1be77',2);
    }
    atCell(c,0,maxY,()=>drawBuilding(c,'farm',time));
    if(type==='agriculturalPark'){campusBlock(c,width-2,maxY,1.8,.8,13,'#b7d4bd','#d4e3ce');atCell(c,maxX,0,()=>tree(c,0,0,16));}return;
  }
  if(['school','highschool','university'].includes(type)){
    campusBlock(c,.45,.35,Math.min(width-1,2.5),Math.min(1.6,height-1),30,'#e6d9b9','#be9272');
    atCell(c,.5,.2,()=>flag(c,0,-51));
    if(type!=='school') {
      const fx=width*.5,fy=height*.48,fw=width*.46,fh=height*.45;
      groundQuad(c,fx,fy,fw,fh,'#bf927b','#dac4a1',2);
      groundQuad(c,fx+.13,fy+.13,fw-.26,fh-.26,'#86a777','#e8ddbf',1);
      line(c,[iso(fx+fw/2-.5,fy-.35),iso(fx+fw/2-.5,fy+fh-.65)],'#eee2c1',1);
      if(type==='university')campusBlock(c,.3,maxY,1.7,1,37,'#dfd5b8','#8c9c8a');
    }else{atCell(c,maxX,maxY,()=>tree(c,0,0,11));}
    return;
  }
  if(['clinic','hospital','medicalCenter'].includes(type)) {
    campusBlock(c,.4,.35,Math.max(1,width*.55),Math.max(1,height*.52),type==='clinic'?29:47,'#e9e6d0','#9eb9b3');
    atCell(c,.4,.35,()=>{rect(c,-5,-43,4,14,'#c07869');rect(c,-10,-38,14,4,'#c07869');});
    if(type!=='clinic') {campusBlock(c,maxX-.7,maxY-.2,1.3,1.1,26,'#e4dfc7','#8fa5a0');groundQuad(c,0,maxY,1,1,'#a7b6a7');atCell(c,0,maxY,()=>{c.fillStyle='#f0ead1';c.font='bold 15px sans-serif';c.fillText('H',-6,5);});}
    if(type==='medicalCenter')campusBlock(c,2,maxY,2,1,55,'#e1e4d4','#8dacab');return;
  }
  if(type==='station'||type==='metroStation'||type==='busStation') {
    const metro=type==='metroStation';
    for(let x=0;x<width;x++)atCell(c,x,maxY,()=>drawNetwork(c,metro?'metroLine':type==='busStation'?'asphalt':'railway',0,0,new Map(),true));
    campusBlock(c,Math.max(.2,width*.3),.25,Math.max(1,width*.65),Math.max(.65,height-1),24,'#e3dbc0',metro?'#658d93':'#889d9a');
    atCell(c,0,maxY,()=>{rect(c,-3,-23,2,24,'#6c827b');rect(c,-8,-25,13,10,metro?'#387f89':'#bd9571');c.fillStyle='#f0ead4';c.font='bold 8px sans-serif';c.fillText(metro?'M':type==='busStation'?'B':'R',-5,-17);});return;
  }
  if(type==='solar') {
    for(let x=0;x<width;x++)for(let y=0;y<height;y++) {groundQuad(c,x+.1,y+.1,.75,.6,'#659499','#bdcbb1',1);line(c,[iso(x-.06,y-.4),iso(x-.06,y+.2)],'#acd3ca',.8);line(c,[iso(x-.4,y-.08),iso(x+.35,y-.08)],'#acd3ca',.8);}return;
  }
  if(type==='wind') {
    for(let x=0;x<width;x+=2)for(let y=0;y<height;y+=2)atCell(c,x+.5,y+.5,()=>line(c,[[0,4],[0,-53]],'#dedcc7',4));
    if(!options.staticPass)drawFacilityAnimation(c,type,time,{...options,width,height});return;
  }
  if(type==='stadium') {
    groundQuad(c,.1,.1,width-.2,height-.2,'#b1aa98','#e3d6b7',6);
    groundQuad(c,.5,.5,width-1,height-1,'#b58d77','#ece3c8',3);
    groundQuad(c,.8,.8,width-1.6,height-1.6,'#86a278','#dedfc0',2);
    line(c,[iso(width/2-.5,.3),iso(width/2-.5,height-1.3)],'#e4e3c6',2);
    for(const [x,y]of[[0,0],[maxX,0],[0,maxY],[maxX,maxY]])atCell(c,x,y,()=>{line(c,[[0,0],[0,-43]],'#a0afa2',2);rect(c,-6,-47,13,4,'#ece7ce');});return;
  }
  if(['park','plaza','garden'].includes(type)) {
    groundQuad(c,.15,.15,width-.3,height-.3,'#93ac7c');
    line(c,[iso(0,maxY/2),iso(maxX,maxY/2)],'#d5c8a6',6);
    line(c,[iso(maxX/2,0),iso(maxX/2,maxY)],'#d5c8a6',6);
    atCell(c,maxX/2,maxY/2,()=>drawBuilding(c,'garden'));
    for(const [x,y] of [[0,0],[maxX,0],[0,maxY],[maxX,maxY]])atCell(c,x,y,()=>tree(c,0,0,12));return;
  }
  if(type==='landmark') {
    atCell(c,maxX/2,maxY/2,()=>{box(c,0,12,32,32,14,'#d5c6a3','#dfd6b9','#acae98');box(c,0,-6,18,18,92,'#6d9391','#cbd9c7','#84aaa2');box(c,0,-96,27,27,15,'#7e9f97','#b7cdc0','#668f8c');line(c,[[0,-124],[0,-150]],'#c6ad6f',2);});return;
  }
  if(['residentialTower','office','apartment','townhouse','villa'].includes(type)) {
    const tall=['residentialTower','office'].includes(type), blocks=type==='villa'?1:Math.max(1,Math.floor(width*height/3));
    for(let i=0;i<blocks;i++){const x=i%Math.max(1,width-1),y=Math.floor(i/Math.max(1,width-1));campusBlock(c,x+.3,y+.3,1.1,1.1,tall?62+i%3*17:type==='apartment'?43:27,'#e3d9bd',tall?'#84a6a1':'#b18a70');}
    atCell(c,maxX,maxY,()=>tree(c,0,0,13));return;
  }
  if(type==='factory') {for(let x=0;x<width;x+=2)atCell(c,x+.5,height*.45,()=>drawBuilding(c,'factory',time,options));return;}
  campusBlock(c,.5,.5,Math.max(1,width*.7),Math.max(1,height*.55),['museum','library'].includes(type)?33:29,'#e6dcc1',['fire','fireCenter'].includes(type)?'#b9806a':'#8ba5a0');
  if(['fire','fireCenter','police','policeCenter'].includes(type))atCell(c,maxX,maxY,()=>drawBuilding(c,canonical,time));
  else atCell(c,maxX,maxY,()=>tree(c,0,0,10));
}
function drawCityAmenity(c,type,width,height){
  const x=width*.4,y=height*.35,p=iso(x,y),w=height*20,d=width*21;
  const color={hotel:'#9c9183',bank:'#87958c',postOffice:'#63917b',cinema:'#a96f69',sportsCenter:'#7399a0'}[type];
  if(type==='sportsCenter'){
    groundQuad(c,.1,.1,width-.2,height-.2,'#b3b99b');campusBlock(c,.2,.2,1,2,33,'#e3d7b6',color);
    groundQuad(c,1.2,.25,1.5,2.45,'#b78c70','#eadcbd',1.5);groundQuad(c,1.3,.35,1.3,2.25,'#839c79','#eee1bd');
    line(c,[iso(.8,1),iso(2.1,1)],'#f0e0bf',1);
    for(const yy of [0,2])atCell(c,1.9,yy,()=>{rect(c,0,-17,1,21,'#9aa89a');rect(c,-5,-19,11,6,'#e6dfc8');line(c,[[-2,-12],[4,-12]],'#bd7c63',1.6);});return;
  }
  const tall=type==='hotel'?68:type==='cinema'?36:30;
  campusBlock(c,x,y,width*.65,height*.65,tall,'#e2d9bf',color);
  if(type==='hotel'){
    for(let row=0;row<4;row++)for(let col=0;col<3;col++){const xx=p[0]-27+col*10,yy=p[1]-54+row*13+col*5;line(c,[[xx,yy],[xx+7,yy+3]],'#ede6c8',2);line(c,[[xx,yy],[xx,yy-3],[xx+7,yy]],'#8f9f8c',.7);}
    wallSign(c,p[0]-27,p[1]-76,43,'FOCU HOTEL',color);atCell(c,0,height-1,()=>{awning(c,-15,-9,35,'#a99573');planter(c,20,4);});
  }else if(type==='bank'){
    for(let i=0;i<4;i++)box(c,p[0]-25+i*12,p[1]+i*5-7,3,3,24,'#dfd5b7','#f0e5c9','#bab99e');
    wallSign(c,p[0]-35,p[1]-48,46,'CITY BANK',color);poly(c,[[p[0]-40,p[1]-46],[p[0]-16,p[1]-63],[p[0]+8,p[1]-22]],'#d7ceb2');
    atCell(c,width-1,height-1,()=>{rect(c,7,-14,8,16,'#789891');rect(c,9,-11,4,4,'#b6d0bd');});
  }else if(type==='postOffice'){
    wallSign(c,p[0]-25,p[1]-39,37,'POST',color);atCell(c,0,height-1,()=>{box(c,0,4,5,6,14,'#d2a177','#b8765f','#9b6c55');rect(c,-3,-6,5,1,'#584e42');});
    atCell(c,width-1,0,()=>{box(c,0,4,8,8,6,'#bdad82','#d6bd90','#ad946d');});
  }else{
    wallSign(c,p[0]-31,p[1]-43,56,'CINEMA',color);awning(c,p[0]-31,p[1]-21,56,'#b18c67');
    for(let i=0;i<4;i++){shopWindow(c,p[0]-30+i*12,p[1]-12+i*6,8,14);rect(c,p[0]-28+i*12,p[1]-10+i*6,4,6,['#d19d78','#8daba0'][i%2]);}
    for(let i=0;i<8;i++)rect(c,p[0]-30+i*7,p[1]-44+i*3.5,2,2,'#f1ce84');
  }
  atCell(c,width-1,height-1,()=>{lamp(c,15,7);planter(c,-12,12);});
}

export function drawFacilityAnimation(c,type,time=0,options={}){
  const width=options.width||1,height=options.height||1;
  if(options.rotation===1&&(width>1||height>1)){c.save();c.scale(-1,1);drawFacilityAnimation(c,type,time,{...options,width:height,height:width,rotation:0});c.restore();return;}
  if(type==='wind')for(let x=0;x<width;x+=2)for(let y=0;y<height;y+=2)atCell(c,x+.5,y+.5,()=>{
    c.save();c.translate(0,-52);c.rotate(time*.00035+x);for(let i=0;i<3;i++){c.rotate(Math.PI*2/3);poly(c,[[0,0],[-2,-27],[2,-14],[3,-2]],'#ece7d2','#aaa98e',.5);}c.restore();
  });
  if(type==='factory'){
    if(width===1&&height===1){c.save();chimneySmoke(c,time);c.restore();}
    else for(let x=0;x<width;x+=2)atCell(c,x+.5,height*.45,()=>chimneySmoke(c,time));
  }
}

export function drawCar(c,x,y,direction,seed=0,kind='car') {
  c.save();c.translate(x,y);const dx=Math.cos(direction),dy=Math.sin(direction),heading=Math.atan2((dx+dy)*16,(dx-dy)*32);c.rotate(heading);
  shadow(c,1,3,kind==='car'?8:15,3);
  const color=kind==='metro'?'#62a7a8':kind==='train'?'#cdad6c':['#dba089','#e7d6a9','#80a7a5','#a1ad88'][seed%4];
  const length=kind==='car'?13:26;rect(c,-length/2,-5,length,8,color);rect(c,-length/2+2,-6,length-5,3,'#ccd7c9');rect(c,1,-4,4,5,'#537d82');
  rect(c,-length/2+2,-6,3,1,'#556c66');rect(c,-length/2+2,3,3,1,'#556c66');rect(c,length/2-2,-3,2,2,'#f0dfa8');c.restore();
}
const vehicleColors=['#be7667','#779d92','#e2cf9d','#8c9fbb','#b5ba90'];
function roadVehicle(c,style,seed){
  const bus=style==='bus'||style==='coach',van=style==='van',rail=style==='train'||style==='metro';
  const length=rail?29:bus?29:van?20:16,half=length/2,width=bus||rail?5.5:4.5;
  const color=style==='taxi'?'#dfb85e':style==='bus'?'#73a18b':style==='coach'?'#d9d9c2':style==='metro'?'#68a5a4':style==='train'?'#c6a56f':vehicleColors[Math.abs(seed)%vehicleColors.length];
  shadow(c,0,3,half+2,width);rect(c,-half,-width,length,width*2,color);
  poly(c,[[-half,-width],[half-2,-width],[half,-width+2],[half,width-1],[-half,width-1]],color,'#657c72',.7);
  const roof=bus||rail?length-6:van?length-6:8;
  rect(c,-roof/2-1,-width+1,roof,width*2-3,van?'#e1dec5':'#a9c2bd');
  rect(c,half-5,-width+1,3,width*2-2,'#547d83');
  if(bus||rail){
    for(let xx=-half+4;xx<half-6;xx+=5){rect(c,xx,-width,3,2,'#49737b');rect(c,xx,width-2,3,2,'#49737b');}
    rect(c,-half+5,-1,length-13,2,style==='coach'?'#b9c7ba':'#d6e3c8');
    rect(c,half-2,-2,1,3,'#eecb6f');
  }
  for(const xx of [-half+3,half-5])for(const yy of [-width-1,width-1])rect(c,xx,yy,3,2,'#415550');
  rect(c,half-1,-width+1,2,2,'#fff0b8');rect(c,half-1,width-3,2,2,'#fff0b8');rect(c,-half,-width+1,1,2,'#c77d65');
  if(style==='taxi'){rect(c,-2,-2,5,3,'#e6d38a');rect(c,-1,-1,3,1,'#5b6960');}
  if(style==='coach'){rect(c,-8,-2,9,3,'#c2c7b7');rect(c,3,-2,4,3,'#bcc5b5');}
}
function vessel(c,style,seed,time){
  const large=style==='cargo'||style==='liner',length=large?57:style==='ferry'?36:25,half=length/2,w=large?10:7;
  line(c,[[-half-12,-w-2],[-half-5,-w],[-half+2,-w]],'rgba(218,239,222,.65)',1);
  line(c,[[-half-15,w+2],[-half-6,w],[-half,w]],'rgba(218,239,222,.55)',1);
  poly(c,[[-half,-w],[half-8,-w],[half+2,0],[half-8,w],[-half,w],[-half-4,0]],'#526e73','#d6d7bc',.8);
  poly(c,[[-half+2,-w+2],[half-9,-w+2],[half-1,0],[half-9,w-2],[-half+2,w-2]],large?'#bfbda2':'#e1d7b9');
  if(style==='cargo'){
    for(let xx=-6;xx<half-7;xx+=8)for(let row=0;row<2;row++){rect(c,xx,-7+row*7,7,6,['#b77b65','#76a09a','#c1aa72'][(row+Math.floor(xx/8)+3)%3]);for(let n=1;n<7;n+=2)line(c,[[xx+n,-6+row*7],[xx+n,-2+row*7]],'#ded3b4',.5);}
    rect(c,-half+4,-6,11,12,'#dedeca');rect(c,-half+7,-4,8,8,'#93b2ab');rect(c,-half+5,-3,2,6,'#5f858b');
  }else if(style==='liner'||style==='ferry'){
    const cabin=large?36:21;rect(c,-cabin/2,-w+2,cabin,w*2-4,'#eee8ce');
    rect(c,-cabin/2+3,-w+4,cabin-7,w*2-8,'#b0c7bd');
    for(let xx=-cabin/2+2;xx<cabin/2-2;xx+=4){rect(c,xx,-w+1,2,2,'#5b8791');rect(c,xx,w-3,2,2,'#5b8791');}
    rect(c,-5,-3,4,6,'#bf826c');if(large)rect(c,3,-3,4,6,'#bf826c');
  }else{
    line(c,[[-9,0],[10,0]],'#8c8263',1);rect(c,-5,-4,7,8,'#b18e6e');
  }
}
export function drawVehicle(c,kind,x,y,direction=0,seed=0,time=0,style){
  if(kind==='plane'){drawPlane(c,x,y,direction,.85);return;}
  const dx=Math.cos(direction),dy=Math.sin(direction),heading=Math.atan2((dx+dy)*16,(dx-dy)*32);
  c.save();c.translate(x,y+(kind==='boat'?Math.sin(time*.001+seed)*.6:0));
  c.save();c.rotate(heading);
  if(kind==='boat')vessel(c,style||'sailboat',seed,time);
  else roadVehicle(c,kind==='car'?(style||'car'):kind,seed);
  c.restore();
  if(kind==='boat'&&(!style||style==='sailboat')){
    line(c,[[0,1],[0,-29]],'#847b62',1.2);poly(c,[[1,-29],[1,-3],[15,-8]],'#f0e4bd','#b9ba9e',.7);poly(c,[[-2,-25],[-12,-6],[-2,-4]],seed%2?'#a9c5b7':'#d9ab83');
  }
  c.restore();
}
export function drawPlane(c,x,y,direction=0,scale=1) {
  c.save();c.translate(x,y);c.scale(scale,scale);const dx=Math.cos(direction),dy=Math.sin(direction);c.rotate(Math.atan2((dx+dy)*16,(dx-dy)*32));
  poly(c,[[24,0],[16,-3],[4,-3],[-8,-19],[-13,-19],[-5,-3],[-18,-3],[-24,-9],[-27,-9],[-23,0],[-27,9],[-24,9],[-18,3],[-5,3],[-13,19],[-8,19],[4,3],[16,3]],'#f1ebd8','#9bafa6',.7);
  line(c,[[7,0],[17,0]],'#709ba3',2);line(c,[[-20,0],[-13,0]],'#77a5a2',2);c.restore();
}

export function drawBuildingIcon(canvas,type) {
  const dpr = Math.min(globalThis.window?.devicePixelRatio || 1,2), size = canvas.clientWidth || 64, height = canvas.clientHeight || 64;
  canvas.width = Math.round(size*dpr);canvas.height = Math.round(height*dpr);
  const c=canvas.getContext('2d');if(!c)return;
  c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,size,height);c.imageSmoothingEnabled=false;
  const item=DEFINITIONS.get(type)||{},w=item.width||1,h=item.height||1;
  const extents=(w+h)*32,vertical=(w+h)*16+60;
  const scale=Math.min((size-6)/extents,(height-5)/vertical);
  c.translate(size/2-(w-h)*16*scale,height*.67-(w+h-2)*8*scale);c.scale(scale,scale);
  drawFacility(c,type,0,{width:w,height:h,occupancy:new Map(),showMetro:true});
}

