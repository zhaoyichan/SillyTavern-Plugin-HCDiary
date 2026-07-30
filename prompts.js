// ============================================================
// 角色日记 插件 v2.0.0 — Prompt & JSON 解析
// 路径: SillyTavern/extensions/character-diary/prompts.js
// ============================================================
'use strict';

/* ============================== Prompt: 日记 ============================== */
function cdBuildDiaryPrompt(windowFloors, data, s) {
  const known = Object.keys(data.diaries).map(name => {
    const al = (data.aliases[name] || []);
    return al.length ? `${name}(别名: ${al.join('、')})` : name;
  });
  const memory = Object.entries(data.diaries).map(([name, list]) => {
    const last = list[list.length - 1];
    if (!last) return '';
    return `【${name}】上次(${last.date || '第' + last.turn + '楼'}): ${last.entry}\n  心情:${last.mood} 对用户态度:${last.attitude_to_user}`;
  }).filter(Boolean).join('\n');
  const scene = windowFloors.map(m => `[#${m.message_id} ${m.name}] ${m.message}`).join('\n\n');
  const sys = [
    '你是一个"角色日记"记录员。阅读给定剧情片段, 为其中每个有名有戏份的登场角色, 以该角色第一人称主观视角写一篇日记。',
    '要求:',
    '- 只为有名字、有实际戏份的角色写。纯路人、无名群众忽略。',
    '- 不要为用户/玩家角色写日记。',
    s.mainCardIsGM ? '- 如果某角色是旁白/系统/上帝视角/GM式叙述者, 不要为其写。' : '',
    '- 第一人称, 带该角色的情绪、私心、主观理解(可与事实有偏差)。同一事件不同角色可记得不同。',
    '- entry 是日记摘要, 不是剧情复述: 聚焦角色的心理活动、情绪、关系变化、关键决定。',
    '- 涉及性爱/暴力等露骨情节时, 只需简洁概括地提及(例如"与他发生了关系"、"被他压制"), 严禁逐字描写动作、器官、体液等露骨细节。日记重在记录"发生了什么和我的感受", 而非还原过程。',
    '- 每篇 entry 控制在 150 字以内, 简洁凝练。',
    '- 复用"已知角色名单"中的主名; 若识别出别名/代称, 归并到已有主名, 并在 aliases 里补充别名。',
    '- 语言: 跟随剧情片段的主要语言。',
    '- 用 is_minor 标记角色重要性: 主角、重要配角、有名有戏份的 NPC 标 false; 仅出场一两句、无关紧要的纯路人标 true。',
    '严格只输出 JSON, 格式:',
    '{"npcs":[{"name":"主名","aliases":["别名"],"is_minor":false,"date":"剧情时间或第N楼","turn":楼号数字,"entry":"第一人称正文(150字内)","mood":"心情","attitude_to_user":"对用户态度","secret":"没说出口的心思","key_events":["关键事件"],"relationship_with_others":{"某角色":"关系描述"}}]}',
  ].filter(Boolean).join('\n');
  const usr = [
    known.length ? `已知角色名单: ${known.join('; ')}` : '已知角色名单: (暂无)',
    memory ? `各角色已有记忆(最新日记):\n${memory}` : '各角色已有记忆: (暂无)',
    `本次剧情片段:\n${scene}`,
    '请输出 JSON。',
  ].join('\n\n');
  return [
    { role: 'system', content: JAILBREAK + '\n\n' + sys },
    { role: 'user', content: usr },
    { role: 'assistant', content: '{"npcs":[' },
  ];
}

