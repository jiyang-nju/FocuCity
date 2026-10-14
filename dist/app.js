import { CATALOG, LEVELS, STORAGE_KEY, loadState, saveState, validateSave, cityStats, todayStats, weekStats, startFocus, pauseFocus, resumeFocus, cancelFocus, completeFocus, getRemaining, buildAt, demolishAt, getBuildingAt, canUpgradeBuilding, upgradeBuilding, localDateKey } from './model.js';
import { createWorld, terrainAt, drawBuildingIcon } from './world.js';
import { createSoundscape } from './audio.js';
import { getCheckinStatus, claimCheckin } from './checkins.js';
import { RENDER_MODES } from './render-loop.js';

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
const views = new Set(['home','town','stats','catalog','checkin','levels','settings','help']);
const sound = createSoundscape();
sound.setVolume(volume);
const world = createWorld($('worldCanvas'), { getState: () => state, onTileClick: handleTile, onHover: () => { $('zoomLabel').textContent = Math.round(world.getView().zoom * 100) + '%'; } });

function toast(message, error = false) {
  const item = document.createElement('div');
  item.className = 'toast' + (error ? ' error' : '');
  item.textContent = message;
  $('toasts').appendChild(item);
  setTimeout(() => item.remove(), 4200);
}
function persist() {
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
  if (['stats','catalog','checkin','levels'].includes(currentView)) pageRenderers[currentView]();
}
function renderBuildings() {
  const level = cityStats(state).level;
  const query = $('buildSearch').value.trim();
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
  $('demolishButton').classList.toggle('active', selectedTool === 'demolish');
  $('placementStatus').hidden = !selectedTool;
  $('placementActions').hidden = !selectedTool;
  $('rotatePlacement').hidden = !selectedTool || selectedTool === 'demolish';
  $('placementStatus').classList.toggle('danger', selectedTool === 'demolish');
  $('rotateBuilding').disabled = !selectedTool || selectedTool === 'demolish';
  if (selectedTool === 'demolish') {
    setText('placementStatus','拆除模式 · 点击设施任一格，返还 50% 已投入点数 · Esc 退出');
    setText('buildHint','整座设施一并拆除，请留意占地范围');
  } else if (selectedTool) {
    const item = CATALOG.find(x => x.id === selectedTool);
    const w = rotation ? item.height : item.width, h = rotation ? item.width : item.height;
    setText('placementStatus',`${item.name} · ${w}×${h} 格 · ${item.cost} 点 · R 旋转 · Esc 退出`);
    setText('buildHint',`${item.name}：人口 +${item.population} · GDP +${item.gdp} · ${terrainLabel(item)}`);
  } else setText('buildHint','选择设施后点击地图；R 旋转，Esc 退出');
}
function terrainLabel(item) {
  return item.terrain === 'water' ? '建于水面' : item.terrain === 'mountain' ? '建于山地' : item.terrain === 'shore' ? '临水陆地' : item.terrain === 'underground' ? '地下线路' : '草地或林地';
}
function selectTool(id) {
  if (id !== 'demolish' && id) {
    const item = CATALOG.find(x => x.id === id);
    if (!item) return;
    if (item.level > cityStats(state).level) return toast(`城市达到 Lv.${item.level} 后解锁${item.name}。`);
  }
  selectedTool = selectedTool === id ? null : id;
  world.setTool(selectedTool);
  world.setRotation?.(rotation);
  updateToolHint();
  if (selectedTool) setBuildDock(false);
  renderBuildings();
}
function rotateTool() {
  if (!selectedTool || selectedTool === 'demolish') return;
  rotation = rotation ? 0 : 1;
  world.setRotation?.(rotation); updateToolHint();setBuildDock(false);
}
function inspectBuilding(x,y) {
  const found = getBuildingAt(state,x,y);
  if (!found) return;
  const {building,definition:item} = found;
  const next = CATALOG.find(c => c.id === item.upgradeTo);
  const port=world.getPortStatus(found.key);
  const portInfo=port?`<div class="port-status ${port.status==='connected'?'connected':''}"><strong>${port.status==='connected'?'航线已开通':'港口通航状态'}</strong><p>${esc(port.reason)}</p>${port.connections.length?`<small>连接 ${port.connections.length} 座港口 · 船舶会沿水面往返</small>`:''}</div>`:'';
  const eligibility = next ? canUpgradeBuilding(state,found.x,found.y,(a,b)=>terrainAt(a,b,state.seed)) : null;
  openModal('inspect', `<div class="modal-eyebrow">A PIECE OF YOUR TOWN</div><div class="inspect-header"><canvas class="building-icon" data-building="${item.id}"></canvas><div><h2>${item.name}</h2><p class="modal-subtitle">${building.width || 1} × ${building.height || 1} 格 · T${item.tier || 1} · 坐标 ${found.x}, ${found.y}</p></div></div><p class="modal-subtitle">${item.description}</p>${portInfo}<div class="stats-grid"><div class="stat-box"><span>提供人口</span><strong>${item.population}</strong></div><div class="stat-box"><span>城市 GDP</span><strong>${item.gdp}</strong></div><div class="stat-box"><span>投入点数</span><strong>${building.paid ?? item.cost}</strong></div></div>${next ? `<div class="upgrade-card"><div><span class="eyebrow">下一阶段 · T${next.tier || 2}</span><h3>${next.name}</h3><p>Lv.${next.level} · 占地 ${building.rotation?next.height:next.width} × ${building.rotation?next.width:next.height} 格 · 需补 ${Math.max(0,next.cost-(building.paid??item.cost))} 点</p><p>${eligibility.ok?'已满足升级条件，扩建将占用周围空地。':esc(eligibility.message)}</p></div><button class="primary-button" data-action="upgrade-building" data-x="${found.x}" data-y="${found.y}" ${eligibility.ok?'':'disabled'}>扩建升级</button></div>` : '<p class="inline-note">此设施已是该系列的最高阶段。</p>'}<div class="modal-actions"><button class="secondary-button" data-action="close">继续逛逛</button><button class="secondary-button" data-action="remove-building" data-x="${found.x}" data-y="${found.y}">拆除 · 返还 ${Math.floor((building.paid??item.cost)/2)} 点</button></div>`);
}
function handleTile(tile) {
  if (!tile) return;
  const {x,y,terrain} = tile;
  if (selectedTool === 'demolish') {
    const result = demolishAt(state,x,y);
    if (result.ok) { world.invalidateCity();if (!persist()) return; render(); }
    toast(result.message,!result.ok); return;
  }
  if (selectedTool) {
    const result = buildAt(state,selectedTool,x,y,(a,b) => terrainAt(a,b,state.seed),rotation);
    if (result.ok) { world.invalidateCity();if (!persist()) return; render(); if (result.levelUp) toast(`小镇升级了！Lv.${cityStats(state).level} · ${cityStats(state).title}`); }
    toast(result.message,!result.ok); return;
  }
  if (getBuildingAt(state,x,y)) inspectBuilding(x,y);
  else toast(`${x}, ${y} · ${{grass:'草地',forest:'林地',water:'水域：可铺设桥梁',mountain:'山地：可开凿隧道'}[terrain] || terrain}`);
}
function applyView(view) {
  currentView = view;
  $('homePage').hidden = view !== 'home';
  $('townPage').hidden = view !== 'town';
  $('modulePage').hidden = ['home','town'].includes(view);
  document.body.dataset.view = view;
  document.querySelectorAll('[data-nav]').forEach(b => {b.classList.toggle('active',b.dataset.nav===view); b.setAttribute('aria-current',b.dataset.nav===view?'page':'false');});
  world.setActive?.(view === 'town' && !document.hidden);
  updateClock();
}
function showModule(view,content) {
  applyView(view);
  $('pageContent').innerHTML = content;
  $('modulePage').setAttribute('aria-label',({stats:'时光记录',catalog:'城市图鉴',checkin:'每日签到',levels:'城市成长',help:'小镇指南',settings:'小镇设置'})[view]);
  fillBuildingIcons($('pageContent'));
}
function navigate(view,writeHash=true) {
  if (!views.has(view)) view='home';
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
  const stats = cityStats(state);
  showModule('levels', `<div class="modal-eyebrow">ONE STEP AT A TIME</div><h2>让小镇，慢慢长大</h2><p class="modal-subtitle">人口或 GDP 达到任意一项条件即可升级。已解锁的设施会一直为你保留。</p><div class="stats-grid"><div class="stat-box"><span>当前等级</span><strong>${stats.level}</strong></div><div class="stat-box"><span>小镇人口</span><strong>${stats.population}</strong></div><div class="stat-box"><span>城市 GDP</span><strong>${stats.gdp}</strong></div></div>${LEVELS.map(l=>`<div class="milestone"><span class="level-medallion">${l.level}</span><div><h3>${l.title}</h3><p>${l.level===1?'一片土地，一个全新的开始':`人口 ${l.population} 人 / GDP ${l.gdp}，满足一项`}<br>解锁：${CATALOG.filter(x=>x.level===l.level).map(x=>x.name).join('、')}</p></div>${l.level<=stats.level?'<span class="achieved">已抵达 ✓</span>':''}</div>`).join('')}`);
}
function openSettings() {
  showModule('settings', `<div class="modal-eyebrow">MAKE YOURSELF AT HOME</div><h2>关于你的小镇</h2><p class="modal-subtitle">给这里起一个名字，留下一份属于自己的时光。</p><form id="settingsForm"><div class="field"><label for="cityNameInput">小镇名字</label><input id="cityNameInput" value="${esc(state.cityName)}" maxlength="24" required></div><button class="primary-button" type="submit">保存名字</button></form><section class="performance-settings"><h3>画面与耗电</h3><p>均衡模式限制为 30 帧，省电模式降低清晰度并关闭水面波纹。切换页面或隐藏窗口时暂停地图绘制，专注计时继续。</p><div class="performance-options" role="group" aria-label="地图性能模式">${Object.entries(RENDER_MODES).map(([id,m])=>`<button class="performance-option ${state.settings.performanceMode===id?'selected':''}" data-performance="${id}" aria-pressed="${state.settings.performanceMode===id}"><strong>${m.label}</strong><span>${m.fps} 帧 / 秒</span><small>${id==='eco'?'更低耗电':id==='quality'?'高清建筑细节':'日常推荐'}</small></button>`).join('')}</div></section><div class="settings-row"><div><strong>带走这段时光</strong><p>导出城市、专注记录和当前计时进度。</p></div><button class="secondary-button" data-action="export">导出存档</button></div><div class="settings-row"><div><strong>回到熟悉的小镇</strong><p>导入存档会替换此浏览器的现有进度。</p></div><button class="secondary-button" data-action="import">导入存档</button></div><p class="inline-note">当前为本地存档模式，不会自动跨设备同步。更换浏览器或清理网站数据前，记得导出一份备份。<br>世界种子：${state.seed} · 版本 0.3</p>`);
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
  showModule('help', `<div class="modal-eyebrow">WELCOME TO FOCUCITY</div><h2>从一段专注，到一座城市</h2><p class="modal-subtitle">每个页面，各有一段属于自己的时光。</p><ol class="help-steps"><li><div><strong>从首页安静开始</strong><p>填写任务，选择 1–240 分钟。完成每分钟获得 1 点；暂停保留进度，提前结束不奖励。切换页面不会停止计时。</p></div></li><li><div><strong>为城市留出成长的空间</strong><p>在小镇打开「建设小镇」，选择设施，绿色范围代表可建。R 旋转长宽，Esc 取消。大型设施占多格，点击其中任一格可查看或拆除整座设施。</p></div></li><li><div><strong>连接，才有来往</strong><p>道路连成线后出现行人和汽车；桥梁建在水上，隧道穿过山地。两个火车站用铁路连接，两个地铁站用地铁线连接后自动开行。港口之间须有连通水域，机场至少两座才会有往返航班。交通工具自动运行，不需要逐辆购买。较长道路会出现小汽车、出租车、公交车、大巴与货车；不同等级港口拥有帆船、客轮或货轮。点击港口可查看未通航原因。</p><p>地铁线是地下设施，可穿过不同地形；当前每个地块只放一项设施，请为站点和线路预留位置。点击「地铁图层」查看线路。</p></div></li><li><div><strong>从学校，到拥有操场的校园</strong><p>城市分为 ${LEVELS.length} 个等级，人口或 GDP 达到其中一项即升级。选中已建设施可查看下一级和扩建条件；只补差价，扩建需要周围有足够空地。高等级设施也可直接新建。</p></div></li><li><div><strong>把进度好好留下</strong><p>签到、城市和专注自动保存在此浏览器。设置中可导入或导出备份。旧版建筑继续保留原有一格占地，升级后才会扩展；没有账号云同步。</p><p>设置中可选择均衡、省电或清晰模式，降低地图耗电。便利店可逐级扩建为超市和商场。</p></div></li></ol><div class="guide-actions"><button class="primary-button" data-route="home">开始专注</button><button class="secondary-button" data-route="settings">存档与设置</button></div>`);
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
function exportSave() {
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href=url; a.download=`FocuCity-save-${new Date().toISOString().slice(0,10)}.json`; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000); toast('已导出存档，愿时光被好好珍藏。');
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
$('buildingList').addEventListener('click',event=>{const b=event.target.closest('[data-build]');if(b)selectTool(b.dataset.build);});
$('categoryTabs').addEventListener('click',event=>{const b=event.target.closest('[data-category]');if(!b)return;category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>x.classList.toggle('active',x===b));renderBuildings();});
$('demolishButton').addEventListener('click',()=>selectTool('demolish'));
$('dismissIntro').addEventListener('click',()=>{introDismissed=true;$('mapIntro').hidden=true;});
$('zoomIn').addEventListener('click',()=>{world.zoomBy(.15);setText('zoomLabel',Math.round(world.getView().zoom*100)+'%');});
$('zoomOut').addEventListener('click',()=>{world.zoomBy(-.15);setText('zoomLabel',Math.round(world.getView().zoom*100)+'%');});
$('centerMap').addEventListener('click',()=>{world.center();setText('zoomLabel',Math.round(world.getView().zoom*100)+'%');});
$('daylightButton').addEventListener('click',()=>{const evening=$('cityView').classList.toggle('evening');$('daylightButton').innerHTML=icon('sun')+(evening?'暮色':'日光');$('daylightButton').title=evening?'切换日光':'切换暮色';});
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
    case 'import':$('importFile').click();break;
    case 'sound-toggle':await toggleSound();break;
    case 'upgrade-building':{const x=Number(b.dataset.x),y=Number(b.dataset.y);const result=upgradeBuilding(state,x,y,(a,c)=>terrainAt(a,c,state.seed));if(result.ok){world.invalidateCity();if(!persist())break;render();inspectBuilding(x,y);}toast(result.message,!result.ok);break;}
    case 'remove-building':{const result=demolishAt(state,Number(b.dataset.x),Number(b.dataset.y));if(!result.ok){toast(result.message,true);break;}world.invalidateCity();if(!persist())break;render();closeModal();toast(result.message);break;}
    case 'confirm-import':{if(!pendingImport)break;state=pendingImport;pendingImport=null;syncDurationFromState(true);selectedTool=null;world.setTool(null);if(!persist())break;updateToolHint();render();if(currentView==='settings')openSettings();world.center();closeModal();toast('欢迎回来，存档已恢复。');checkCompletion();break;}
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
document.addEventListener('keydown',event=>{if(/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;if(event.key==='Escape'&&!$('modal').open&&selectedTool)selectTool(null);if(event.key.toLowerCase()==='r'&&currentView==='town'&&!$('modal').open)rotateTool();});
window.addEventListener('storage',event=>{
  if(event.key!==STORAGE_KEY&&event.key!==null)return;
  state=loadState();syncDurationFromState(true);render();
  if(currentView==='settings')openSettings();
});
document.addEventListener('visibilitychange',()=>{world.setActive(currentView==='town'&&!document.hidden&&!$('modal').open);if(!document.hidden){checkCompletion();render();}});
const pageRenderers={stats:openStats,catalog:openCatalog,levels:openLevels,settings:openSettings,help:openHelp,checkin:openCheckin};
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
if (!checkCompletion()) persist();
setText('zoomLabel',Math.round(world.getView().zoom*100)+'%');
let renderedDate=localDateKey();
setInterval(()=>{if(document.hidden)return;if(!checkCompletion())updateClock();const today=localDateKey();if(today!==renderedDate){renderedDate=today;setText('dateLabel',new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'}));render();}},1000);

setInterval(()=>{if(currentView!=='town'||document.hidden)return;const t=world.getTrafficSummary?.();if(t)setText('networkStatus',`通行路线 · 公路 ${t.cars||0} · 航线 ${t.boats||0} · 火车 ${t.trains||0} · 地铁 ${t.metros||0} · 飞机 ${t.planes||0}`);},2000);
