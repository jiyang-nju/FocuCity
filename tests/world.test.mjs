import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainAt, createWorld } from '../dist/world.js';

test('revisiting a saved world preserves terrain, including distant and negative coordinates', () => {
  const coordinates = [[0, 0], [-7, 15], [23, -19], [-200, -401], [1000000, -900000], [9999999, 9999999]];
  for (const seed of [0, 42, 20261012, 0xffffffff, 'my little city']) {
    const before = coordinates.map(([x, y]) => terrainAt(x, y, seed));
    // Explore another world before returning; generation must not depend on visit order.
    coordinates.slice().reverse().forEach(([x, y]) => terrainAt(x, y, 'other city'));
    assert.deepEqual(coordinates.map(([x, y]) => terrainAt(x, y, seed)), before);
    assert.ok(before.every(type => ['grass', 'forest', 'water', 'mountain'].includes(type)));
  }
});

test('every seed gives a useful buildable clearing at the starting location', () => {
  for (const seed of [0, 1, 42, 20261012, 0xffffffff]) {
    for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) {
      assert.equal(terrainAt(x, y, seed), 'grass');
    }
  }
});

test('exploration finds forests, mountains and shoreline sites suitable for a future harbor', () => {
  const found = new Set();
  let shoreline = 0;
  for (let x = -40; x <= 40; x++) for (let y = -40; y <= 40; y++) {
    const terrain = terrainAt(x, y, 20261012);
    found.add(terrain);
    if (['grass', 'forest'].includes(terrain) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => terrainAt(x + dx, y + dy, 20261012) === 'water')) shoreline++;
  }
  assert.deepEqual([...found].sort(), ['forest', 'grass', 'mountain', 'water']);
  assert.ok(shoreline > 0, 'a generated river must have buildable banks');
});

test('different world seeds produce different places beyond the shared starting clearing', () => {
  const snapshots = [42, 810, 20261012].map(seed => {
    const tiles = [];
    for (let x = -30; x <= 30; x += 3) for (let y = -30; y <= 30; y += 3) tiles.push(terrainAt(x, y, seed));
    return tiles.join(',');
  });
  assert.equal(new Set(snapshots).size, snapshots.length);
});

test('keyboard exploration pans to the selected cell and invokes the same tile callback as construction', () => {
  const prior = new Map(['window', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const listeners = new Map(), hovered = [], clicked = [];
  let observerDisconnected = false;
  const state = { seed: 42, buildings: { '1,0': { type: 'cottage' } } };
  const canvas = {
    style: {}, getContext: () => ({}), getBoundingClientRect: () => ({ width: 900, height: 620 }),
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1 } });
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class { observe() {} disconnect() { observerDisconnected = true; } } });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: () => 1 });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: () => {} });
  let world;
  try {
    world = createWorld(canvas, { getState: () => state, onHover: tile => hovered.push(tile), onTileClick: tile => clicked.push(tile) });
    const key = value => listeners.get('keydown')({ key: value, preventDefault() {} });
    key('ArrowRight'); key('Enter');
    assert.deepEqual(clicked[0], { x: 1, y: 0, terrain: 'grass', building: { type: 'cottage' } });
    for (let i = 0; i < 60; i++) key('ArrowRight');
    assert.ok(world.getView().x < 0, 'camera follows a cursor moving outside the viewport');
    assert.ok(world.getView().y < 0);
    key('Enter');
    assert.equal(clicked.at(-1).x, 61);
    assert.equal(clicked.at(-1).terrain, terrainAt(61, 0, state.seed));
    key('Escape');
    assert.equal(hovered.at(-1), null);
    key('Enter');
    assert.equal(clicked.at(-1).x, 0, 'Escape resets the keyboard cursor to the city origin');
    world.destroy(); world = null;
    assert.equal(listeners.size, 0);
    assert.equal(observerDisconnected, true);
  } finally {
    world?.destroy();
    for (const [name, descriptor] of prior) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test('version two worlds provide varied rivers, lakes, shores and biomes while preserving old terrain', () => {
  for(const seed of [0,42,20261012]){
    const counts=new Map();let distantWater=0;
    for(let x=-70;x<=70;x++)for(let y=-70;y<=70;y++){
      const type=terrainAt(x,y,seed,2);counts.set(type,(counts.get(type)||0)+1);
      if(type==='water'&&x<-20)distantWater++;
      assert.equal(terrainAt(x,y,seed),terrainAt(x,y,seed,1));
    }
    assert.deepEqual([...counts.keys()].sort(),['forest','grass','mountain','sand','water','wetland']);
    assert.ok(distantWater>100,'water extends to multiple regions beyond the original single river');
    for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++)assert.equal(terrainAt(x,y,seed,2),'grass');
    const coordinates=[[-900000,777777],[52,-83],[-5,14]];
    const before=coordinates.map(([x,y])=>terrainAt(x,y,seed,2));
    coordinates.reverse().forEach(([x,y])=>terrainAt(x,y,'different',2));
    assert.deepEqual(coordinates.reverse().map(([x,y])=>terrainAt(x,y,seed,2)),before);
  }
});

test('quick demolition drags target one infrastructure layer and do not pan the map', () => {
  const prior=new Map(['window','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const listeners=new Map(),clicked=[];
  const state={seed:42,buildings:{'0,0':{type:'asphalt'},'rail:0,0':{type:'railway'},'rail:1,0':{type:'railway'}}};
  const canvas={style:{},getContext:()=>({}),getBoundingClientRect:()=>({width:900,height:620,left:0,top:0}),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),focus(){},setPointerCapture(){},hasPointerCapture:()=>false};
  for(const [name,value]of Object.entries({window:{devicePixelRatio:1},ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}}))Object.defineProperty(globalThis,name,{configurable:true,value});
  let world;
  try{
    world=createWorld(canvas,{getState:()=>state,onTileClick:info=>clicked.push(info)});world.setTool('demolish');world.setDemolitionLayer('rail');
    listeners.get('pointerdown')({button:0,pointerId:1,clientX:450,clientY:310});
    listeners.get('pointermove')({clientX:480.4,clientY:325.2});
    listeners.get('pointermove')({clientX:480.4,clientY:325.2});
    listeners.get('pointermove')({clientX:510.8,clientY:340.4});
    listeners.get('pointerup')({pointerId:1,clientX:510.8,clientY:340.4});
    assert.deepEqual(clicked.map(p=>[p.x,p.y,p.building.type]),[[0,0,'railway'],[1,0,'railway']]);
    assert.equal(world.getView().x,0);assert.equal(world.getView().y,0);
    world.setZoom(.01);assert.equal(world.getView().zoom,.18);
  }finally{world?.destroy();for(const[name,value]of prior)if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}
});