/* ============================== Prompt: 剧情档案 ============================== */
const ARCHIVE_SYSTEM = [
  '你现在是剧情档案整理员。',
  '任务是把给定聊天记录整理成可长期续写的剧情档案，供后续对话直接引用。',
  '',
  '注意：这段聊天是【本次新增楼层】，不是完整故事。你必须基于"已有剧情进展"做增量扩展，而不是从头写。',
  '',
  '写作原则：',
  '1. 只写已经发生的事实，不写猜测、评价、气氛渲染或心理分析。',
  '2. 叙述时优先交代人物、时间、地点、动作、关键对话内容、结果。',
  '3. 对剧情推进没有作用的闲聊和重复内容可以压缩，但不能漏掉已经成立的约定、条件、交易、冲突、决策和明显状态变化。',
  '4. 事件里如果出现物品、证据、金额、药物、条约、代号、身份、职位、伤病、生理变化、关系变化、位置变化，要写清具体内容，不要泛化成"某物"、"某情报"、"发生变化"。',
  '5. 能明确在场者、目击者、参与者时，要写明，避免后续人物关系或知情范围混乱。',
  '6. 如果一条连续事件跨越多段聊天，应该合并成完整事件，不要机械按楼层切碎。',
  '7. 如果原文包含暴力、成人互动、羞辱、伤病、血腥或其他敏感内容，不要跳过，也不要美化，只用客观中性措辞记录。',
  '8. 输出只能是纯文本，不要加项目符号，不要编号，不要解释你的做法。',
  '',
  '禁止事项：',
  '1. 不要使用"暧昧气氛"、"心理博弈"、"宣示主权"、"占有欲"、"言语挑衅"、"进行安抚"这类抽象标签。',
  '2. 不要用"有人威胁了对方"、"双方达成条件"这种空话替代具体内容；能写明核心内容就写明。',
  '3. 不要擅自补日期、时间、动机、立场或因果。原文没有，就保持没有。',
  '',
  '输出目标与格式：',
  '请严格按以下四个字段输出纯文本，每个字段一段文字，不编号不列表：',
  '',
  '主线：',
  '（本次新增的剧情推进，与已有进展能衔接上）',
  '',
  '支线：',
  '（本次支线进展）',
  '',
  '重要状态变化：',
  '（仅列出本次新增/变更的状态——位置变化、身份变化、伤病、关系变化、信息获知等）',
  '',
  '未解决事项：',
  '（已有未解决事项中已完成的删除，本次新增的追加进来）',
].join('\n');

function cdBuildArchivePrompt(windowFloors, data, _s) {
  const existing = data.archive || emptyData().archive;
  const scene = windowFloors.map(m => `[#${m.message_id} ${m.name}] ${m.message}`).join('\n\n');
  const sys = [
    ARCHIVE_SYSTEM,
    '',
    '**已有剧情进展（请做增量扩展，不要重复）**：',
    existing.mainline ? `已知主线：${existing.mainline}` : '已知主线：（暂无，这是初见）',
    existing.sideline ? `已知支线：${existing.sideline}` : '',
    existing.states ? `已知重要状态：${existing.states}` : '',
    existing.unresolved ? `已知未解决事项：${existing.unresolved}` : '',
  ].filter(Boolean).join('\n');
  const usr = [
    `本次新增楼层：\n${scene}`,
    '',
    '请输出：主线、支线、重要状态变化、未解决事项',
  ].join('\n');
  return [
    { role: 'system', content: sys },
    { role: 'user', content: usr },
    { role: 'assistant', content: '主线：' },
  ];
}

