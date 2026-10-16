import { CATALOG, LEVELS, STORAGE_KEY, createInitialState, loadState, saveState, validateSave, cityStats, todayStats, weekStats, startFocus, pauseFocus, resumeFocus, cancelFocus, completeFocus, getRemaining, buildAt, demolishAt, getBuildingAt, getBuildingsAt, canUpgradeBuilding, upgradeBuilding, localDateKey, planLinearBuild, buildLinear, levelReward, collectProgressRewards, getAchievementProgress, SECRETS, discoverSecret } from './model.js';
import { createWorld, terrainAt, drawBuildingIcon } from './world.js';
import { createSoundscape } from './audio.js';
import { getCheckinStatus, claimCheckin } from './checkins.js';
import { RENDER_MODES } from './render-loop.js';
import { bindDragScroll, saveJsonToChosenFile } from './ui-tools.js';

const $ = id => document.getElementById(id);
const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let state = loadState();
let chosenMinutes = state.focus ? state.focus.duration / 60 : 25;
let customDurationOpen = ![25,45,60].includes(chosenMinutes);
let category = '全部', selectedTool = null, modalType = null, musicMode = 'forest', volume = .35;
let introDismissed = false, saveErrorShown = false;
let currentView = 'home', rotation = 0, catalogCategory = '全部', catalogQuery = '', catalogUnlocked = false;
let lastClockStamp = '';
let buildingListStamp = '';
let batchMode=false,batchStart=null,lastBatchEnd='',rewardHistory=[];
const LINEAR_TOOLS=new Set(['road','asphalt','bridge','tunnel','railway','railBridge','metroLine']);
const BACKUP_KEY='FocuCity-previous-town';
const views = new Set(['home','town','stats','catalog','checkin','levels','achievements','settings','help']);
const sound = createSoundscape();
sound.setVolume(volume);
const world = createWorld($('worldCanvas'), { getState: () => state, onTileClick: handleTile, onHover: handleHover });
const currentTerrain=(x,y)=>terrainAt(x,y,state.seed,state.terrainVersion);

