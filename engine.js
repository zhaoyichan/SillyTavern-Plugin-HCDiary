// ============================================================
// 角色日记 插件 v2.0.0 — 日记引擎 (核心流程)
// 路径: SillyTavern/extensions/character-diary/engine.js
// ============================================================
'use strict';

/** 互斥锁 — 防止并发生成导致数据损坏 */
let cdBusy = false;
let cdPending = false;  // 当锁住时又收到触发信号, 标记"完成后再跑一轮"

/**
 * 执行一次日记 + 关系生成。
 * @param {{ manual?: boolean, silent?: boolean }} opts
 *   manual: true = 用户手动触发, 即使 enabled=false 也运行
 *   silent: true = 不弹 toastr 提示 (用于自动触发)
 */
async function cdRunDiary({ manual = false, silent = false } = {}) {
  if (cdBusy) {
    if (manual) { toastr.info('正在写, 请稍候'); cdPending = true; }
    return;
  }

  const s = cdGetSettings();
  if (!s.enabled && !manual) return;

  let data = await cdGetData();
  let windowFloors = await cdGetNewFloors(data);

  if (!windowFloors.length) {
    if (manual && !silent) toastr.info('没有新楼层需要写日记');
    return;
  }

  if (windowFloors.length > (s.maxWindowFloors || 40))
    windowFloors = windowFloors.slice(-(s.maxWindowFloors || 40));

  cdBusy = true;
  try {
    if (!silent) toastr.info(`开始写日记 (${windowFloors.length} 个新楼层)...`);

    // 并发: 日记 + 关系 + 剧情档案
    const diaryMsgs    = cdBuildDiaryPrompt(windowFloors, data, s);
    const relMsgs      = cdBuildRelationPrompt(windowFloors, data, s);
    const archiveMsgs  = cdBuildArchivePrompt(windowFloors, data, s);
    const [diaryRes, relRes, archiveRes] = await Promise.allSettled([
      cdApiComplete(diaryMsgs, s),
      cdApiComplete(relMsgs, s),
      cdApiComplete(archiveMsgs, s),
    ]);

    let diaryOk   = false;
    let relOk     = false;
    let archiveOk = false;

    // 处理日记
    if (diaryRes.status === 'fulfilled') {
      try {
        const npcs = parseDiaryJson(diaryRes.value);
        data = mergeDiaries(data, npcs, windowFloors, s);
        diaryOk = true;
      } catch (e) {
        cdWarn('日记解析失败', e);
        if (manual) toastr.error('日记生成失败: ' + e.message);
      }
    } else {
      if (manual) toastr.error('日记请求失败: ' + (diaryRes.reason && diaryRes.reason.message));
    }

    // 处理关系 (独立)
    if (relRes.status === 'fulfilled') {
      try {
        const rels = parseRelationJson(relRes.value);
        data = mergeRelations(data, rels);
        relOk = true;
      } catch (e) {
        cdWarn('关系解析失败', e);
        if (manual) toastr.warning('关系更新失败 (日记不受影响)');
      }
    } else {
      if (manual) toastr.warning('关系请求失败 (日记不受影响)');
    }

    // 处理剧情档案 (独立)
    if (archiveRes.status === 'fulfilled') {
      try {
        const arc = parseArchiveJson(archiveRes.value);
        if (!data.archive) data.archive = Object.assign({}, emptyData().archive);
        // 只有 AI 返回了非空内容才覆盖对应字段，否则保留旧值
        if (arc.mainline !== undefined && arc.mainline !== '')   data.archive.mainline   = arc.mainline;
        if (arc.sideline !== undefined && arc.sideline !== '')   data.archive.sideline   = arc.sideline;
        if (arc.states !== undefined && arc.states !== '')       data.archive.states     = arc.states;
        if (arc.unresolved !== undefined && arc.unresolved !== '') data.archive.unresolved = arc.unresolved;
        archiveOk = true;
      } catch (e) {
        cdWarn('剧情档案解析失败', e);
        if (manual) toastr.warning('剧情档案更新失败 (日记不受影响)');
      }
    } else {
      if (manual) toastr.warning('剧情档案请求失败 (日记不受影响)');
    }

    // 保存
    if (diaryOk || relOk || archiveOk) {
      await cdSaveData(data);
      if (diaryOk) await cdSyncWorldbook(data);
      if (!silent) {
        const tips = [];
        if (diaryOk) tips.push('日记已更新');
        if (relOk) tips.push('关系已更新');
        if (archiveOk) tips.push('剧情档案已更新');
        toastr.success(tips.join(' · '));
      } else {
        cdLog('自动日记完成');
      }
    }
  } catch (e) {
    cdWarn('runDiary 异常', e);
    if (manual && !silent) toastr.error('写日记失败: ' + e.message);
  } finally {
    cdBusy = false;
    // 如果在忙期间又收到触发, 再跑一次
    if (cdPending) {
      cdPending = false;
      cdRunDiary({ manual: false, silent: true });
    }
  }
}

/**
 * 消息接收回调: 判断是否达到触发间隔, 是则自动写日记
 */
async function cdOnMessageReceived() {
  const s = cdGetSettings();
  if (!s.enabled) return;
  const data = await cdGetData();
  const newCount = (await cdGetNewFloors(data)).length;
  if (newCount >= (s.interval || 5)) {
    cdLog('自动触发: 新楼层数', newCount, '>=', s.interval);
    await cdRunDiary({ manual: false, silent: true });
  }
}

/**
 * 消息删除/撤回回调
 */
async function cdOnMessageDeleted(floor) {
  await cdRollbackFrom(floor);
}