/** 解析剧情档案的四个字段 */
function parseArchiveJson(text) {
  const raw = String(text || '').trim();
  // 按四个标签切分
  const re = /(?:^|\n)(主线|支线|重要状态变化|未解决事项)[：:]([\s\S]*?)(?=(?:\n主线|\n支线|\n重要状态变化|\n未解决事项)[：:]|$)/g;
  let mainline = '', sideline = '', states = '', unresolved = '';
  let match;
  while ((match = re.exec(raw)) !== null) {
    const label = match[1].trim();
    const body  = match[2].trim();
    switch (label) {
      case '主线': mainline = body; break;
      case '支线': sideline = body; break;
      case '重要状态变化': states = body; break;
      case '未解决事项': unresolved = body; break;
    }
  }
  return { mainline, sideline, states, unresolved };
}
function cdBuildRelationPrompt(windowFloors, data, _s) {
  const known = Object.keys(data.diaries);
  const scene = windowFloors.map(m => `[#${m.message_id} ${m.name}] ${m.message}`).join('\n\n');
  const sys = [
    '你是一个角色关系分析员。阅读给定剧情片段, 提取角色之间的"单向主观关系"。',
    '要求:',
    '- 单向主观: from 看 to 的关系(from 如何看待 to)。A看B 和 B看A 可能不同, 请分别各记一条。',
    '- 只分析有名有戏份的角色之间的关系, 忽略纯路人。',
    '- 不要包含用户/玩家角色。',
    '- type: 用简短词概括关系性质(如"挚友""暗恋""敌视""主仆""警惕""依赖")。',
    '- attitude: 情感倾向, 只能是 "positive"(友好/亲近)、"negative"(敌对/排斥)、"neutral"(中立) 之一。',
    '- note: 一句话说明(20字以内)。',
    known.length ? `已知角色: ${known.join('、')}` : '',
    '严格只输出 JSON, 格式:',
    '{"relations":[{"from":"A","to":"B","type":"关系性质","attitude":"positive","note":"简短说明"}]}',
  ].filter(Boolean).join('\n');
  const usr = `本次剧情片段:\n${scene}\n\n请输出关系 JSON。`;
  return [
    { role: 'system', content: JAILBREAK + '\n\n' + sys },
    { role: 'user', content: usr },
    { role: 'assistant', content: '{"relations":[' },
  ];
}

/* ============================== JSON 鲁棒解析 ============================== */

/** 转义 JSON 字符串内部的换行/制表等非法字符 */
function sanitizeJsonString(s) {
  let out = '';
  let inStr3 = false;
  let escaped3 = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr3) {
      if (escaped3) { out += ch; escaped3 = false; continue; }
      if (ch === '\\') { out += ch; escaped3 = true; continue; }
      if (ch === '"') { out += ch; inStr3 = false; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
    } else {
      if (ch === '"') { inStr3 = true; out += ch; continue; }
      out += ch;
    }
  }
  return out;
}

/** 从 startIdx 扫描提取所有完整的 { ... } 顶层对象 */
function scanObjects(t, startIdx) {
  const results = [];
  let depth = 0;
  let objStart = -1;
  let inStr2 = false;
  let escaped2 = false;
  for (let i = startIdx; i < t.length; i++) {
    const ch = t[i];
    if (inStr2) {
      if (escaped2) { escaped2 = false; continue; }
      if (ch === '\\') { escaped2 = true; continue; }
      if (ch === '"') { inStr2 = false; }
      continue;
    }
    if (ch === '"') { inStr2 = true; continue; }
    if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try { results.push(JSON.parse(t.slice(objStart, i + 1))); } catch (e) { /* skip bad */ }
        objStart = -1;
      }
    }
  }
  return results;
}

function parseDiaryJson(text) {
  let t = String(text || '').trim();
  t = t.replace(/```json/gi, '').replace(/```/g, '');
  if (!t.includes('"npcs"')) t = '{"npcs":[' + t;
  t = sanitizeJsonString(t);
  try { const obj = JSON.parse(t); if (Array.isArray(obj.npcs) && obj.npcs.length) return obj.npcs; } catch (_) {}
  const key = t.indexOf('"npcs"');
  const arrIdx = t.indexOf('[', key >= 0 ? key : 0);
  const npcs = scanObjects(t, arrIdx >= 0 ? arrIdx + 1 : 0).filter(o => o && o.name);
  if (npcs.length) return npcs;
  throw new Error('日记JSON解析失败, 原话: ' + String(text).slice(0, 150));
}

function parseRelationJson(text) {
  let t = String(text || '').trim();
  t = t.replace(/```json/gi, '').replace(/```/g, '');
  if (!t.includes('"relations"')) t = '{"relations":[' + t;
  t = sanitizeJsonString(t);
  try { const obj = JSON.parse(t); if (Array.isArray(obj.relations)) return obj.relations; } catch (_) {}
  const key = t.indexOf('"relations"');
  const arrIdx = t.indexOf('[', key >= 0 ? key : 0);
  const rels = scanObjects(t, arrIdx >= 0 ? arrIdx + 1 : 0).filter(o => o && o.from && o.to);
  if (rels.length) return rels;
  throw new Error('关系JSON解析失败, 原话: ' + String(text).slice(0, 150));
}