function toast(message, error = false) {
  const item = document.createElement('div');
  item.className = 'toast' + (error ? ' error' : '');
  item.textContent = message;
  $('toasts').appendChild(item);
  setTimeout(() => item.remove(), 4200);
}
function announceRewards(events){
  const index=rewardHistory.push(events)-1,total=events.reduce((sum,e)=>sum+e.points,0);
  const item=document.createElement('div');item.className='toast reward-notice';
  item.innerHTML=`<strong>${events.map(e=>esc(e.title)).join(' · ')}</strong><span>奖励 +${total} 专注点${events.some(e=>e.kind==='level')?' · 新设施已解锁':''}</span><button data-action="reward-details" data-reward-index="${index}">查看新内容与用途 →</button>`;
  $('toasts').appendChild(item);setTimeout(()=>item.remove(),14000);
}
function openRewardDetails(index){
  const events=rewardHistory[index];if(!events)return;
  openModal('progress',`<div class="modal-eyebrow">YOUR EFFORT, YOUR MILESTONES</div><h2>小城又向前了一步</h2>${events.map(e=>`<section class="progress-event"><h3>${esc(e.title)} <span>+${e.points} 点</span></h3><p>${esc(e.description)}</p>${e.unlocks?.length?`<div class="unlock-list">${e.unlocks.map(item=>`<article><strong>${esc(item.name)} <small>${item.width} × ${item.height} 格</small></strong><p>${esc(item.description)}</p></article>`).join('')}</div>`:''}</section>`).join('')}<button class="primary-button" data-action="close">收下这份成长</button>`);
}
function revealSecret(id,point){
  const result=discoverSecret(state,id);if(!result.ok)return false;
  if(!persist())return false;
  if(result.event)announceRewards([result.event]);world.showEasterEgg?.(({forest:'cat',shore:'duck',evening:'fireflies',explorer:'cat'})[id],point);render();return true;
}
function clearBatch(){batchStart=null;lastBatchEnd='';world.setPreviewCells?.([],true);}
function lineEnd(tile){
  if(!batchStart)return tile;
  return Math.abs(tile.x-batchStart.x)>=Math.abs(tile.y-batchStart.y)?{x:tile.x,y:batchStart.y}:{x:batchStart.x,y:tile.y};
}
function handleHover(tile){
  setText('zoomLabel',Math.round(world.getView().zoom*100)+'%');
  if(!batchMode||!batchStart||!tile||!LINEAR_TOOLS.has(selectedTool))return;
  const end=lineEnd(tile),key=`${end.x},${end.y}`;if(key===lastBatchEnd)return;lastBatchEnd=key;
  const plan=planLinearBuild(state,selectedTool,batchStart,end,currentTerrain,rotation);
  const distance=Math.abs(end.x-batchStart.x)+Math.abs(end.y-batchStart.y),dx=Math.sign(end.x-batchStart.x),dy=Math.sign(end.y-batchStart.y);
  const preview=plan.ok?plan.cells:Array.from({length:Math.min(200,distance+1)},(_,i)=>({x:batchStart.x+dx*i,y:batchStart.y+dy*i}));
  world.setPreviewCells?.(preview,plan.ok);
  setText('placementStatus',plan.ok?`起点 ${batchStart.x},${batchStart.y} → 终点 ${end.x},${end.y} · ${plan.count} 格 · ${plan.cost} 点 · 点击确认`:`${plan.message} · 点击另一个终点，Esc 取消`);
}
function persist() {
  const rewards=collectProgressRewards(state);
  const result = saveState(state);
  if (result.conflict) {
    syncDurationFromState(true);
    closeModal();
    render();
    $('autosaveLabel').innerHTML = '已同步另一标签页的进度 <i></i>';
    saveErrorShown = false;
    toast(result.message, true);
    return false;
  }
  if (!result.ok) {
    $('autosaveLabel').textContent = '保存失败，请导出存档备份';
    if (!saveErrorShown) toast(result.message, true);
    saveErrorShown = true;
  } else {
    $('autosaveLabel').innerHTML = '进度自动保存在此浏览器 <i></i>';
    saveErrorShown = false;
  }
  // A storage outage keeps the current in-memory progress usable. A conflict
  // instead restores another tab's saved state and must stop success feedback.
  if(rewards.length)announceRewards(rewards);
  return true;
}
function syncDurationFromState(resetIdle = false) {
  if (state.focus) chosenMinutes = state.focus.duration / 60;
  else if (resetIdle) chosenMinutes = 25;
  customDurationOpen = ![25,45,60].includes(chosenMinutes);
}
function renderDuration() {
  if (state.focus) chosenMinutes = state.focus.duration / 60;
  const customSelected = state.focus ? ![25,45,60].includes(chosenMinutes) : customDurationOpen;
  document.querySelectorAll('[data-minutes]').forEach(button => button.classList.toggle('selected', !customSelected && Number(button.dataset.minutes) === chosenMinutes));
  $('customDuration').classList.toggle('selected', customSelected);
  $('customDurationRow').hidden = !customSelected;
  $('minutesInput').value = chosenMinutes;
}
function setText(id, text) { const node=$(id),value=String(text);if(node.textContent!==value)node.textContent=value; }
function formatTime(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`; }
function fillBuildingIcons(root = document) { root.querySelectorAll('canvas[data-building]').forEach(canvas => drawBuildingIcon(canvas, canvas.dataset.building)); }
function render() {
  world.syncState();
  world.setPerformanceMode(state.settings.performanceMode);
  world.invalidateOverlay();
  const stats = cityStats(state), today = todayStats(state);
  setText('points', state.points.toLocaleString());
  setText('cityName', state.cityName);
  setText('cityLevel', `Lv.${stats.level} · ${stats.title}`);
  setText('levelNumber', stats.level);
  setText('levelTitle', stats.title);
  setText('levelProgressLabel', stats.maxLevel ? '万家灯火，皆是时光' : '下一站 · ' + LEVELS[stats.level].title);
  $('levelProgress').style.width = stats.progress * 100 + '%';
  $('population').innerHTML = stats.population.toLocaleString() + '<small> 人</small>';
  setText('gdp', stats.gdp.toLocaleString());
  $('buildingCount').innerHTML = stats.buildingCount + '<small> 座</small>';
  setText('todayMinutes', today.minutes);
  setText('todayCount', today.count);
  $('mapIntro').hidden = introDismissed || !!selectedTool || stats.buildingCount > 0;
  if (state.focus) $('taskInput').value = state.focus.task;
  $('taskInput').disabled = !!state.focus;
  $('minutesInput').disabled = !!state.focus;
  document.querySelectorAll('[data-minutes],#customDuration').forEach(b => b.disabled = !!state.focus);
  renderDuration();
  renderBuildings(); updateClock();
  if (['stats','catalog','checkin','levels','achievements'].includes(currentView)) pageRenderers[currentView]();
}
function renderBuildings() {
  const level = cityStats(state).level;
  const query = $('buildSearch').value.trim();
  const stamp=JSON.stringify([level,query,category,$('buildUnlocked').checked,selectedTool]);
  if(stamp===buildingListStamp)return;
  buildingListStamp=stamp;
  const items = CATALOG.filter(item => (category === '全部' || item.category === category) && (!query || item.name.includes(query)) && (!$('buildUnlocked').checked || item.level <= level));
  $('buildingList').innerHTML = items.map(item => {
    const locked = item.level > level;
    return `<button class="building-card ${locked?'locked':''} ${selectedTool === item.id?'selected':''}" data-build="${item.id}" aria-pressed="${selectedTool === item.id}" aria-label="${item.name}，${locked?`等级 ${item.level} 解锁`:`${item.cost} 专注点`}" title="${item.description} · 人口 +${item.population} · GDP +${item.gdp}">${locked?icon('lock','card-lock'):''}<canvas class="building-icon" data-building="${item.id}" aria-hidden="true"></canvas><span class="building-card-name">${item.name}</span><span class="building-size">${item.width} × ${item.height} 格 · T${item.tier || 1}</span><span class="building-card-cost">${icon(locked?'lock':'coin')}${locked?`Lv.${item.level} 解锁`:item.cost}</span></button>`;
  }).join('');
  if (!items.length) $('buildingList').innerHTML = '<p class="empty-state">没有符合条件的设施。</p>';
  fillBuildingIcons($('buildingList'));
}
function updateClock() {
  const focus = state.focus;
  const remaining = focus ? getRemaining(state) : chosenMinutes * 60;
  const clock = formatTime(remaining);
  const stamp=[clock,focus?.status,focus?.duration,chosenMinutes,currentView].join('|');
  if(stamp===lastClockStamp)return;
  lastClockStamp=stamp;
  $('timerDisplay').innerHTML = clock.replace(':', '<span>:</span>');
  $('ringProgress').style.strokeDashoffset = 666.02 * (1 - (focus ? remaining / focus.duration : 1));
  setText('rewardAmount', focus ? focus.duration / 60 : chosenMinutes);
  setText('focusStatus', focus ? focus.status === 'running' ? '正在生长' : '稍作休息' : '准备开始');
  $('focusStatus').classList.toggle('running', focus?.status === 'running');
  setText('timerCaption', focus ? focus.status === 'running' ? '此刻的你，正在让小镇生长' : '休息一下，随时可以继续' : '世界会等你，慢慢来');
  const buttonName = focus ? focus.status === 'running' ? '暂停专注' : '继续专注' : '开始专注';
  $('focusButton').innerHTML = icon(focus?.status === 'running' ? 'pause' : 'play') + `<span>${buttonName}</span>`;
  $('cancelFocus').hidden = !focus;
  if ($('spaceTimer')) {
    setText('spaceTimer', clock);
    setText('spaceTask', focus?.task || $('taskInput').value || '给自己一段安静时光');
    $('spaceStart').innerHTML = icon(focus?.status === 'running' ? 'pause' : 'play') + buttonName;
    setText('spaceStatus', focus ? focus.status === 'running' ? '小镇在远处，陪你一起生长。' : '你的进度会在这里等你。' : '准备好后，就从这一分钟开始。');
  }
  $('headerFocus').hidden = !focus || currentView === 'home';
  $('headerFocus').textContent = focus ? `${focus.status === 'paused' ? '已暂停' : '专注中'} · ${clock}` : '';
  document.title = focus ? `${clock} · ${focus.status === 'paused'?'已暂停':'专注中'} · FocuCity` : 'FocuCity';
}
function finishFocus(result) {
  if (!persist()) return;
  render();
  if (sound.active) sound.chime();
  openModal('reward', `<div class="reward-celebration"><div class="reward-leaf">${icon('leaf')}</div><div class="modal-eyebrow">A LITTLE TIME, A LITTLE GROWTH</div><h2>这段时光，开花了。</h2><p>你完成了「${esc(result.session.task)}」<br>把 ${result.minutes} 分钟的用心，留在这座小城。</p><div class="earned-points">+ ${result.points}</div><p>专注点已收入你的口袋</p><button class="primary-button" data-action="reward-close">去看看我的小镇 ${icon('arrow')}</button></div>`);
}
function checkCompletion() {
  const result = completeFocus(state);
  if (!result) return false;
  finishFocus(result);
  return true;
}
function focusAction() {
  if (checkCompletion()) return;
  if (!state.focus && customDurationOpen) {
    const value = Number($('minutesInput').value);
    if (!Number.isInteger(value) || value < 1 || value > 240) return toast('请输入 1–240 分钟的整数。', true);
    chosenMinutes = value;
  }
  const result = !state.focus ? startFocus(state, {task: $('taskInput').value, minutes: chosenMinutes}) : state.focus.status === 'running' ? pauseFocus(state) : resumeFocus(state);
  if (!result.ok) return toast(result.message,true);
  if (result.completed) return finishFocus(result.completed);
  if (!persist()) return;
  render();
}
function setBuildDock(open) {
  $('buildDock').hidden = !open;
  $('toggleBuild').setAttribute('aria-expanded', String(open));
  $('townPage').classList.toggle('dock-open', open);
}
function updateToolHint() {
  $('mapIntro').hidden=introDismissed||!!selectedTool||Object.keys(state.buildings).length>0;
  $('cityView').classList.toggle('demolition-active',selectedTool==='demolish');
  $('demolishButton').classList.toggle('active', selectedTool === 'demolish');
  $('quickDemolish').setAttribute('aria-pressed',String(selectedTool==='demolish'));
  $('demolitionLayerControl').hidden=selectedTool!=='demolish';
  $('batchPlacement').hidden=!LINEAR_TOOLS.has(selectedTool);
  $('batchPlacement').setAttribute('aria-pressed',String(batchMode));
  $('batchPlacement').textContent=batchMode?'批量直线 ✓':'批量直线';
  $('placementStatus').hidden = !selectedTool;
  $('placementActions').hidden = !selectedTool;
  $('rotatePlacement').hidden = !selectedTool || selectedTool === 'demolish';
  $('placementStatus').classList.toggle('danger', selectedTool === 'demolish');
  $('rotateBuilding').disabled = !selectedTool || selectedTool === 'demolish';
  if (selectedTool === 'demolish') {
    setText('placementStatus','快速拆除 · 点击或按住拖动拆除 · 全额返还 · Esc 退出');
    setText('buildHint','整座设施一并拆除；在右侧选择地面、铁路或地下层');
  } else if (selectedTool) {
    const item = CATALOG.find(x => x.id === selectedTool);
    const w = rotation ? item.height : item.width, h = rotation ? item.width : item.height;
    setText('placementStatus',batchMode&&LINEAR_TOOLS.has(item.id)?`${item.name} · 批量直线：先点起点，再点终点（最多 200 格）`:`${item.name} · ${w}×${h} 格 · ${item.cost} 点 · R 旋转 · Esc 退出`);
    setText('buildHint',`${item.name}：人口 +${item.population} · GDP +${item.gdp} · ${terrainLabel(item)}`);
  } else setText('buildHint','选择设施后点击地图；R 旋转，Esc 退出');
}
function terrainLabel(item) {
  return item.terrain === 'water' ? '建于水面' : item.terrain === 'mountain' ? '建于山地' : item.terrain === 'shore' ? '临水陆地' : item.terrain === 'underground' ? '地下线路' : '草地、林地、沙滩或湿地';
}
function selectTool(id) {
  if (id !== 'demolish' && id) {
    const item = CATALOG.find(x => x.id === id);
    if (!item) return;
    if (item.level > cityStats(state).level) return toast(`城市达到 Lv.${item.level} 后解锁${item.name}。`);
  }
  selectedTool = selectedTool === id ? null : id;
  clearBatch();
  world.setTool(selectedTool);
  world.setRotation?.(rotation);
  updateToolHint();
  if (selectedTool) setBuildDock(false);
  renderBuildings();
}
function rotateTool() {
  if (!selectedTool || selectedTool === 'demolish') return;
  rotation = rotation ? 0 : 1;clearBatch();
  world.setRotation?.(rotation); updateToolHint();setBuildDock(false);
}
function inspectBuilding(x,y,layer) {
  const found = getBuildingAt(state,x,y,layer);
  if (!found) return;
  const {building,definition:item} = found;
  const next = CATALOG.find(c => c.id === item.upgradeTo);
  const port=world.getPortStatus(found.key);
  const portInfo=port?`<div class="port-status ${port.status==='connected'?'connected':''}"><strong>${port.status==='connected'?'航线已开通':'港口通航状态'}</strong><p>${esc(port.reason)}</p>${port.connections.length?`<small>连接 ${port.connections.length} 座港口 · 船舶会沿水面往返</small>`:''}</div>`:'';
  const eligibility = next ? canUpgradeBuilding(state,found.x,found.y,currentTerrain,found.layer) : null;
  openModal('inspect', `<div class="modal-eyebrow">A PIECE OF YOUR TOWN</div><div class="inspect-header"><canvas class="building-icon" data-building="${item.id}"></canvas><div><h2>${item.name}</h2><p class="modal-subtitle">${building.width || 1} × ${building.height || 1} 格 · T${item.tier || 1} · 坐标 ${found.x}, ${found.y}</p></div></div><p class="modal-subtitle">${item.description}</p>${portInfo}${getBuildingsAt(state,x,y).length>1?`<div class="layer-inspect">此处多层设施：${getBuildingsAt(state,x,y).map(entry=>`<button class="secondary-button" data-action="inspect-layer" data-x="${x}" data-y="${y}" data-layer="${entry.layer}">${entry.definition.name}</button>`).join('')}</div>`:''}<div class="stats-grid"><div class="stat-box"><span>提供人口</span><strong>${item.population}</strong></div><div class="stat-box"><span>城市 GDP</span><strong>${item.gdp}</strong></div><div class="stat-box"><span>投入点数</span><strong>${building.paid ?? item.cost}</strong></div></div>${next ? `<div class="upgrade-card"><div><span class="eyebrow">下一阶段 · T${next.tier || 2}</span><h3>${next.name}</h3><p>Lv.${next.level} · 占地 ${building.rotation?next.height:next.width} × ${building.rotation?next.width:next.height} 格 · 需补 ${Math.max(0,next.cost-(building.paid??item.cost))} 点</p><p>${eligibility.ok?'已满足升级条件，扩建将占用周围空地。':esc(eligibility.message)}</p></div><button class="primary-button" data-action="upgrade-building" data-x="${found.x}" data-y="${found.y}" data-layer="${found.layer}" ${eligibility.ok?'':'disabled'}>扩建升级</button></div>` : '<p class="inline-note">此设施已是该系列的最高阶段。</p>'}<div class="modal-actions"><button class="secondary-button" data-action="close">继续逛逛</button><button class="secondary-button" data-action="remove-building" data-x="${found.x}" data-y="${found.y}" data-layer="${found.layer}">拆除 · 返还 ${building.paid??item.cost} 点</button></div>`);
}
function handleTile(tile) {
  if (!tile) return;
  const {x,y,terrain} = tile;
  if (selectedTool === 'demolish') {
    const layer=$('demolitionLayer').value;
    if(!getBuildingAt(state,x,y,layer))return;
    const result = demolishAt(state,x,y,layer);
    if (result.ok) { world.invalidateCity();if (!persist()) return; render(); }
    toast(result.message,!result.ok); return;
  }
  if (selectedTool) {
    if(batchMode&&LINEAR_TOOLS.has(selectedTool)&&!batchStart){batchStart={x,y};lastBatchEnd='';handleHover(tile);return;}
    const result = batchMode&&batchStart&&LINEAR_TOOLS.has(selectedTool)?buildLinear(state,selectedTool,batchStart,lineEnd(tile),currentTerrain,rotation):buildAt(state,selectedTool,x,y,currentTerrain,rotation);
    if (result.ok) {clearBatch();world.invalidateCity();if (!persist()) return;render();updateToolHint();}
    toast(result.message,!result.ok); return;
  }
  if(Math.max(Math.abs(x),Math.abs(y))>=80)revealSecret('explorer',{x,y});
  const layer=$('metroLayer').getAttribute('aria-pressed')==='true'&&getBuildingAt(state,x,y,'underground')?'underground':undefined;
  if (getBuildingAt(state,x,y,layer)) inspectBuilding(x,y,layer);
  else {
    const secret=terrain==='forest'?'forest':['water','river','lake','ocean'].includes(terrain)?'shore':null;
    if(secret&&revealSecret(secret,{x,y}))return;
    toast(`${x}, ${y} · ${{grass:'草地',forest:'林地',water:'水域',river:'河流',lake:'湖泊',ocean:'海湾',mountain:'山地',sand:'沙滩',wetland:'湿地',meadow:'花原'}[terrain] || terrain}`);
  }
}
function applyView(view) {
  currentView = view;
  $('homePage').hidden = view !== 'home';
  $('townPage').hidden = view !== 'town';
  $('modulePage').hidden = ['home','town'].includes(view);
  document.body.dataset.view = view;
  document.querySelectorAll('[data-nav]').forEach(b => {b.classList.toggle('active',b.dataset.nav===view); b.setAttribute('aria-current',b.dataset.nav===view?'page':'false');});
  world.setActive?.(view === 'town' && !document.hidden && !$('modal').open);
  updateClock();
}
function showModule(view,content) {
  applyView(view);
  $('pageContent').innerHTML = content;
  $('modulePage').setAttribute('aria-label',({stats:'时光记录',catalog:'城市图鉴',checkin:'每日签到',levels:'城市成长',achievements:'城市成就',help:'小镇指南',settings:'小镇设置'})[view]);
  fillBuildingIcons($('pageContent'));
}
function navigate(view,writeHash=true) {
  if (!views.has(view)) view='home';
  if(view!=='town')clearBatch();
  closeModal();
  if (writeHash && location.hash !== '#'+view) history.pushState(null,'','#'+view);
  applyView(view);
  pageRenderers[view]?.();
  window.scrollTo({top:0,behavior:'instant'});
}
function openModal(type, content) {
  modalType = type;
  world.setActive(false);
  $('modalContent').innerHTML = content;
  if (!$('modal').open) $('modal').showModal();
  fillBuildingIcons($('modalContent'));

}
function closeModal() {
  $('modal').close(); modalType = null;
  world.setActive(currentView==='town'&&!document.hidden);

}
function openStats() {
  const today = todayStats(state), week = weekStats(state), max = Math.max(30,...week.map(d => d.minutes));
  const totalMinutes = state.sessions.reduce((sum,s) => sum+s.minutes,0);
  showModule('stats', `<div class="modal-eyebrow">LITTLE MOMENTS, LASTING GROWTH</div><h2>时光有迹可循</h2><p class="modal-subtitle">那些认真度过的分钟，都在这里悄悄发光。</p><div class="stats-grid"><div class="stat-box"><span>今日专注</span><strong>${today.minutes}<small>分钟</small></strong></div><div class="stat-box"><span>今日完成</span><strong>${today.count}<small>个目标</small></strong></div><div class="stat-box"><span>累计专注</span><strong>${totalMinutes}<small>分钟</small></strong></div></div><h3>最近七天 <span style="float:right;color:#a1ac90;font-size:10px">共 ${week.reduce((s,d)=>s+d.minutes,0)} 分钟</span></h3><div class="week-chart" role="img" aria-label="最近七日专注时长：${week.map(d=>`${d.label} ${d.minutes}分钟`).join('，')}">${week.map(d=>`<div class="bar-group ${d.today?'today':''}"><span class="bar-value">${d.minutes}</span><div class="bar" style="height:${Math.max(2,d.minutes/max*115)}px"></div><span class="bar-label">${d.today?'今天':d.label}</span></div>`).join('')}</div><h3>专注足迹 <span style="float:right;color:#a1ac90;font-size:10px">最近 50 次</span></h3>${state.sessions.length?`<div class="session-list">${[...state.sessions].sort((a,b)=>b.completedAt-a.completedAt).slice(0,50).map(s=>`<div class="session-row"><div><strong>${esc(s.task)}</strong><small>${new Date(s.completedAt).toLocaleString('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small></div><span>${s.minutes} 分钟 · +${s.points} 点</span></div>`).join('')}</div>`:'<div class="empty-state">你的第一段专注时光，还在等待开始。<br>不必很多，认真度过一分钟也很好。</div>'}`);
}
function catalogCards() {
  const level = cityStats(state).level;
  const items = CATALOG.filter(item => (catalogCategory==='全部'||item.category===catalogCategory) && (!catalogQuery||item.name.includes(catalogQuery)) && (!catalogUnlocked||item.level<=level));
  return items.map(item=>`<article class="catalog-item ${item.level>level?'locked':''}"><span class="catalog-tag">${item.category} · T${item.tier || 1}</span><canvas class="building-icon" data-building="${item.id}" aria-hidden="true"></canvas><h3>${item.name}</h3><p>${item.description}</p><small>${item.width} × ${item.height} 格 · ${terrainLabel(item)}</small><small>人口 +${item.population} · GDP +${item.gdp}</small><footer><span>${item.cost} 专注点</span><small>Lv.${item.level} ${item.level>level?'解锁':'已解锁'}</small></footer><button data-catalog-build="${item.id}">${item.level>level?'查看成长目标':'前往小镇建造 →'}</button></article>`).join('') || '<div class="empty-state">没有符合条件的设施。</div>';
}
function updateCatalogCards() { $('catalogGrid').innerHTML=catalogCards(); fillBuildingIcons($('catalogGrid')); }
function openCatalog() {
  const level = cityStats(state).level;
  showModule('catalog', `<div class="modal-eyebrow">YOUR TOWN, YOUR POSSIBILITIES</div><h2>小城的无限可能</h2><p class="modal-subtitle">${CATALOG.length} 种设施，从一间小屋到辽阔机场。Lv.${level} · ${CATALOG.filter(x=>x.level<=level).length} 种已解锁</p><div class="catalog-controls"><input type="search" id="catalogSearch" placeholder="搜索学校、港口、铁路…" value="${esc(catalogQuery)}" aria-label="搜索图鉴"><label><input type="checkbox" id="catalogUnlocked" ${catalogUnlocked?'checked':''}> 只看已解锁</label></div><div class="category-tabs catalog-tabs">${['全部','居住','商业','交通','公共','生产','景观'].map(c=>`<button data-catalog-category="${c}" class="${catalogCategory===c?'active':''}">${c}</button>`).join('')}</div><div class="catalog-grid" id="catalogGrid">${catalogCards()}</div>`);
}
function openLevels() {
  const stats=cityStats(state);
  showModule('levels',`<div class="modal-eyebrow">ONE STEP AT A TIME</div><h2>让小镇，慢慢长大</h2><p class="modal-subtitle">人口或 GDP 达到任意一项条件即可升级。每次突破自动发放专注点，并解锁新的生活设施。旧存档已达到的等级不重复补发奖励。</p><div class="stats-grid"><div class="stat-box"><span>当前等级</span><strong>${stats.level}</strong></div><div class="stat-box"><span>小镇人口</span><strong>${stats.population}</strong></div><div class="stat-box"><span>城市 GDP</span><strong>${stats.gdp}</strong></div></div>${LEVELS.map(l=>`<div class="milestone"><span class="level-medallion">${l.level}</span><div><h3>${l.title}</h3><p>${l.level===1?'一片土地，一个全新的开始':`人口 ${l.population} 人 / GDP ${l.gdp}，满足一项`}</p>${l.level>1?`<span class="growth-reward">等级奖励 +${levelReward(l.level)} 专注点 · ${state.progress.claimedLevels.includes(l.level)?'已结算':'突破时自动领取'}</span>`:''}<details class="level-unlocks"><summary>${CATALOG.filter(x=>x.level===l.level).length} 项解锁设施与用途</summary><div class="unlock-list">${CATALOG.filter(x=>x.level===l.level).map(x=>`<article><strong>${x.name} <small>${x.width} × ${x.height} 格</small></strong><p>${x.description}</p></article>`).join('')}</div></details></div>${l.level<=stats.level?'<span class="achieved">已抵达 ✓</span>':''}</div>`).join('')}`);
}
function openAchievements(){
  const items=getAchievementProgress(state),claimed=items.filter(item=>item.claimed);
  showModule('achievements',`<div class="modal-eyebrow">LITTLE EFFORTS, LASTING MOMENTS</div><h2>把每一步，变成纪念</h2><p class="modal-subtitle">完成条件后自动领取专注点，每项成就只奖励一次。已经获得的勋章不会因为拆除而失去。</p><div class="stats-grid"><div class="stat-box"><span>已获成就</span><strong>${claimed.length}<small> / ${items.length}</small></strong></div><div class="stat-box"><span>成就奖励</span><strong>${claimed.reduce((n,item)=>n+item.points,0)}<small> 点</small></strong></div><div class="stat-box"><span>发现彩蛋</span><strong>${state.progress.secrets.length}<small> / ${SECRETS.length}</small></strong></div></div><div class="achievement-grid">${items.map(item=>`<article class="achievement-card ${item.claimed?'earned':''}"><div class="achievement-symbol">${icon(item.claimed?'medal':'lock')}</div><div><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p><progress max="${item.target}" value="${item.claimed?item.target:Math.min(item.target,item.current)}"></progress><footer><span>${item.claimed?'已达成 ✓':`${Math.min(item.target,item.current)} / ${item.target}`}</span><strong>+${item.points} 点${item.claimed?' · 已领取':''}</strong></footer></div></article>`).join('')}</div><h3>小城的秘密</h3><p class="modal-subtitle">点击森林、走近水边、看一眼暮色，或向远方出发。惊喜藏在日常的小动作里。</p><div class="secret-grid">${SECRETS.map(item=>{const found=state.progress.secrets.includes(item.id);return `<article class="secret-card ${found?'found':''}"><span>${found?'✦':'✧'}</span><h3>${found?esc(item.title):'尚未发现'}</h3><p>${found?esc(item.description):'放慢脚步，四处看看。'}</p><small>${found?`已领取 ${item.points} 点`:'等待你的发现'}</small></article>`;}).join('')}</div>`);
}
function hasTownBackup(){try{return !!localStorage.getItem(BACKUP_KEY);}catch{return false;}}
function openNewTown(){
  openModal('new-town',`<div class="modal-eyebrow">A FRESH LITTLE BEGINNING</div><h2>开始一座全新的小城</h2><p class="modal-subtitle">新存档从 0 点、0 建筑、无专注和签到记录开始，生成新的河流、湖泊与地形。当前正在进行的计时也会留在旧城存档中。<br>系统会保留最近一份旧城备份，可在设置中恢复；更早的备份会被替换。</p><div class="field"><label for="newTownName">新小镇名字</label><input id="newTownName" maxlength="24" value="FocuCity"></div><div class="modal-actions"><button class="secondary-button" data-action="export">先导出当前存档</button><button class="primary-button" data-action="confirm-new-town">保存旧城并新建</button></div>`);
}
function replaceTown(next){
  state=next;rewardHistory=[];clearBatch();batchMode=false;selectedTool=null;world.setTool(null);world.invalidateCity();
  syncDurationFromState(true);if(!persist())return;closeModal();render();world.center();updateToolHint();navigate('home');
}
function createBlankTown(){
  const name=$('newTownName').value.trim().slice(0,24)||'FocuCity';
  try{localStorage.setItem(BACKUP_KEY,JSON.stringify(state));}catch{return toast('旧城备份未能保存，请先导出存档后再试。',true);}
  const next=createInitialState();next.cityName=name;replaceTown(next);toast('新的小城准备好了，从第一段专注开始。');
}
function restoreTown(){
  try{const result=validateSave(JSON.parse(localStorage.getItem(BACKUP_KEY)));if(!result.ok)throw new Error();pendingImport=result.state;openModal('import',`<h2>回到「${esc(result.state.cityName)}」？</h2><p class="modal-subtitle">恢复后会替换当前城市，可以先导出当前存档。</p><div class="modal-actions"><button class="secondary-button" data-action="export">先导出当前存档</button><button class="primary-button" data-action="confirm-import">恢复这份存档</button></div>`);}catch{toast('没有可恢复的旧城备份。',true);}
}
function openSettings() {
  showModule('settings', `<div class="modal-eyebrow">MAKE YOURSELF AT HOME</div><h2>关于你的小镇</h2><p class="modal-subtitle">给这里起一个名字，留下一份属于自己的时光。</p><form id="settingsForm"><div class="field"><label for="cityNameInput">小镇名字</label><input id="cityNameInput" value="${esc(state.cityName)}" maxlength="24" required></div><button class="primary-button" type="submit">保存名字</button></form><section class="performance-settings"><h3>画面与耗电</h3><p>均衡模式限制为 30 帧，省电模式降低清晰度并关闭水面波纹。切换页面或隐藏窗口时暂停地图绘制，专注计时继续。</p><div class="performance-options" role="group" aria-label="地图性能模式">${Object.entries(RENDER_MODES).map(([id,m])=>`<button class="performance-option ${state.settings.performanceMode===id?'selected':''}" data-performance="${id}" aria-pressed="${state.settings.performanceMode===id}"><strong>${m.label}</strong><span>${m.fps} 帧 / 秒</span><small>${id==='eco'?'更低耗电':id==='quality'?'高清建筑细节':'日常推荐'}</small></button>`).join('')}</div></section><div class="settings-row"><div><strong>带走这段时光</strong><p>选择保存位置，导出城市、专注记录和当前计时进度。</p></div><button class="secondary-button" data-action="export">选择位置并导出</button></div><div class="settings-row"><div><strong>回到熟悉的小镇</strong><p>导入存档会替换此浏览器的现有进度。</p></div><button class="secondary-button" data-action="import">导入存档</button></div><div class="settings-row"><div><strong>重新开始一座小城</strong><p>新世界拥有多条河流、湖泊与不同地貌，建筑、点数和记录从零开始。当前城市会保留一份本地备份。</p></div><button class="secondary-button" data-action="new-town">新建空白存档</button></div>${hasTownBackup()?'<div class="settings-row"><div><strong>上一次的小城</strong><p>切换回最近一次新建前保存的城市。</p></div><button class="secondary-button" data-action="restore-town">恢复上一个小镇</button></div>':''}<p class="inline-note">当前为本地存档模式，不会自动跨设备同步。更换浏览器或清理网站数据前，记得导出一份备份。<br>世界种子：${state.seed} · 版本 0.4</p>`);
}
function openCheckin() {
  const c = getCheckinStatus(state);
  const now = new Date(), y=now.getFullYear(), m=now.getMonth();
  const offset=(new Date(y,m,1).getDay()+6)%7, count=new Date(y,m+1,0).getDate();
  const days = new Set(c.daysInMonth);
  const cell = day => {const key=localDateKey(new Date(y,m,day)); return `<div class="calendar-day ${days.has(key)?'signed':''} ${key===c.today?'today':''}"><span>${day}</span><small>${days.has(key)?'已签到':key===c.today?'今天':''}</small></div>`;};
  showModule('checkin', `<div class="modal-eyebrow">SHOW UP, GROW A LITTLE</div><h2>每一次到来，都有回响</h2><p class="modal-subtitle">给专注一个小小的开始，也给小城一份生长的礼物。</p><div class="checkin-rewards"><article class="reward-card daily"><span>每日签到</span><strong>+10 <small>专注点</small></strong><p>每天来一次，小城近一点。</p><button class="primary-button" data-claim="daily" ${c.todayClaimed?'disabled':''}>${c.todayClaimed?'今日已签到 ✓':'领取今日奖励'}</button></article><article class="reward-card"><span>每周相伴</span><strong>+40 <small>专注点</small></strong><p>本周已签到 <b>${c.weekDays}</b> / 5 天</p><progress max="5" value="${Math.min(5,c.weekDays)}"></progress><button class="secondary-button" data-claim="weekly" ${c.weekClaimed||!c.weekEligible?'disabled':''}>${c.weekClaimed?'本周已领取 ✓':c.weekEligible?'领取每周奖励':'满 5 天可领取'}</button></article><article class="reward-card"><span>每月生长</span><strong>+150 <small>专注点</small></strong><p>本月达标周 <b>${c.qualifiedWeeks}</b> / 3 周</p><progress max="3" value="${Math.min(3,c.qualifiedWeeks)}"></progress><button class="secondary-button" data-claim="monthly" ${c.monthClaimed||!c.monthEligible?'disabled':''}>${c.monthClaimed?'本月已领取 ✓':c.monthEligible?'领取每月奖励':'满 3 个达标周可领取'}</button></article></div><section class="calendar-card"><div class="calendar-heading"><h3>${y} 年 ${m+1} 月</h3><span>本月 ${[...days].filter(d=>d.startsWith(c.monthKey)).length} 天相伴</span></div><div class="calendar-grid">${['一','二','三','四','五','六','日'].map(d=>`<span class="weekday">${d}</span>`).join('')}${Array.from({length:offset},()=>'<div class="calendar-blank"></div>').join('')}${Array.from({length:count},(_,i)=>cell(i+1)).join('')}</div></section><div class="rule-note"><h3>签到规则</h3><p>每天可领 10 点；每个自然周（周一至周日）签到至少 5 天，可额外领取 40 点。每月有 3 个自然周各签到至少 5 天，可额外领取 150 点；跨月周只计算其中属于当月的签到日。</p><p>无需连续签到。每种奖励每个周期仅可领取一次，请在当前周／月结束前领取。签到按设备本地日期计算，并随城市存档保存。</p></div>`);
}
function openHelp() {
  const steps=[
    ['从一段专注开始','每完成 1 分钟获得 1 点。暂停保留进度，提前结束没有奖励。切换页面和后台运行不会丢失计时。'],
    ['按住卡片左右拖动','建设栏可以直接用鼠标拖动卡片横向滚动，也支持触控板、手指和滚轮。点击卡片选择设施，R 旋转，Esc 退出。'],
    ['一口气铺好一条路','选择道路、桥梁、隧道、铁路或地铁线后开启「批量直线」，先选起点、再选终点。预览显示格数和总价，终点自动对齐水平或竖直轴。最多 200 格；同类型已有线路不重复扣点，遇到障碍或余额不足整批不建设。不同地形请分段使用道路、桥梁或隧道。'],
    ['分层建设，合理相遇','公路和铁路可以在同一格形成平交道口。地下地铁线可铺在楼房、道路和其他地形下方，切换地铁图层查看。地铁站出入口仍占地面空间；普通楼房不能压住地面铁路。'],
    ['连接车站与港口','铁路要接到火车站前沿的站台轨道；旋转后接右前沿轨道，两个站台连通后自动开车。两座临水港口之间有连通水域即可通航，点击港口查看状态。两个机场之间自动生成航班。'],
    ['随手拆除，全额返还','地图右侧的「快速拆除」打开后，点击或按住拖动可连续清除。选择地面、铁路或地下层，每次只拆该层；点击大型建筑任一格会拆掉整座。实际投入的专注点全部返还，X 或 Esc 退出。'],
    ['升级、成就与惊喜','城市突破等级时自动发放一次奖励，提示本级解锁设施及用途；城市成长页可回看。成就页显示条件、进度和已获奖励。拆除后不会撤回勋章，也不会重新发放同一奖励。森林、水边、暮色和远方都有小秘密。'],
    ['留下旧城，探索新世界','设置中可新建零点、零建筑的空白存档，并保留一份最近旧城备份。新世界加入多条河流、湖泊、沙滩和湿地；旧城市保持原地形以保护已有建筑。导出时优先弹出保存位置选择器，不支持时可复制 JSON 或使用浏览器下载。存档仍保存在此浏览器，无自动跨设备同步。'],
    ['看得更远，也更省电','地图可缩小至 18%，远景自动简化细节。均衡模式上限 30 帧，省电模式 20 帧；离开小镇或打开详情时暂停地图绘制。']
  ];
  showModule('help',`<div class="modal-eyebrow">WELCOME TO FOCUCITY</div><h2>从一段专注，到一座城市</h2><p class="modal-subtitle">把生活的节奏，慢慢铺成自己的街道。</p><ol class="help-steps">${steps.map(([title,description])=>`<li><div><strong>${title}</strong><p>${description}</p></div></li>`).join('')}</ol><div class="guide-actions"><button class="primary-button" data-route="home">开始专注</button><button class="secondary-button" data-route="settings">存档与设置</button></div>`);
}
function openSound() {
  openModal('sound', `<div class="modal-eyebrow">A SOFTER KIND OF SILENCE</div><h2>听见安静的声音</h2><p class="modal-subtitle">原创合成环境音，陪你度过一段不被打扰的时光。</p><div class="sound-options">${[['forest','leaf','林间微风'],['rain','cloud','窗外细雨'],['piano','music','午后轻琴']].map(([id,i,name])=>`<button class="sound-option ${musicMode===id?'selected':''}" data-sound="${id}">${icon(i)}${name}</button>`).join('')}</div><h3>让声音轻一点</h3><input class="volume-control" id="volumeControl" type="range" min="0" max="1" step=".01" value="${volume}" aria-label="音乐音量"><div class="modal-actions"><button class="primary-button" data-action="sound-toggle">${sound.active?'暂停声音':'开始播放'}</button></div>`);
}
async function toggleSound() {
  const wasActive = sound.active;
  if (sound.active) sound.stop();
  else if (!(await sound.start(musicMode))) { toast('此浏览器暂时无法播放音频，请再次点击播放。',true); return; }
  state.settings.sound = sound.active;
  if (!persist()) {
    if (wasActive) await sound.start(musicMode);
    else sound.stop();
    $('soundWave').classList.toggle('playing',sound.active);
    return;
  }
  $('soundWave').classList.toggle('playing',sound.active);
  setText('soundLabel', ({forest:'林间白噪音',rain:'窗外细雨',piano:'午后轻琴'})[musicMode]);
  if (modalType === 'sound') openSound();
}
function downloadSave() {
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href=url; a.download=`FocuCity-save-${new Date().toISOString().slice(0,10)}.json`; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000); toast('已导出存档，愿时光被好好珍藏。');
}
async function exportSave(){
  const result=await saveJsonToChosenFile(state,`FocuCity-save-${localDateKey()}.json`);
  if(result.ok)return toast(`存档已保存：${result.name}`);
  if(result.cancelled)return;
  if(!result.unsupported)return toast(`未能保存存档：${result.error}`,true);
  openModal('export',`<div class="modal-eyebrow">TAKE YOUR TOWN WITH YOU</div><h2>保存一份小城</h2><p class="modal-subtitle">当前浏览器不提供网页选择保存位置的功能。可复制下方存档文本保存为 .json 文件，或使用浏览器下载。支持文件选择器的桌面 Chrome / Edge 会直接弹出「另存为」窗口。</p><textarea id="saveText" class="save-text" aria-label="存档 JSON 文本" readonly>${esc(JSON.stringify(state,null,2))}</textarea><div class="modal-actions"><button class="primary-button" data-action="copy-save">复制存档文本</button><button class="secondary-button" data-action="download-save">使用浏览器下载</button></div>`);
}

$('focusButton').addEventListener('click',focusAction);
$('cancelFocus').addEventListener('click',()=>openModal('cancel', `<div class="modal-eyebrow">IT'S OKAY TO TAKE A BREAK</div><h2>结束这次专注？</h2><p class="modal-subtitle">提前结束不会获得本次专注点，也不会计入完成记录。如果只是休息一下，可以选择暂停。</p><div class="modal-actions"><button class="secondary-button" data-action="close">继续专注</button><button class="primary-button danger-button" data-action="cancel-focus">结束本次</button></div>`));
document.querySelectorAll('[data-minutes]').forEach(button=>button.addEventListener('click',()=>{
  if(state.focus)return; chosenMinutes=Number(button.dataset.minutes); customDurationOpen=false;
  renderDuration(); updateClock();
}));
$('customDuration').addEventListener('click',()=>{
  if(state.focus)return; customDurationOpen=true; renderDuration();
  $('minutesInput').focus();
});
$('minutesInput').addEventListener('input',()=>{
  if(state.focus)return;
  const value=Number($('minutesInput').value);
  if(Number.isInteger(value)&&value>=1&&value<=240){chosenMinutes=value;updateClock();}
});
$('minutesInput').addEventListener('change',()=>{
  if(state.focus)return;
  const value=Number($('minutesInput').value);
  if(!Number.isInteger(value)||value<1||value>240){toast('请输入 1–240 分钟的整数。',true);$('minutesInput').value=chosenMinutes;return;}
  chosenMinutes=value;renderDuration();updateClock();
});
bindDragScroll($('buildingList'));
bindDragScroll($('categoryTabs'));
$('buildingList').addEventListener('click',event=>{const b=event.target.closest('[data-build]');if(b)selectTool(b.dataset.build);});
$('categoryTabs').addEventListener('click',event=>{const b=event.target.closest('[data-category]');if(!b)return;category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>x.classList.toggle('active',x===b));renderBuildings();});
$('demolishButton').addEventListener('click',()=>selectTool('demolish'));
$('quickDemolish').addEventListener('click',()=>selectTool('demolish'));
$('demolitionLayer').addEventListener('change',()=>{const layer=$('demolitionLayer').value;world.setDemolitionLayer?.(layer);if(layer==='underground'){$('metroLayer').setAttribute('aria-pressed','true');world.setShowMetro(true);}updateToolHint();});
$('batchPlacement').addEventListener('click',()=>{batchMode=!batchMode;clearBatch();updateToolHint();});
$('dismissIntro').addEventListener('click',()=>{introDismissed=true;$('mapIntro').hidden=true;});
$('zoomIn').addEventListener('click',()=>{world.zoomBy(.15);setText('zoomLabel',Math.round(world.getView().zoom*100)+'%');});
$('zoomOut').addEventListener('click',()=>{world.zoomBy(-.15);setText('zoomLabel',Math.round(world.getView().zoom*100)+'%');});
$('centerMap').addEventListener('click',()=>{world.center();setText('zoomLabel',Math.round(world.getView().zoom*100)+'%');});
$('daylightButton').addEventListener('click',()=>{const evening=$('cityView').classList.toggle('evening');$('daylightButton').innerHTML=icon('sun')+(evening?'暮色':'日光');$('daylightButton').title=evening?'切换日光':'切换暮色';if(evening)revealSecret('evening');});
$('openCatalog').addEventListener('click',()=>navigate('catalog'));
$('viewStats').addEventListener('click',()=>navigate('stats'));
$('cityNameButton').addEventListener('click',()=>navigate('settings'));
$('levelButton').addEventListener('click',()=>navigate('levels'));
$('pointsButton').addEventListener('click',()=>navigate('checkin'));
$('soundButton').addEventListener('click',toggleSound);
$('soundSettings').addEventListener('click',openSound);
$('closeModal').addEventListener('click',closeModal);
$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
$('modal').addEventListener('cancel',()=>{modalType=null;world.setActive(currentView==='town'&&!document.hidden);});
document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.nav)));
document.addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.route){navigate(b.dataset.route);return;}
  if(b.dataset.performance&&RENDER_MODES[b.dataset.performance]){state.settings.performanceMode=b.dataset.performance;if(!persist())return;world.setPerformanceMode(b.dataset.performance);openSettings();toast(`已切换${RENDER_MODES[b.dataset.performance].label}模式`);return;}
  if(b.dataset.claim){const result=claimCheckin(state,b.dataset.claim); if(result.ok){if(!persist())return;render();} toast(result.message,!result.ok);return;}
  if(b.dataset.catalogCategory){catalogCategory=b.dataset.catalogCategory;openCatalog();return;}
  if(b.dataset.catalogBuild){const item=CATALOG.find(x=>x.id===b.dataset.catalogBuild);if(item.level>cityStats(state).level)navigate('levels');else{navigate('town');selectTool(item.id);}return;}
  if(b.dataset.sound){musicMode=b.dataset.sound;if(sound.active)await sound.setMode(musicMode);setText('soundLabel',({forest:'林间白噪音',rain:'窗外细雨',piano:'午后轻琴'})[musicMode]);openSound();return;}
  switch(b.dataset.action){
    case 'close':closeModal();break;
    case 'reward-close':navigate('town');break;
    case 'focus-toggle':focusAction();break;
    case 'cancel-focus':{if(checkCompletion())break;const result=cancelFocus(state);if(!result.ok){toast(result.message,true);break;}if(!persist())break;render();closeModal();toast(result.message);break;}
    case 'export':exportSave();break;
    case 'download-save':downloadSave();break;
    case 'copy-save':{try{await navigator.clipboard.writeText($('saveText').value);toast('已复制，可粘贴到纯文本文件并保存为 .json。');}catch{$('saveText').focus();$('saveText').select();toast('文本已选中，请按 Command + C 复制。');}break;}
    case 'new-town':openNewTown();break;
    case 'confirm-new-town':createBlankTown();break;
    case 'restore-town':restoreTown();break;
    case 'reward-details':openRewardDetails(Number(b.dataset.rewardIndex));break;
    case 'inspect-layer':inspectBuilding(Number(b.dataset.x),Number(b.dataset.y),b.dataset.layer);break;
    case 'import':$('importFile').click();break;
    case 'sound-toggle':await toggleSound();break;
    case 'upgrade-building':{const x=Number(b.dataset.x),y=Number(b.dataset.y);const result=upgradeBuilding(state,x,y,currentTerrain,b.dataset.layer);if(result.ok){world.invalidateCity();if(!persist())break;render();inspectBuilding(x,y,b.dataset.layer);}toast(result.message,!result.ok);break;}
    case 'remove-building':{const result=demolishAt(state,Number(b.dataset.x),Number(b.dataset.y),b.dataset.layer);if(!result.ok){toast(result.message,true);break;}world.invalidateCity();if(!persist())break;render();closeModal();toast(result.message);break;}
    case 'confirm-import':{if(!pendingImport)break;const next=pendingImport;pendingImport=null;replaceTown(next);toast('欢迎回来，存档已恢复。');checkCompletion();break;}
  }
});
$('pageContent').addEventListener('submit',event=>{if(event.target.id!=='settingsForm')return;event.preventDefault();const name=$('cityNameInput').value.trim();if(!name)return;state.cityName=name.slice(0,24);if(!persist())return;render();toast('小镇有了一个好听的名字。');});
document.addEventListener('input',event=>{if(event.target.id==='volumeControl'){volume=Number(event.target.value);sound.setVolume(volume);}if(event.target.id==='catalogSearch'){catalogQuery=event.target.value.trim();updateCatalogCards();}if(event.target.id==='catalogUnlocked'){catalogUnlocked=event.target.checked;updateCatalogCards();}});
let pendingImport=null;
$('importFile').addEventListener('change',async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  if(file.size>20*1024*1024)return toast('存档过大，请使用 20 MB 以内的 JSON 文件。',true);
  try{const result=validateSave(JSON.parse(await file.text()));if(!result.ok)return toast(result.message,true);pendingImport=result.state;const stats=cityStats(pendingImport);openModal('import',`<div class="modal-eyebrow">WELCOME BACK</div><h2>恢复「${esc(pendingImport.cityName)}」？</h2><p class="modal-subtitle">这份存档包含 ${stats.buildingCount} 座设施、${pendingImport.sessions.length} 条专注记录，以及 ${pendingImport.points} 专注点。<br>导入后将替换当前进度，建议先导出当前存档。</p><div class="modal-actions"><button class="secondary-button" data-action="export">先导出当前存档</button><button class="primary-button" data-action="confirm-import">恢复这份存档</button></div>`);}catch{toast('无法读取这个存档，请选择有效的 JSON 文件。',true);}
});
document.addEventListener('keydown',event=>{if(/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;if(event.key==='Escape'&&!$('modal').open&&selectedTool)selectTool(null);if(event.key.toLowerCase()==='r'&&currentView==='town'&&!$('modal').open)rotateTool();if(event.key.toLowerCase()==='x'&&currentView==='town'&&!$('modal').open)selectTool('demolish');});
window.addEventListener('storage',event=>{
  if(event.key!==STORAGE_KEY&&event.key!==null)return;
  state=loadState();syncDurationFromState(true);render();
  if(currentView==='settings')openSettings();
});
document.addEventListener('visibilitychange',()=>{world.setActive(currentView==='town'&&!document.hidden&&!$('modal').open);if(!document.hidden){checkCompletion();render();}});
const pageRenderers={stats:openStats,catalog:openCatalog,levels:openLevels,achievements:openAchievements,settings:openSettings,help:openHelp,checkin:openCheckin};
$('toggleBuild').addEventListener('click',()=>setBuildDock($('buildDock').hidden));
$('closeBuild').addEventListener('click',()=>setBuildDock(false));
$('rotateBuilding').addEventListener('click',rotateTool);
$('rotatePlacement').addEventListener('click',rotateTool);
$('cancelPlacement').addEventListener('click',()=>selectTool(null));
$('buildSearch').addEventListener('input',renderBuildings);
$('buildUnlocked').addEventListener('change',renderBuildings);
$('metroLayer').addEventListener('click',()=>{const show=$('metroLayer').getAttribute('aria-pressed')!=='true';$('metroLayer').setAttribute('aria-pressed',String(show));world.setShowMetro?.(show);});
window.addEventListener('popstate',()=>navigate(location.hash.slice(1),false));
window.addEventListener('hashchange',()=>{if(location.hash.slice(1)!==currentView)navigate(location.hash.slice(1),false);});
const now=new Date();
setText('dateLabel',now.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'}));
setText('greeting',now.getHours()<12?'早安，给自己一点生长的时间':now.getHours()<18?'午后好，给自己一点生长的时间':'晚上好，给自己一点安静的时间');
render();
navigate(location.hash.slice(1)||'home',false);
updateToolHint();
// Persist a fresh world's seed immediately; an offline completion settles first.
if (!checkCompletion()) {persist();render();}
setText('zoomLabel',Math.round(world.getView().zoom*100)+'%');
let renderedDate=localDateKey();
setInterval(()=>{if(document.hidden)return;if(!checkCompletion())updateClock();const today=localDateKey();if(today!==renderedDate){renderedDate=today;setText('dateLabel',new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'}));render();}},1000);

setInterval(()=>{if(currentView!=='town'||document.hidden)return;const t=world.getTrafficSummary?.();if(t)setText('networkStatus',`通行路线 · 公路 ${t.cars||0} · 航线 ${t.boats||0} · 火车 ${t.trains||0} · 地铁 ${t.metros||0} · 飞机 ${t.planes||0}`);},2000);
