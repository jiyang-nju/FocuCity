// Keep dragging a card from accidentally selecting it when the pointer is released.
export function bindDragScroll(element) {
  let gesture=null,suppressClick=false;
  const down=event=>{
    if(event.button!==0||event.pointerType==='touch')return;
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,left:element.scrollLeft,moved:false};
    suppressClick=false;
  };
  const move=event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(!gesture.moved&&Math.abs(dx)>6&&Math.abs(dx)>Math.abs(dy)){
      gesture.moved=true;element.setPointerCapture?.(event.pointerId);element.classList.add('dragging');
    }
    if(gesture.moved){event.preventDefault();element.scrollLeft=gesture.left-dx;}
  };
  const up=event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    suppressClick=gesture.moved;
    if(element.hasPointerCapture?.(event.pointerId))element.releasePointerCapture(event.pointerId);
    gesture=null;element.classList.remove('dragging');
  };
  const click=event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}};
  const wheel=event=>{
    if(element.scrollWidth<=element.clientWidth||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
    const before=element.scrollLeft;
    element.scrollLeft+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?element.clientWidth:1);
    if(element.scrollLeft!==before)event.preventDefault();
  };
  element.addEventListener('pointerdown',down);
  element.addEventListener('pointermove',move);
  element.addEventListener('pointerup',up);
  element.addEventListener('pointercancel',up);
  element.addEventListener('click',click,true);
  element.addEventListener('wheel',wheel,{passive:false});
  return ()=>{
    element.removeEventListener('pointerdown',down);element.removeEventListener('pointermove',move);
    element.removeEventListener('pointerup',up);element.removeEventListener('pointercancel',up);
    element.removeEventListener('click',click,true);element.removeEventListener('wheel',wheel);
  };
}

export async function saveJsonToChosenFile(data,filename,picker=globalThis.showSaveFilePicker?.bind(globalThis)){
  if(!picker)return {ok:false,unsupported:true};
  try{
    const handle=await picker({suggestedName:filename,types:[{description:'FocuCity 城市存档',accept:{'application/json':['.json']}}]});
    const stream=await handle.createWritable();
    try{await stream.write(JSON.stringify(data,null,2));await stream.close();}
    catch(error){await stream.abort?.().catch(()=>{});throw error;}
    return {ok:true,name:handle.name||filename};
  }catch(error){return {ok:false,cancelled:error?.name==='AbortError',error:error?.message||'保存失败'};}
}
