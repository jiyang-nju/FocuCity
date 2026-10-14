import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../dist/world.js';
import { CATALOG } from '../dist/model.js';
import { drawFacility, drawFacilityAnimation, drawVehicle } from '../dist/visuals.js';

function drawingContext() {
  let depth=0,calls=0;
  const context={globalAlpha:1};
  for(const name of ['beginPath','moveTo','lineTo','closePath','fill','stroke','fillRect','clearRect','ellipse','translate','scale','rotate','transform','setTransform','setLineDash','drawImage','fillText'])context[name]=(...args)=>{
    calls++;
    for(const arg of args)if(typeof arg==='number')assert.ok(Number.isFinite(arg),`${name} received an invalid coordinate`);
    if(name==='ellipse')assert.ok(args[2]>=0&&args[3]>=0);
  };
  context.save=()=>{depth++;};context.restore=()=>{assert.ok(depth>0);depth--;};
  return {context,get calls(){return calls;},get depth(){return depth;}};
}

test('all facilities and vehicle styles draw finite geometry with balanced transforms',()=>{
  const drawing=drawingContext(),{context}=drawing;
  for(const item of CATALOG)for(const rotation of [0,1]){
    const options={width:rotation?item.height:item.width,height:rotation?item.width:item.height,rotation,staticPass:true};
    drawFacility(context,item.id,0,options);drawFacilityAnimation(context,item.id,1000,options);
  }
  for(const [kind,styles]of Object.entries({car:['car','taxi','bus','coach','van'],boat:['sailboat','ferry','cargo','liner'],train:['train'],metro:['metro'],plane:['plane']}))for(const style of styles)for(const direction of [0,Math.PI/2,Math.PI,-Math.PI/2])drawVehicle(context,kind,0,0,direction,2,1000,style);
  assert.equal(drawing.depth,0,'all drawing routines restore their transforms');
});

test('animated traffic reuses static terrain and buildings; edits and camera changes invalidate only needed work',()=>{
  const saved=new Map(['window','ResizeObserver'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const contexts=[],layers=[],listeners=new Map(),jobs=new Map();let id=0,time=0;
  const createCanvas=()=>{const drawing=drawingContext();contexts.push(drawing);const layer={width:0,height:0,getContext:()=>drawing.context};layers.push(layer);return layer;};
  const canvas={...createCanvas(),style:{},getBoundingClientRect:()=>({width:900,height:620}),addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k)};
  const state={seed:42,points:500,settings:{performanceMode:'balanced'},buildings:Object.fromEntries(Array.from({length:20},(_,i)=>[`${i-8},0`,{type:'asphalt',width:1,height:1}]))};
  const schedule=(fn)=>{jobs.set(++id,fn);return id;};
  const loopOptions={now:()=>time,requestFrame:schedule,cancelFrame:id=>jobs.delete(id),setTimer:schedule,clearTimer:id=>jobs.delete(id)};
  const step=()=>{time+=40;const pending=[...jobs.values()];jobs.clear();for(const fn of pending)fn(time);};
  Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:2}});
  Object.defineProperty(globalThis,'ResizeObserver',{configurable:true,value:class{observe(){}disconnect(){}}});
  let world;
  try{
    world=createWorld(canvas,{getState:()=>state,createCanvas,loopOptions});
    assert.equal(jobs.size,0,'home does not start a drawing loop');
    world.setActive(true);for(let i=0;i<60;i++)step();
    assert.ok(world.getRenderStats().frames>=20);
    assert.equal(world.getRenderStats().sceneBuilds,1);
    assert.equal(world.getRenderStats().networkBuilds,1);
    assert.equal(canvas.width,1350,'balanced caps Retina scaling at 1.5');
    const firstSceneCalls=contexts[1].calls;
    for(let i=0;i<30;i++)step();assert.equal(contexts[1].calls,firstSceneCalls,'animation never redraws static primitives');
    world.zoomBy(.1);for(let i=0;i<3;i++)step();
    assert.equal(world.getRenderStats().sceneBuilds,2);assert.equal(world.getRenderStats().networkBuilds,1);
    state.points+=10;world.invalidateOverlay();for(let i=0;i<3;i++)step();
    assert.equal(world.getRenderStats().sceneBuilds,2);assert.equal(world.getRenderStats().networkBuilds,1);
    state.buildings['0,4']={type:'convenienceStore',width:1,height:1};world.invalidateCity();for(let i=0;i<3;i++)step();
    assert.equal(world.getRenderStats().sceneBuilds,3);assert.equal(world.getRenderStats().networkBuilds,2);
    world.getTrafficSummary();world.getTrafficSummary();assert.equal(world.getRenderStats().networkBuilds,2,'reading route counts must not replan');
    world.setPerformanceMode('eco');for(let i=0;i<3;i++)step();
    assert.equal(canvas.width,900);assert.equal(world.getRenderStats().fpsLimit,20);
    world.setActive(false);const paused=world.getRenderStats().frames;for(let i=0;i<10;i++)step();
    assert.equal(jobs.size,0);assert.equal(world.getRenderStats().frames,paused);
    state.buildings={'0,0':{type:'cottage'}};world.setActive(true);for(let i=0;i<3;i++)step();
    assert.equal(world.getTrafficSummary().cars,0,'replaced/imported buildings invalidate old routes');
    world.destroy();assert.equal(jobs.size,0);assert.equal(listeners.size,0);
    assert.ok(contexts.every(ctx=>ctx.depth===0));
  }finally{world?.destroy();for(const[k,v]of saved)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}
});
