import { CATALOG, getFootprint, getBuildingAt, canBuildAt } from './model.js';
import { buildTransportRoutes, sampleRoute, buildingCells } from './transport.js';

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

const DEFINITIONS = new Map(CATALOG.map(item => [item.id, item]));
const ROAD_TYPES = new Set(['road', 'asphalt', 'bridge', 'tunnel']);
const RAIL_TYPES = new Set(['railway', 'railBridge']);
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
function drawFacility(c, type, time=0, options={}) {
  const definition = DEFINITIONS.get(type) || {}, width = options.width || definition.width || 1, height = options.height || definition.height || 1;
  if(options.rotation===1&&width>1&&height>1){c.save();c.scale(-1,1);drawFacility(c,type,time,{...options,width:height,height:width,rotation:0});c.restore();return;}
  if(ROAD_TYPES.has(type)||RAIL_TYPES.has(type)||type==='metroLine') { drawNetwork(c,type,options.x||0,options.y||0,options.occupancy,options.showMetro);return; }
  const canonical = {townhouse:'cottage',residentialTower:'apartment',villa:'cottage',highschool:'school',university:'school',hospital:'clinic',medicalCenter:'clinic',largeFarm:'farm',agriculturalPark:'farm',seaport:'harbor',shippingHub:'harbor',internationalAirport:'airport',park:'garden',plaza:'garden',fireCenter:'fire',policeCenter:'police',office:'apartment',library:'school',museum:'school'}[type] || type;
  if(width===1&&height===1&&!['solar','wind','landmark','metroStation'].includes(type)){drawBuilding(c,canonical,time,options);return;}
  groundQuad(c,0,0,width,height,['farm','largeFarm','agriculturalPark'].includes(type)?'#b5b486':'#bfc5a9','#8fa58e',1.3);
  // Every complex has paths around its buildings rather than stretching a one-cell sprite.
  groundQuad(c,.08,.08,width-.16,height-.16,'#d6d0b0');
  const maxX=Math.max(0,width-1),maxY=Math.max(0,height-1);
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
    for(let x=0;x<width;x+=2)for(let y=0;y<height;y+=2)atCell(c,x+.5,y+.5,()=>{line(c,[[0,4],[0,-53]],'#dedcc7',4);c.save();c.translate(0,-52);c.rotate(time*.00035+x);for(let i=0;i<3;i++){c.rotate(Math.PI*2/3);poly(c,[[0,0],[-2,-27],[2,-14],[3,-2]],'#ece7d2');}c.restore();});return;
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
  if(type==='factory') {for(let x=0;x<width;x+=2)atCell(c,x+.5,height*.45,()=>drawBuilding(c,'factory',time));return;}
  campusBlock(c,.5,.5,Math.max(1,width*.7),Math.max(1,height*.55),['museum','library'].includes(type)?33:29,'#e6dcc1',['fire','fireCenter'].includes(type)?'#b9806a':'#8ba5a0');
  if(['fire','fireCenter','police','policeCenter'].includes(type))atCell(c,maxX,maxY,()=>drawBuilding(c,canonical,time));
  else atCell(c,maxX,maxY,()=>tree(c,0,0,10));
}
function drawCar(c,x,y,direction,seed=0,kind='car') {
  c.save();c.translate(x,y);const dx=Math.cos(direction),dy=Math.sin(direction),heading=Math.atan2((dx+dy)*16,(dx-dy)*32);c.rotate(heading);
  shadow(c,1,3,kind==='car'?8:15,3);
  const color=kind==='metro'?'#62a7a8':kind==='train'?'#cdad6c':['#dba089','#e7d6a9','#80a7a5','#a1ad88'][seed%4];
  const length=kind==='car'?13:26;rect(c,-length/2,-5,length,8,color);rect(c,-length/2+2,-6,length-5,3,'#ccd7c9');rect(c,1,-4,4,5,'#537d82');
  rect(c,-length/2+2,-6,3,1,'#556c66');rect(c,-length/2+2,3,3,1,'#556c66');rect(c,length/2-2,-3,2,2,'#f0dfa8');c.restore();
}
function drawPlane(c,x,y,direction=0,scale=1) {
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

export function createWorld(canvas,{getState,onTileClick,onHover}={}) {
  const c=canvas.getContext('2d',{alpha:false});
  let width=1,height=1,dpr=1,zoom=.95,panX=0,panY=0,tool=null,rotation=0,hover=null,keyboardCursor=null,down=null,dead=false,active=true,raf=0,lastHover='',showMetro=false;
  let currentSeed=seedNumber(getState?.()?.seed),terrainCache=new Map(),signature='',occupancy=new Map(),routes=[],entries=[],lastPlan=0,validationKey='',validation=null;
  canvas.style.touchAction='none';canvas.style.cursor='grab';
  const terrain=(x,y)=>{const key=`${x},${y}`;let t=terrainCache.get(key);if(!t){t=terrainAt(x,y,currentSeed);terrainCache.set(key,t);}return t;};
  function refreshNetwork(force=false){
    const state=getState?.()||{},buildings=state.buildings||{},seed=seedNumber(state.seed);
    if(seed!==currentSeed){currentSeed=seed;terrainCache.clear();signature='';}
    const items=Object.entries(buildings),next=items.map(([key,b])=>`${key}:${b.type}:${b.width||1}:${b.height||1}`).join('|');
    if(!force&&next===signature)return;
    signature=next;entries=items.map(([key,building])=>{const [x,y]=key.split(',').map(Number);return {key,x,y,building};});
    occupancy=new Map();for(const entry of entries)for(const p of buildingCells(entry.key,entry.building))occupancy.set(`${p.x},${p.y}`,entry);
    routes=buildTransportRoutes(buildings,terrain);validationKey='';
  }
  function resize(){const r=canvas.getBoundingClientRect();width=r.width||900;height=r.height||620;dpr=Math.min(globalThis.window?.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
  const ro=new ResizeObserver(resize);ro.observe(canvas);resize();
  function worldPoint(px,py){const a=(px-width/2-panX)/zoom,b=(py-height/2-panY)/zoom;return {x:(b/16+a/32)/2,y:(b/16-a/32)/2};}
  function tilePoint(event){const r=canvas.getBoundingClientRect(),p=worldPoint(event.clientX-r.left,event.clientY-r.top);return {x:Math.floor(p.x+.5),y:Math.floor(p.y+.5)};}
  function screenTile(x,y){return {x:(x-y)*32,y:(x+y)*16};}
  function tileInfo(pos){const state=getState?.()||{};return {...pos,terrain:terrain(pos.x,pos.y),building:getBuildingAt(state,pos.x,pos.y)?.building||null};}
  function emitHover(pos){hover=pos;const key=`${hover.x},${hover.y}`;if(key!==lastHover){lastHover=key;onHover?.(tileInfo(pos));}}
  function pointerDown(e){if(e.button!==0)return;keyboardCursor=null;canvas.focus({preventScroll:true});down={x:e.clientX,y:e.clientY,panX,panY,moved:false};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';}
  function pointerMove(e){keyboardCursor=null;if(down){const dx=e.clientX-down.x,dy=e.clientY-down.y;if(Math.hypot(dx,dy)>5)down.moved=true;if(down.moved){panX=down.panX+dx;panY=down.panY+dy;}}emitHover(tilePoint(e));}
  function pointerUp(e){if(!down)return;const moved=down.moved;down=null;canvas.style.cursor=tool?'crosshair':'grab';if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(!moved){onTileClick?.(tileInfo(tilePoint(e)));refreshNetwork();}}
  function pointerCancel(){down=null;canvas.style.cursor=tool?'crosshair':'grab';}
  function pointerLeave(){if(!down&&!keyboardCursor){hover=null;lastHover='';onHover?.(null);}}
  function keyDown(e){
    if(e.altKey||e.ctrlKey||e.metaKey)return;
    const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    const pan={a:[100,0],d:[-100,0],w:[0,100],s:[0,-100]};
    if(pan[e.key.toLowerCase()]){e.preventDefault();const [x,y]=pan[e.key.toLowerCase()];panX+=x;panY+=y;return;}
    if(['+','=','-'].includes(e.key)){e.preventDefault();zoomTo(zoom+(e.key==='-'?-.12:.12));return;}
    if(e.key==='Escape'){keyboardCursor=null;hover=null;lastHover='';onHover?.(null);return;}
    if(!(e.key in directions)&&e.key!=='Enter'&&e.key!==' ')return;
    e.preventDefault();const pos={...(keyboardCursor||{x:0,y:0})};
    if(e.key in directions){const [dx,dy]=directions[e.key],step=e.shiftKey?8:1;pos.x+=dx*step;pos.y+=dy*step;}
    keyboardCursor=pos;emitHover(pos);
    const p=screenTile(pos.x,pos.y),sx=width/2+panX+p.x*zoom,sy=height/2+panY+p.y*zoom;
    const mx=Math.min(110,width*.2),my=Math.min(140,height*.22);
    if(sx<mx)panX+=mx-sx;else if(sx>width-mx)panX+=width-mx-sx;
    if(sy<my)panY+=my-sy;else if(sy>height-my)panY+=height-my-sy;
    if(e.key==='Enter'||e.key===' '){onTileClick?.(tileInfo(pos));refreshNetwork();}
  }
  function zoomTo(value,px=width/2,py=height/2){const old=zoom;zoom=clamp(value,.4,2.3);panX=px-width/2-(px-width/2-panX)*zoom/old;panY=py-height/2-(py-height/2-panY)*zoom/old;}
  function wheel(e){e.preventDefault();const r=canvas.getBoundingClientRect();zoomTo(zoom*Math.exp(-e.deltaY*.001),e.clientX-r.left,e.clientY-r.top);}
  canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',pointerCancel);canvas.addEventListener('pointerleave',pointerLeave);canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('keydown',keyDown);
  function drawTraffic(time){
    const speeds={car:1.5,walker:.32,boat:.55,train:2.2,metro:2.8,plane:3.4};
    for(let i=0;i<routes.length;i++){
      const route=routes[i];if(route.kind==='metro'&&!showMetro)continue;
      const sample=sampleRoute(route,time/1000,speeds[route.kind],i*2.1);if(!sample)continue;
      const p=screenTile(sample.x,sample.y);
      if(p.x*zoom+width/2+panX<-100||p.x*zoom+width/2+panX>width+100||p.y*zoom+height/2+panY<-100||p.y*zoom+height/2+panY>height+100)continue;
      if(route.kind==='car'&&occupancy.get(`${Math.round(sample.x)},${Math.round(sample.y)}`)?.building.type==='tunnel')continue;
      if(route.kind==='walker')drawPerson(c,p.x+5,p.y+2,i,time);
      else if(route.kind==='boat')drawBoat(c,p.x,p.y,time,i);
      else if(route.kind==='plane'){
        const altitude=Math.sin(sample.progress*Math.PI)*70;shadow(c,p.x+altitude*.3,p.y,16,5);drawPlane(c,p.x,p.y-altitude,sample.direction,.78);
      }else{
        if(route.kind==='metro'){c.save();c.globalAlpha=.78;}
        if(route.kind==='train'||route.kind==='metro')for(let coach=2;coach>=0;coach--){const back=sampleRoute(route,time/1000-coach*.35,speeds[route.kind],i*2.1);const bp=screenTile(back.x,back.y);drawCar(c,bp.x,bp.y-2,back.direction,i,route.kind);}
        else drawCar(c,p.x,p.y-1,sample.direction,i);
        if(route.kind==='metro')c.restore();
      }
    }
  }
  function drawHover(time,state){
    if(!hover||down)return;
    const existing=getBuildingAt(state,hover.x,hover.y),demolition=tool==='demolish'||tool==='bulldozer';
    let cells=existing?getFootprint(existing.building,existing.x,existing.y):[{x:hover.x,y:hover.y}],invalid=false;
    if(tool&&!demolition){
      cells=getFootprint(tool,hover.x,hover.y,rotation);
      const key=`${hover.x},${hover.y}:${tool}:${rotation}:${state.points}:${signature}`;
      if(key!==validationKey){validationKey=key;validation=canBuildAt(state,tool,hover.x,hover.y,terrain,rotation);}
      invalid=!validation?.ok;
    }else if(demolition)invalid=!existing;
    for(const cell of cells){const p=screenTile(cell.x,cell.y);c.save();c.translate(p.x,p.y);poly(c,diamond,invalid?'rgba(180,71,64,.36)':demolition?'rgba(204,134,81,.32)':'rgba(218,242,186,.28)',invalid?'#ffd3b7':demolition?'#f4c391':'#e3f4c7',1.5);c.restore();}
    if(tool&&!demolition&&cells.length){
      const p=screenTile(hover.x,hover.y),w=Math.max(...cells.map(p=>p.x))-hover.x+1,h=Math.max(...cells.map(p=>p.y))-hover.y+1;
      c.save();c.translate(p.x,p.y);c.globalAlpha=invalid?.24:.62;drawFacility(c,tool,time,{x:hover.x,y:hover.y,width:w,height:h,rotation,occupancy,showMetro});c.restore();
    }
  }
  function render(time){
    if(dead||!active)return;raf=requestAnimationFrame(render);
    if(time-lastPlan>120||!lastPlan){refreshNetwork();lastPlan=time;}
    if(terrainCache.size>65000)terrainCache.clear();
    c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#9bb784';c.fillRect(0,0,width,height);c.imageSmoothingEnabled=false;
    c.save();c.translate(width/2+panX,height/2+panY);c.scale(zoom,zoom);
    const corners=[worldPoint(-100,-100),worldPoint(width+100,-100),worldPoint(-100,height+180),worldPoint(width+100,height+180)];
    const minX=Math.floor(Math.min(...corners.map(p=>p.x)))-2,maxX=Math.ceil(Math.max(...corners.map(p=>p.x)))+2,minY=Math.floor(Math.min(...corners.map(p=>p.y)))-2,maxY=Math.ceil(Math.max(...corners.map(p=>p.y)))+2;
    const tiles=[];
    for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){
      const p=screenTile(x,y);if(p.x*zoom+width/2+panX<-90||p.x*zoom+width/2+panX>width+90||p.y*zoom+height/2+panY<-80||p.y*zoom+height/2+panY>height+160)continue;
      const entry=occupancy.get(`${x},${y}`),ground=terrain(x,y);tiles.push({x,y,p,entry,ground});
    }
    tiles.sort((a,b)=>(a.x+a.y)-(b.x+b.y)||a.x-b.x);
    for(const t of tiles){c.save();c.translate(t.p.x,t.p.y);drawTerrain(c,t.x,t.y,t.entry&&t.ground!=='water'?'grass':t.ground,currentSeed,time,terrain);c.restore();}
    const visible=entries.filter(entry=>{const w=entry.building.width||1,h=entry.building.height||1;return entry.x<=maxX&&entry.y<=maxY&&entry.x+w>=minX&&entry.y+h>=minY;});
    // Infrastructure lies on the ground; tall complexes are then sorted by their front edge.
    visible.sort((a,b)=>{
      const surface=id=>ROAD_TYPES.has(id)||RAIL_TYPES.has(id)||id==='metroLine';
      if(surface(a.building.type)!==surface(b.building.type))return surface(a.building.type)?-1:1;
      return a.x+a.y+(a.building.width||1)+(a.building.height||1)-b.x-b.y-(b.building.width||1)-(b.building.height||1);
    });
    for(const entry of visible){const p=screenTile(entry.x,entry.y);c.save();c.translate(p.x,p.y);drawFacility(c,entry.building.type,time,{x:entry.x,y:entry.y,width:entry.building.width||1,height:entry.building.height||1,rotation:entry.building.rotation||0,occupancy,showMetro});c.restore();}
    drawTraffic(time);drawHover(time,getState?.()||{});c.restore();
  }
  refreshNetwork(true);raf=requestAnimationFrame(render);
  return {
    setTool(id){tool=id||null;validationKey='';canvas.style.cursor=tool?'crosshair':'grab';},
    setRotation(value){rotation=value===1?1:0;validationKey='';},
    setActive(value){const next=!!value;if(next===active)return;active=next;if(active&&!dead){resize();raf=requestAnimationFrame(render);}else cancelAnimationFrame(raf);},
    setShowMetro(value){showMetro=!!value;},
    setZoom(value){zoomTo(value);},zoomBy(delta){zoomTo(zoom+delta);},
    center(){panX=0;panY=0;zoom=.95;keyboardCursor=null;hover=null;lastHover='';onHover?.(null);},
    getView(){return {zoom,x:panX,y:panY};},
    getTrafficSummary(){refreshNetwork();const summary={cars:0,walkers:0,boats:0,trains:0,metros:0,planes:0},keys={car:'cars',walker:'walkers',boat:'boats',train:'trains',metro:'metros',plane:'planes'};for(const route of routes)summary[keys[route.kind]]++;return summary;},
    destroy(){dead=true;cancelAnimationFrame(raf);ro.disconnect();canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointercancel',pointerCancel);canvas.removeEventListener('pointerleave',pointerLeave);canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('keydown',keyDown);},
  };
}
