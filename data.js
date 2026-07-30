// ============================================================
// 角色日记 插件 v2.0.0 — 数据合并 & 世界书同步
// 路径: SillyTavern/extensions/character-diary/data.js
// ============================================================
'use strict';

/* ============================== settings 读写 ============================== */
function cdGetSettings() {
  if (!extension_settings[PLUGIN_ID]) extension_settings[PLUGIN_ID] = Object.assign({}, DEFAULT_SETTINGS);
  return extension_settings[PLUGIN_ID];
}

function cdSaveSettings(patch) {
  Object.assign(cdGetSettings(), patch);
  saveSettingsDebounced();
}

/* ============================== 本局数据 (chat variables) ============================== */
async function cdGetData() {
  try {
    const c = (await getVariables({ type: 'chat' })) || {};
    return Object.assign(emptyData(), c[PLUGIN_ID] || {});
  } catch (_) {
    return emptyData();
  }
}

async function cdSaveData(data) {
  try {
    await insertOrAssignVariables({ [PLUGIN_ID]: data }, { type: 'chat' });
  } catch (e) {
    cdWarn('保存本局数据失败', e);
  }
}

/* ============================== 楼层工具 ============================== */
function getLastFloorId() {
  try {
    const id = getLastMessageId();
    if (typeof id === 'number' && id >= 0) return id;
  } catch (_) {}
  try {
    if (typeof SillyTavern !== 'undefined' && Array.isArray(SillyTavern.chat))
      return SillyTavern.chat.length - 1;
  } catch (_) {}
  return -1;
}

async function cdGetAiFloors() {
  const lastId = getLastFloorId();
  if (lastId < 0) return [];
  try {
    const all = (await getChatMessages(`0-${lastId}`)) || [];
    return all.filter(m => m && m.role === 'assistant' && !m.is_hidden && !m.is_system);
  } catch (_) {
    return [];
  }
}

/** 返回上次记录之后新增的 AI 楼层 */
async function cdGetNewFloors(data) {
  const floors = await cdGetAiFloors();
  return floors.filter(m => m.message_id > (data.lastFloor ?? -1));
}

/* ============================== 合并: 日记 ============================== */
function mergeDiaries(data, npcs, windowFloors, s) {
  const topFloor = windowFloors.length
    ? windowFloors[windowFloors.length - 1].message_id
    : data.lastFloor;

  for (const npc of npcs) {
    if (!npc || !npc.name) continue;
    const name = String(npc.name).trim();
    if (!name) continue;

    // 别名归并
    let mainName = name;
    for (const [m, al] of Object.entries(data.aliases || {})) {
      if ((al || []).includes(name) || m === name) { mainName = m; break; }
    }

    // 路人转正逻辑
    const isMinor = npc.is_minor === true;
    if (data.promoted[mainName]) {
      // 已是正式角色
    } else if (!isMinor) {
      data.promoted[mainName] = true;
    } else {
      data.cameo[mainName] = (data.cameo[mainName] || 0) + 1;
      if (data.cameo[mainName] >= (s.cameoThreshold || 3)) {
        data.promoted[mainName] = true;
      } else {
        continue; // 路人, 跳过
      }
    }

    // 补充别名
    const incomingAliases = Array.isArray(npc.aliases) ? npc.aliases.map(String) : [];
    data.aliases[mainName] = Array.from(new Set([...(data.aliases[mainName] || []), ...incomingAliases]));

    if (!data.diaries[mainName]) data.diaries[mainName] = [];
    data.diaries[mainName].push({
      turn: npc.turn ?? topFloor,
      date: npc.date || '',
      entry: npc.entry || '',
      mood: npc.mood || '',
      attitude_to_user: npc.attitude_to_user || '',
      secret: npc.secret || '',
      key_events: Array.isArray(npc.key_events) ? npc.key_events : [],
      relationship_with_others: npc.relationship_with_others || {},
      message_id: topFloor,
    });
  }
  data.lastFloor = Math.max(data.lastFloor ?? -1, topFloor);
  return data;
}

