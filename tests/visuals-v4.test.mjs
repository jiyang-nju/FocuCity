import test from 'node:test';
import assert from 'node:assert/strict';
import { drawFacility, drawFacilityAnimation, drawTerrain, drawEasterEgg } from '../dist/visuals.js';

function recorder(){
  const fills=[],strokes=[],texts=[],ellipses=[];let path=[],depth=0;
  const c={globalAlpha:1,beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},closePath(){},fill(){fills.push({color:this.fillStyle,path:[...path]});},stroke(){strokes.push({color:this.strokeStyle,width:this.lineWidth,path:[...path]});},fillText(text){texts.push(text);},save(){depth++;},restore(){assert.ok(depth>0);depth--;},ellipse(...args){ellipses.push(args);}};
  for(const name of ['fillRect','translate','scale','rotate','transform','setLineDash'])c[name]=()=>{};
  for(const [name,fn]of Object.entries(c))if(typeof fn==='function')c[name]=(...args)=>{
    for(const value of args)if(typeof value==='number')assert.ok(Number.isFinite(value),`${name}: finite coordinates`);
    return fn.apply(c,args);
  };
  return {c,fills,strokes,texts,ellipses,get depth(){return depth;}};
}
const entry=type=>({building:{type}});

test('adjacent asphalt tiles form continuous pavement with curbs only at exposed edges',()=>{
  const all=new Map();for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)all.set(`${x},${y}`,entry('asphalt'));
  const interior=recorder();drawFacility(interior.c,'asphalt',0,{occupancy:all});
  assert.ok(interior.fills.some(fill=>fill.color==='#738383'));
  assert.equal(interior.strokes.filter(stroke=>stroke.color==='#d9d8bf').length,0,'a paved interior has no cell outlines');
  const isolated=recorder();drawFacility(isolated.c,'asphalt',0,{occupancy:new Map()});
  assert.equal(isolated.strokes.filter(stroke=>stroke.color==='#d9d8bf').length,4);
  const edge=recorder();drawFacility(edge.c,'asphalt',0,{x:1,y:0,occupancy:all});
  assert.equal(edge.strokes.filter(stroke=>stroke.color==='#d9d8bf').length,1);
});

test('rail crossing respects nested/prefixed track neighbors and preserves the road surface',()=>{
  for(const representation of ['nested','prefixed']){
    const occupancy=new Map([['0,0',{...entry('asphalt'),surface:entry('asphalt'),rail:entry('railway')}]]);
    for(const y of [-1,1])occupancy.set(representation==='nested'?`0,${y}`:`rail:0,${y}`,representation==='nested'?{...entry('asphalt'),surface:entry('asphalt'),rail:entry('railway')}:entry('railway'));
    const r=recorder();drawFacility(r.c,'railway',0,{occupancy});
    assert.equal(r.fills.filter(fill=>fill.color==='#a8b696').length,0,'rail crossing never paints grass over asphalt');
    const beds=r.strokes.filter(stroke=>stroke.width===13);
    assert.equal(beds.length,2);
    assert.deepEqual(beds.map(stroke=>stroke.path.at(-1)).sort((a,b)=>a[0]-b[0]),[[-16,8],[16,-8]]);
    assert.ok(r.strokes.some(stroke=>stroke.color==='#bd8067'),'crossing warning posts are visible');
  }
});

test('legacy neighbor maps still connect, while hidden underground lines draw nothing',()=>{
  const legacy=recorder();drawFacility(legacy.c,'asphalt',0,{occupancy:new Map([['1,0',entry('road')],['-1,0',entry('asphalt')]])});
  assert.equal(legacy.strokes.filter(stroke=>stroke.color==='#d9d8bf').length,2);
  const hidden=recorder();drawFacility(hidden.c,'metroLine',0,{showMetro:false});
  assert.equal(hidden.fills.length+hidden.strokes.length,0);
});

test('new campuses, terrain and discoveries render finite geometry with balanced transforms',()=>{
  const r=recorder();
  for(const type of ['largeFactory','grandStation'])for(const rotation of [0,1]){
    const options={width:rotation?4:6,height:rotation?6:4,rotation,staticPass:true};
    drawFacility(r.c,type,0,options);drawFacilityAnimation(r.c,type,1000,options);
  }
  for(const type of ['grass','forest','mountain','water','sand','wetland'])for(const seed of [0,42,20261015])drawTerrain(r.c,3,-8,type,seed,1000,(x,y)=>x%2?'water':'sand');
  for(const kind of ['cat','duck','fireflies'])drawEasterEgg(r.c,kind,1000);
  assert.ok(r.texts.includes('FOCU CENTRAL'));
  assert.ok(r.texts.includes('FOCU WORKS'));
  assert.ok(r.ellipses.length>=20,'tank roofs and smoke have dedicated curved geometry');
  assert.equal(r.depth,0);
});
