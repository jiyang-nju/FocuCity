import test from 'node:test';
import assert from 'node:assert/strict';
import {bindDragScroll,saveJsonToChosenFile} from '../dist/ui-tools.js';

test('dragging facility cards scrolls directly and suppresses selection, while a click still selects',()=>{
  const events=new Map(),element={scrollLeft:100,scrollWidth:1200,clientWidth:400,classList:{add(){},remove(){}},setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(){},addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:key=>events.delete(key)};
  const unbind=bindDragScroll(element);let stopped=false;
  const event=(x,y=30)=>({pointerId:1,button:0,pointerType:'mouse',clientX:x,clientY:y,preventDefault(){},stopImmediatePropagation(){stopped=true;}});
  events.get('pointerdown')(event(100));events.get('pointermove')(event(30));events.get('pointerup')(event(30));events.get('click')(event(30));
  assert.equal(element.scrollLeft,170);assert.equal(stopped,true);
  stopped=false;events.get('pointerdown')(event(100));events.get('pointerup')(event(100));events.get('click')(event(100));assert.equal(stopped,false);
  events.get('wheel')({deltaX:0,deltaY:25,deltaMode:0,preventDefault(){}});assert.equal(element.scrollLeft,195);
  unbind();assert.equal(events.size,0);
});

test('save picker writes only to the chosen file and closes it; cancellation does not download',async()=>{
  let written='',closed=false,options;
  const result=await saveJsonToChosenFile({points:42},'city.json',async value=>{options=value;return {name:'my-city.json',createWritable:async()=>({write:async value=>{written=value;},close:async()=>{closed=true;}})};});
  assert.equal(result.ok,true);assert.equal(result.name,'my-city.json');assert.equal(options.suggestedName,'city.json');assert.equal(JSON.parse(written).points,42);assert.equal(closed,true);
  assert.equal((await saveJsonToChosenFile({},'a.json',async()=>{throw Object.assign(new Error(),{name:'AbortError'});})).cancelled,true);
  assert.equal((await saveJsonToChosenFile({},'a.json',null)).unsupported,true);
});

test('failed save aborts the stream and never reports success',async()=>{
  let aborted=false;
  const result=await saveJsonToChosenFile({},'a.json',async()=>({createWritable:async()=>({write:async()=>{throw new Error('disk full');},abort:async()=>{aborted=true;}})}));
  assert.equal(result.ok,false);assert.equal(aborted,true);assert.equal(result.error,'disk full');
});
