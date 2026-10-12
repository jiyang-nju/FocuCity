import { CATALOG, LEVELS, STORAGE_KEY, loadState, saveState, validateSave, cityStats, todayStats, weekStats, startFocus, pauseFocus, resumeFocus, cancelFocus, completeFocus, getRemaining, buildAt, demolishAt } from './model.js';
import { createWorld, terrainAt, drawBuildingIcon } from './world.js';
import { createSoundscape } from './audio.js';

const $ = id => document.getElementById(id);
const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let state = loadState();
let chosenMinutes = state.focus ? state.focus.duration / 60 : 25;
let customDurationOpen = ![25,45,60].includes(chosenMinutes);
let category = '全部', selectedTool = null, modalType = null, musicMode = 'forest', volume = .35;
let introDismissed = false, saveErrorShown = false;
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
function setText(id, text) { $(id).textContent = text; }
function formatTime(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`; }
function fillBuildingIcons(root = document) { root.querySelectorAll('canvas[data-building]').forEach(canvas => drawBuildingIcon(canvas, canvas.dataset.building)); }
function render() {
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
}
function renderBuildings() {
  const level = cityStats(state).level;
  const items = CATALOG.filter(item => category === '全部' || item.category === category);
  $('buildingList').innerHTML = items.map(item => {
    const locked = item.level > level;
    return `<button class="building-card ${locked?'locked':''} ${selectedTool === item.id?'selected':''}" data-build="${item.id}" aria-pressed="${selectedTool === item.id}" aria-label="${item.name}，${locked?`等级 ${item.level} 解锁`:`${item.cost} 专注点`}" title="${item.description} · 人口 +${item.population} · GDP +${item.gdp}">${locked?icon('lock','card-lock'):''}<canvas class="building-icon" data-building="${item.id}" aria-hidden="true"></canvas><span class="building-card-name">${item.name}</span><span class="building-card-cost">${icon(locked?'lock':'coin')}${locked?`Lv.${item.level} 解锁`:item.cost}</span></button>`;
  }).join('');
  fillBuildingIcons($('buildingList'));
}
function updateClock() {
  const focus = state.focus;
  const remaining = focus ? getRemaining(state) : chosenMinutes * 60;
  const clock = formatTime(remaining);
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
  document.title = focus ? `${clock} · ${focus.status === 'paused'?'已暂停':'专注中'} · 森屿时光` : '森屿时光 · 让专注生长';
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
function selectTool(id) {
  if (id !== 'demolish' && id) {
    const item = CATALOG.find(x => x.id === id);
    if (!item) return;
    if (item.level > cityStats(state).level) return toast(`城市达到 Lv.${item.level} 后解锁${item.name}。`);
  }
  selectedTool = selectedTool === id ? null : id;
  world.setTool(selectedTool);
  $('demolishButton').classList.toggle('active', selectedTool === 'demolish');
  $('placementStatus').hidden = !selectedTool;
  $('placementStatus').classList.toggle('danger', selectedTool === 'demolish');
  if (selectedTool === 'demolish') {
    setText('placementStatus','拆除模式 · 点击建筑，返还 50% 点数 · Esc 退出');
    setText('buildHint','点击要拆除的设施，返还一半专注点（向下取整）');
  } else if (selectedTool) {
    const item = CATALOG.find(x => x.id === selectedTool);
    setText('placementStatus',`${item.name} · ${item.cost} 点 · 点击${item.id === 'harbor'?'临水陆地':'草地'}建造 · Esc 退出`);
    setText('buildHint',`${item.name}：人口 +${item.population} · GDP +${item.gdp}`);
  } else setText('buildHint','选择一座建筑，再点击地图上的草地');
  render();
}
function handleTile(tile) {
  if (!tile) return;
  const {x,y,terrain} = tile;
  if (selectedTool === 'demolish') {
    const result = demolishAt(state,x,y);
    if (result.ok) { if (!persist()) return; render(); }
    toast(result.message,!result.ok); return;
  }
  if (selectedTool) {
    const result = buildAt(state,selectedTool,x,y,terrain,(a,b) => terrainAt(a,b,state.seed));
    if (result.ok) { if (!persist()) return; render(); if (result.levelUp) { toast(`小镇升级了！Lv.${result.level} · ${cityStats(state).title}`); } }
    toast(result.message,!result.ok); return;
  }
  const building = state.buildings[`${x},${y}`];
  if (building) {
    const item = CATALOG.find(c => c.id === building.type);
    openModal('inspect', `<div class="modal-eyebrow">A PIECE OF YOUR TOWN</div><div class="inspect-header"><canvas class="building-icon" data-building="${item.id}"></canvas><div><h2>${item.name}</h2><p class="modal-subtitle">坐标 ${x}, ${y} · ${item.category}</p></div></div><p class="modal-subtitle">${item.description}</p><div class="stats-grid"><div class="stat-box"><span>提供人口</span><strong>${item.population}<small>人</small></strong></div><div class="stat-box"><span>城市 GDP</span><strong>${item.gdp}</strong></div><div class="stat-box"><span>建设花费</span><strong>${item.cost}<small>点</small></strong></div></div><div class="modal-actions"><button class="secondary-button" data-action="close">继续逛逛</button><button class="secondary-button" data-action="remove-building" data-x="${x}" data-y="${y}">拆除 · 返还 ${Math.floor(item.cost/2)} 点</button></div>`);
  } else {
    const names = {grass:'草地，适合建起新的生活',forest:'林地，建设时会清理这片树木',water:'水域，港口可以建在岸边',mountain:'山地，保留一片远山的风景'};
    toast(`${x}, ${y} · ${names[terrain] || '选择下方的设施，开始建设'}`);
  }
}
function openModal(type, content) {
  modalType = type;
  $('modalContent').innerHTML = content;
  if (!$('modal').open) $('modal').showModal();
  fillBuildingIcons($('modalContent'));
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === type));
}
function closeModal() {
  $('modal').close(); modalType = null;
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active',b.dataset.nav === 'city'));
}
function openStats() {
  const today = todayStats(state), week = weekStats(state), max = Math.max(30,...week.map(d => d.minutes));
  const totalMinutes = state.sessions.reduce((sum,s) => sum+s.minutes,0);
  openModal('stats', `<div class="modal-eyebrow">LITTLE MOMENTS, LASTING GROWTH</div><h2>时光有迹可循</h2><p class="modal-subtitle">那些认真度过的分钟，都在这里悄悄发光。</p><div class="stats-grid"><div class="stat-box"><span>今日专注</span><strong>${today.minutes}<small>分钟</small></strong></div><div class="stat-box"><span>今日完成</span><strong>${today.count}<small>个目标</small></strong></div><div class="stat-box"><span>累计专注</span><strong>${totalMinutes}<small>分钟</small></strong></div></div><h3>最近七天 <span style="float:right;color:#a1ac90;font-size:10px">共 ${week.reduce((s,d)=>s+d.minutes,0)} 分钟</span></h3><div class="week-chart" role="img" aria-label="最近七日专注时长：${week.map(d=>`${d.label} ${d.minutes}分钟`).join('，')}">${week.map(d=>`<div class="bar-group ${d.today?'today':''}"><span class="bar-value">${d.minutes}</span><div class="bar" style="height:${Math.max(2,d.minutes/max*115)}px"></div><span class="bar-label">${d.today?'今天':d.label}</span></div>`).join('')}</div><h3>专注足迹 <span style="float:right;color:#a1ac90;font-size:10px">最近 50 次</span></h3>${state.sessions.length?`<div class="session-list">${[...state.sessions].sort((a,b)=>b.completedAt-a.completedAt).slice(0,50).map(s=>`<div class="session-row"><div><strong>${esc(s.task)}</strong><small>${new Date(s.completedAt).toLocaleString('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small></div><span>${s.minutes} 分钟 · +${s.points} 点</span></div>`).join('')}</div>`:'<div class="empty-state">你的第一段专注时光，还在等待开始。<br>不必很多，认真度过一分钟也很好。</div>'}`);
}
function openCatalog() {
  const level = cityStats(state).level;
  openModal('catalog', `<div class="modal-eyebrow">YOUR TOWN, YOUR POSSIBILITIES</div><h2>小城的无限可能</h2><p class="modal-subtitle">13 种设施，慢慢收集一座完整的城市。当前 Lv.${level} · ${CATALOG.filter(x=>x.level<=level).length} 种已解锁</p><div class="catalog-grid">${CATALOG.map(item=>`<article class="catalog-item ${item.level>level?'locked':''}"><span class="catalog-tag">${item.category}</span><canvas class="building-icon" data-building="${item.id}" aria-hidden="true"></canvas><h3>${item.name}</h3><p>${item.description}</p><small>人口 +${item.population} · GDP +${item.gdp}</small><footer><span>${item.cost} 专注点</span><small>Lv.${item.level} ${item.level>level?'解锁':'已解锁'}</small></footer><button data-catalog-build="${item.id}">${item.level>level?'查看升级条件':'选择建造 →'}</button></article>`).join('')}</div>`);
}
function openLevels() {
  const stats = cityStats(state);
  openModal('levels', `<div class="modal-eyebrow">ONE STEP AT A TIME</div><h2>让小镇，慢慢长大</h2><p class="modal-subtitle">人口或 GDP 达到任意一项条件即可升级。已解锁的设施会一直为你保留。</p><div class="stats-grid"><div class="stat-box"><span>当前等级</span><strong>${stats.level}</strong></div><div class="stat-box"><span>小镇人口</span><strong>${stats.population}</strong></div><div class="stat-box"><span>城市 GDP</span><strong>${stats.gdp}</strong></div></div>${LEVELS.map(l=>`<div class="milestone"><span class="level-medallion">${l.level}</span><div><h3>${l.title}</h3><p>${l.level===1?'一片土地，一个全新的开始':`人口 ${l.population} 人 / GDP ${l.gdp}，满足一项`}<br>解锁：${CATALOG.filter(x=>x.level===l.level).map(x=>x.name).join('、')}</p></div>${l.level<=stats.level?'<span class="achieved">已抵达 ✓</span>':''}</div>`).join('')}`);
}
function openFocusSpace() {
  openModal('focus', `<div class="focus-space"><div class="modal-eyebrow">JUST YOU AND THIS MOMENT</div><div class="focus-decoration">✧ ❧ ✧</div><h2 id="spaceTask"></h2><div class="large-timer" id="spaceTimer"></div><p class="modal-subtitle" id="spaceStatus"></p><div class="modal-actions"><button class="primary-button" id="spaceStart" data-action="focus-toggle"></button><button class="secondary-button" data-action="close">回到小镇</button></div><p class="inline-note">完成 ${state.focus?state.focus.duration/60:chosenMinutes} 分钟，将收获同等数量的专注点。<br>暂停会保留进度；浏览器刷新后会继续计时。</p></div>`);
  updateClock();
}
function openSettings() {
  openModal('settings', `<div class="modal-eyebrow">MAKE YOURSELF AT HOME</div><h2>关于你的小镇</h2><p class="modal-subtitle">给这里起一个名字，留下一份属于自己的时光。</p><form id="settingsForm"><div class="field"><label for="cityNameInput">小镇名字</label><input id="cityNameInput" value="${esc(state.cityName)}" maxlength="24" required></div><button class="primary-button" type="submit">保存名字</button></form><div class="settings-row"><div><strong>带走这段时光</strong><p>导出城市、专注记录和当前计时进度。</p></div><button class="secondary-button" data-action="export">导出存档</button></div><div class="settings-row"><div><strong>回到熟悉的小镇</strong><p>导入存档会替换此浏览器的现有进度。</p></div><button class="secondary-button" data-action="import">导入存档</button></div><p class="inline-note">当前为本地存档模式，不会自动跨设备同步。更换浏览器或清理网站数据前，记得导出一份备份。<br>世界种子：${state.seed} · 版本 0.1</p>`);
}
function openHelp() {
  openModal('help', `<div class="modal-eyebrow">WELCOME TO FOREST & FOCUS</div><h2>从一段专注开始</h2><p class="modal-subtitle">在森屿，时间不是催促你的指针，而是让城市生长的种子。</p><ol class="help-steps"><li><div><strong>给自己一个小目标</strong><p>填写任务，选择 1–240 分钟。完整完成后，每分钟获得 1 专注点。暂停不计时，提前结束不发放奖励。</p></div></li><li><div><strong>把用心变成风景</strong><p>选中设施后，点击草地或林地建设。第一间林间小屋需要 15 点。山地和水面不能直接建设，港口需要紧邻水面的陆地。</p></div></li><li><div><strong>让生活在这里发生</strong><p>道路上会有散步的居民，港口旁会有来访的帆船。人口或 GDP 达标后自动升级，解锁医院、学校、工厂和机场。</p></div></li><li><div><strong>慢慢探索，不必着急</strong><p>拖动探索世界，滚轮或右侧按钮缩放。选择拆除工具可返还一半点数（向下取整）。Esc 退出建造。地图获得焦点后，也可用方向键选地块、回车建设。</p></div></li></ol><p class="inline-note">这是森屿的第一版：经济数值由设施累计，居民与船只为环境动画。所有进度自动保存在此浏览器，点击左下角头像可以导出备份。</p>`);
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
  a.href=url; a.download=`森屿存档-${new Date().toISOString().slice(0,10)}.json`; a.click();
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
$('openCatalog').addEventListener('click',openCatalog);
$('viewStats').addEventListener('click',openStats);
$('cityNameButton').addEventListener('click',openSettings);
$('levelButton').addEventListener('click',openLevels);
$('pointsButton').addEventListener('click',()=>toast('每完成 1 分钟专注，获得 1 专注点。用它建造自己的城市。'));
$('soundButton').addEventListener('click',toggleSound);
$('soundSettings').addEventListener('click',openSound);
$('closeModal').addEventListener('click',closeModal);
$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
$('modal').addEventListener('cancel',()=>{modalType=null;document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav==='city'));});
document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>{({city:closeModal,focus:openFocusSpace,stats:openStats,catalog:openCatalog,settings:openSettings,help:openHelp})[b.dataset.nav]?.();}));
$('modalContent').addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.catalogBuild){const item=CATALOG.find(x=>x.id===b.dataset.catalogBuild);if(item.level>cityStats(state).level)openLevels();else{closeModal();selectTool(item.id);}return;}
  if(b.dataset.sound){musicMode=b.dataset.sound;if(sound.active)await sound.setMode(musicMode);setText('soundLabel',({forest:'林间白噪音',rain:'窗外细雨',piano:'午后轻琴'})[musicMode]);openSound();return;}
  switch(b.dataset.action){
    case 'close':case 'reward-close':closeModal();break;
    case 'focus-toggle':focusAction();break;
    case 'cancel-focus':{if(checkCompletion())break;const result=cancelFocus(state);if(!result.ok){toast(result.message,true);break;}if(!persist())break;render();closeModal();toast(result.message);break;}
    case 'export':exportSave();break;
    case 'import':$('importFile').click();break;
    case 'sound-toggle':await toggleSound();break;
    case 'remove-building':{const result=demolishAt(state,Number(b.dataset.x),Number(b.dataset.y));if(!result.ok){toast(result.message,true);break;}if(!persist())break;render();closeModal();toast(result.message);break;}
    case 'confirm-import':{if(!pendingImport)break;state=pendingImport;pendingImport=null;syncDurationFromState(true);selectedTool=null;world.setTool(null);if(!persist())break;render();world.center();closeModal();toast('欢迎回来，存档已恢复。');checkCompletion();break;}
  }
});
$('modalContent').addEventListener('submit',event=>{if(event.target.id!=='settingsForm')return;event.preventDefault();const name=$('cityNameInput').value.trim();if(!name)return;state.cityName=name.slice(0,24);if(!persist())return;render();closeModal();toast('小镇有了一个好听的名字。');});
$('modalContent').addEventListener('input',event=>{if(event.target.id==='volumeControl'){volume=Number(event.target.value);sound.setVolume(volume);}});
let pendingImport=null;
$('importFile').addEventListener('change',async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  if(file.size>20*1024*1024)return toast('存档过大，请使用 20 MB 以内的 JSON 文件。',true);
  try{const result=validateSave(JSON.parse(await file.text()));if(!result.ok)return toast(result.message,true);pendingImport=result.state;const stats=cityStats(pendingImport);openModal('import',`<div class="modal-eyebrow">WELCOME BACK</div><h2>恢复「${esc(pendingImport.cityName)}」？</h2><p class="modal-subtitle">这份存档包含 ${stats.buildingCount} 座设施、${pendingImport.sessions.length} 条专注记录，以及 ${pendingImport.points} 专注点。<br>导入后将替换当前进度，建议先导出当前存档。</p><div class="modal-actions"><button class="secondary-button" data-action="export">先导出当前存档</button><button class="primary-button" data-action="confirm-import">恢复这份存档</button></div>`);}catch{toast('无法读取这个存档，请选择有效的 JSON 文件。',true);}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('modal').open&&selectedTool){selectTool(null);}});
window.addEventListener('storage',event=>{
  if(event.key!==STORAGE_KEY&&event.key!==null)return;
  state=loadState();syncDurationFromState(true);render();
  if(modalType==='stats')openStats();
  if(modalType==='catalog')openCatalog();
  if(modalType==='levels')openLevels();
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkCompletion();render();}});
const now=new Date();
setText('dateLabel',now.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'}));
setText('greeting',now.getHours()<12?'早安，给自己一点生长的时间':now.getHours()<18?'午后好，给自己一点生长的时间':'晚上好，给自己一点安静的时间');
render();
// Persist a fresh world's seed immediately; an offline completion settles first.
if (!checkCompletion()) persist();
setText('zoomLabel',Math.round(world.getView().zoom*100)+'%');
setInterval(()=>{if(!checkCompletion())updateClock();},500);
