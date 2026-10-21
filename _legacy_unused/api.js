// ============================================================
// 角色日记 插件 v2.0.0 — API 调用层
// 路径: SillyTavern/extensions/character-diary/api.js
// ============================================================
'use strict';

/**
 * 统一入口: 根据 settings.source 路由到对应 API 实现
 * @param {Array<{role:string,content:string}>} messages
 * @param {object} s - settings
 * @returns {Promise<string>} AI 返回的文本
 */
async function cdApiComplete(messages, s) {
  switch (s.source) {
    case 'tavern': return callTavern(messages, s);
    case 'openai': return callOpenAI(messages, s.endpoints.openai, s);
    case 'claude': return callClaude(messages, s.endpoints.claude, s);
    case 'gemini': return callGemini(messages, s.endpoints.gemini, s);
    default: throw new Error('未知接口来源: ' + s.source);
  }
}

/** 跟随酒馆当前连接 */
async function callTavern(messages, _s) {
  const ordered = messages.map(m => ({ role: m.role, content: m.content }));
  if (typeof generateRaw === 'function') {
    return await generateRaw({ ordered_prompts: ordered, should_stream: false });
  }
  return await generate({
    user_input: ordered.map(m => m.content).join('\n\n'),
    should_stream: false,
    overrides: {
      char_description: '', char_personality: '', scenario: '',
      world_info_before: '', world_info_after: '', dialogue_examples: '',
      chat_history: { with_depth_entries: false, prompts: [] },
    },
  });
}

async function callOpenAI(messages, ep, s) {
  const base = ep.url.replace(/\/+$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ep.key}` },
    body: JSON.stringify({ model: ep.model, messages, temperature: s.temperature, max_tokens: 8192, stream: false }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await textOr(res)}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? '';
}

async function callClaude(messages, ep, s) {
  const base = ep.url.replace(/\/+$/, '');
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const msgs = messages.filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  const res = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ep.key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: ep.model, system, messages: msgs, max_tokens: 8192, temperature: s.temperature }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await textOr(res)}`);
  const j = await res.json();
  return (j.content || []).map(p => p.text || '').join('');
}

async function callGemini(messages, ep, s) {
  const base = ep.url.replace(/\/+$/, '');
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const contents = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }],
  }));
  const body = {
    contents,
    generationConfig: { temperature: s.temperature, maxOutputTokens: 8192 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_NONE' },
    ],
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const url = `${base}/models/${encodeURIComponent(ep.model)}:generateContent?key=${encodeURIComponent(ep.key)}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await textOr(res)}`);
  const j = await res.json();
  return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
}

/** 拉取模型列表 (非酒馆接口时使用) */
async function cdFetchModels(source, ep) {
  const base = ep.url.replace(/\/+$/, '');
  try {
    if (source === 'openai') {
      const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${ep.key}` } });
      const j = await r.json();
      return (j.data || []).map(m => m.id);
    }
    if (source === 'claude') {
      const r = await fetch(`${base}/models`, { headers: { 'x-api-key': ep.key, 'anthropic-version': '2023-06-01' } });
      const j = await r.json();
      return (j.data || []).map(m => m.id);
    }
    if (source === 'gemini') {
      const r = await fetch(`${base}/models?key=${encodeURIComponent(ep.key)}`);
      const j = await r.json();
      return (j.models || []).map(m => (m.name || '').replace(/^models\//, ''));
    }
  } catch (e) {
    toastr.error('[角色日记] 拉取模型列表失败: ' + e.message);
  }
  return [];
}

function textOr(res) { return res.text().then(t => t.slice(0, 200)); }