/* ============================== 合并: 关系 ============================== */
function mergeRelations(data, relList) {
  if (!data.relations) data.relations = {};
  for (const r of relList) {
    if (!r || !r.from || !r.to) continue;
    const from = String(r.from).trim();
    const to = String(r.to).trim();
    if (!from || !to || from === to) continue;
    if (!data.relations[from]) data.relations[from] = {};
    data.relations[from][to] = {
      type: r.type || '',
      attitude: ['positive', 'negative', 'neutral'].includes(r.attitude) ? r.attitude : 'neutral',
      note: r.note || '',
    };
  }
  return data;
}

/* ============================== 世界书同步 ============================== */
function sanitizeName(name) {
  let n = String(name || 'character');
  n = n.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
  n = n.slice(0, 20);
  return n || 'character';
}

function cdWbName() {
  const raw = (typeof SillyTavern !== 'undefined' && SillyTavern.name2)
    ? SillyTavern.name2 : 'character';
  return sanitizeName(raw) + WB_SUFFIX;
}

async function cdEnsureWorldbook() {
  const name = cdWbName();
  const names = (await getWorldbookNames()) || [];
  if (!names.includes(name)) {
    try { await createWorldbook(name, []); } catch (e) {
      cdWarn('createWorldbook:', e && e.message);
    }
  }
  const bind = await getCharWorldbookNames('current');
  const additional = Array.isArray(bind.additional) ? bind.additional.slice() : [];
  if (!additional.includes(name)) {
    additional.push(name);
    await rebindCharWorldbooks('current', { primary: bind.primary, additional });
  }
  return name;
}

function formatEntryForWb(npc, e) {
  return [
    `【${npc}的日记 · ${e.date || '第' + e.turn + '楼'}】`,
    e.entry,
    e.mood ? `(心情: ${e.mood})` : '',
    e.attitude_to_user ? `(对用户: ${e.attitude_to_user})` : '',
    e.secret ? `(心声: ${e.secret})` : '',
    (e.key_events && e.key_events.length) ? `(关键事件: ${e.key_events.join('; ')})` : '',
  ].filter(Boolean).join('\n');
}

async function cdSyncWorldbook(data) {
  const name = await cdEnsureWorldbook();
  const entries = [];
  let order = 100;
  for (const [npc, list] of Object.entries(data.diaries)) {
    if (!list.length) continue;
    const aliases = data.aliases[npc] || [];
    const keys = Array.from(new Set([npc, ...aliases]));
    const last = list[list.length - 1];
    entries.push({
      name: `${npc} · 最新日记`,
      enabled: true,
      strategy: { type: 'constant', keys: [], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
      position: { type: 'at_depth', role: 'system', depth: 4, order: order++ },
      content: formatEntryForWb(npc, last),
    });
    const archive = list.slice(0, -1);
    if (archive.length) {
      entries.push({
        name: `${npc} · 日记存档`,
        enabled: true,
        strategy: { type: 'selective', keys, keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
        position: { type: 'at_depth', role: 'system', depth: 4, order: order++ },
        content: archive.map(e => formatEntryForWb(npc, e)).join('\n\n---\n\n'),
      });
    }
  }
  await createOrReplaceWorldbook(name, entries);
}

/** 楼层回滚: 当聊天楼层被删除/撤回时, 移除 >= floor 的日记条目 */
async function cdRollbackFrom(floor) {
  const data = await cdGetData();
  let changed = false;
  for (const [npc, list] of Object.entries(data.diaries)) {
    const kept = list.filter(e => (e.message_id ?? -1) < floor);
    if (kept.length !== list.length) {
      changed = true;
      const removed = list.length - kept.length;
      data.cameo[npc] = Math.max(0, (data.cameo[npc] || 0) - removed);
      if (kept.length === 0) {
        delete data.diaries[npc];
        data.promoted[npc] = false;
      } else {
        data.diaries[npc] = kept;
      }
    }
  }
  if (changed) {
    let maxFloor = -1;
    for (const list of Object.values(data.diaries)) {
      for (const e of list) maxFloor = Math.max(maxFloor, e.message_id ?? -1);
    }
    data.lastFloor = maxFloor;
    await cdSaveData(data);
    await cdSyncWorldbook(data);
  }
}