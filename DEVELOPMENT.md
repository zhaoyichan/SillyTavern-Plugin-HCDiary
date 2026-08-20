# 📘 角色日记（HCDiary）· 开发中心文档

> **本文档是后续所有维护/开发 HCDiary 插件的一站式总入口。新对话接手时，先读本文档。**
> 最后更新：2026-08-21
> 当前版本：v2.7.5（含本次「手动压缩后主线/支线消失」修复）

---

## 📚 文档说明（新对话必读）

**本文件是唯一主文档**，已整合原工具区散落的 md（开发指南、世界书联动、工作流备忘、开发中心、仪式台复盘、负好感心得）的核心内容。**新对话接手只读本文件即可**，无需再翻旧 md。旧散落 md 文件保留作历史参考，但**一切以本文件为准**；后续所有改动一并记入本文件第六节「改动日志」。

---

## ⚠️ 致接手 AI 的一句话（务必先读）

**用户是「插件开发小白」**——TA 的描述往往模糊、凭直觉、口语化，甚至前后矛盾（例如"以前是可以的"可能指很久远的旧版本）。**接到需求时不要只按字面理解，要主动发散推断 TA 真正想要什么、问题真正出在哪**，必要时列表澄清后再动手。但也要**克制**：在没拿到证据前绝不瞎猜、绝不把能用功能改坏。

---

## 一、项目是什么

- 插件名：**角色日记（Character Diary）**，别名 HCDiary / `character-diary` / LIWE·RAG 记忆引擎
- 类型：**SillyTavern（ST）扩展插件**，跑在 **Tauri Tavern** 客户端（安卓）
- 仓库：`github.com/zhaoyichan/SillyTavern-Plugin-HCDiary`
- 功能：自动给剧情角色写第一人称日记、维护人物关系网、沉淀剧情档案、向量检索+Rerank、记忆注入、填表、仪式注入、全量迁移
- 架构：**单文件 `index.js`**（manifest.json 的 `js` 字段只加载它）；`data.js`/`engine.js`/`api.js`/`prompts.js`/`constants.js` 只是源码切片，**改它们不生效，必须改 `index.js`**

## 二、真实运行目录（数据存储）

```
/storage/emulated/0/Android/data/com.tauritavern.client/data/extensions/third-party/SillyTavern-Plugin-HCDiary/
```

- 插件实际被 ST 加载的 `index.js` 就在这里
- **访问方式**：`super_admin:shell`（Shizuku/Root）可读写 Android/data；`terminal`/proot **读不到**（Permission denied）
- **工作流**：改好文件 → 放到共享区（如 `/sdcard/Download/`）→ 用 `shell` `cp` 进真实目录 → **完全重启酒馆**才生效
- 开发副本（本目录）：`/storage/emulated/0/Download/酒馆插件开发/角色日记/SillyTavern-Plugin-HCDiary-main/index.js`

## 三、标准修改工作流（每次改代码都照做）

1. **先备份**：`shell` 在真实目录 `cp index.js index.js.bak_<原因>_<时间戳>`
2. **改开发副本**：`Download/酒馆插件开发/角色日记/SillyTavern-Plugin-HCDiary-main/index.js`（用 edit_file / Python 精准替换）
3. **语法验证**：`super_admin:terminal` 里 `node --check index.js`（必须 SYNTAX_OK）
4. **同步到运行目录**：`shell` `cp 开发副本 index.js`（真实目录）
5. **重启酒馆**：`shell` `am force-stop com.tauritavern.client && am start -n com.tauritavern.client/.MainActivity`（必须完全重启，非刷新）
6. **改完必须在本文档「改动日志」追加一条**（见第六节，这是硬性规范！）

## 四、发布到 GitHub（v2.7.5 后标准流程）

1. 在 Ubuntu terminal 用 **Contents API** 更新文件（大文件直接 base64 + PUT）：
   - 先 `GET contents/index.js` 拿当前 sha
   - 本地 `python3` 读文件 → base64 → 构造 `{message, content, sha}` payload → `PUT`
   - 大文件 payload 写到 `/tmp` 再用 `curl -d @payload`，避免命令行过长
2. **更新 tag**：把 tag `v2.7.x` 用 `PATCH /git/refs/tags/v2.7.x`（`force:true`）移动到新 commit，保证 Release 拿到最新版
3. **验证**：从 GitHub `GET contents` 拉回，`node --check` + `grep` 关键标记，确认字节数与本地一致
4. **清理**：删除临时 payload / 验证文件；token 使用后提醒轮换

> 版本号 4 处同步：`PLUGIN_VERSION` + UI 底部 `SillyTavern 插件 · vX.Y.Z` + `manifest.version` + CHANGELOG 最前新条目（别破坏 `];` 闭合）

## 五、本次会话核心收获（2026-08-21，v2.7.5）

### 1. 「手动压缩剧情档案却好像没生效」的真相
- **现象**：手动压缩后打印「剧情档案压缩融合完成」，但注入字符数纹丝不动（15550），以为没压缩。
- **真相**：压缩功能**本来是好的**。「压缩融合完成」这条日志是按钮回调成功路径打的，**只能证明函数没抛异常、不能证明内容真的替换**。真正证明「替换成功」的是 `cdCompressArchive` 里的 `自动压缩 xx: 旧→新 字` 日志——旧代码里**压缩失败时不打任何"自动压缩"日志、只安静打一句"完成"**，制造了"功能坏了"的假象。
- **教训**：**「完成」日志 ≠ 「生效」**。要判断功能是否真生效，必须看能证明"数据实际写入"的那条日志，而不是流程结束语。

### 2. 「剧情界面看不到主线/支线」的根因与修复（方案3，已发布）
- **根因**：剧情界面 `cdRenderArchive` 有两条渲染路径：
  - 时间线模式：`extractTimelineItems` **只认「以【时间】开头」的事件行**（`^【xx】内容`）
  - fallback 模式：无任何【时间】标记时，段落卡片展示
- **致命点**：只要**有一个字段**（如"未解决"）残留【时间】标记，就整页走时间线模式；而压缩后的「主线/支线」是**纯叙述、无【时间】标记** → 被 `if (!cat.items.length) continue;` 整组跳过 → **主线/支线消失**。
- **修复（方案3=治本+兜底）**：
  - **改压缩 Prompt**：强制要求「【时间标记】必须原样保留，每条事件仍以【时间】开头，一条一行；不得删改/合并时间标记，不得改写成无时间的连续叙述」→ 以后压缩主线/支线仍保留时间结构
  - **改渲染兜底**：时间线模式里，对「无时间标记但有文本」的分组，改为按段落卡片展示（不再 continue 跳过）→ 无论什么格式主线/支线都能看到
- **部署**：GitHub main = commit `ef6a9273`，tag v2.7.5 已更新指向该 commit，index.js（656269 字节，含 COMPRESS-DIAG 诊断）。

### 3. 加了诊断日志（COMPRESS-DIAG）用于取证
- `[COMPRESS-DIAG] AI 原始返回`：`res.text` 有没有、多长、前200字
- `[COMPRESS-DIAG] 解析结果 out`：每个字段解析出几字
- `[COMPRESS-DIAG] 回填成功/替换了 N 个字段`：实际写入了几个
- 方案 B：压缩失败时 `throw` 明确报错（不再假装成功）

### 4. 方法论沉淀（最重要）
- **发散思维**：小白用户描述含糊，要主动探测所有相关系统数据，**严禁无证据瞎猜**。
- **不越权**：用户说「给方案」就只给方案，别直接改；用户说「加诊断日志」就只加日志，别顺手重写逻辑。
- **「以前可以」要追问**：是"这次不行"还是"很久以前的行"？别因一句"以前可以"就去改一个其实没问题的解析器。
- **拿数据流反向验证**：界面错 → 存储对 → 源头（提示词/生成层）最可疑。参考「负好感修复」案例。
- **改完 node --check + grep 关键串确认 + cp 备份 + 完全重启**。

---

## 六、📝 改动日志（硬性规范：以后每次改动必须在此追加记录）

> **规则**：任何人（含 AI 新对话）改了 `index.js` / `style.css` / `manifest.json` 或发布了版本，**都必须在本节追加一条**，格式如下。不记日志 = 改动不算完成。

### 格式模板
```
#### YYYY-MM-DD · vX.Y.Z
- 改动文件：index.js
- 改动内容：...
- 根因/动机：...
- 验证：node --check ✅ / grep 关键串 ✅ / 运行副本已同步 ✅ / 酒馆已重启 ✅
- 运行目录：/storage/emulated/0/Android/data/com.tauritavern.client/data/extensions/third-party/SillyTavern-Plugin-HCDiary/
- GitHub：commit xxx / tag vX.Y.Z 已更新
- 备份：index.js.bak_xxx
```

### 历史记录

#### 2026-08-21 · v2.7.5（本次会话）
- 改动文件：index.js
- 改动内容：
  1. `cdCompressArchive` 压缩 Prompt 强制要求保留【时间标记】结构（每条事件仍以【时间】开头、一条一行，不得改写成无时间连续叙述）
  2. `cdRenderArchive` 时间线模式增加兜底：无【时间】标记但有文本的字段（主线/支线）以段落卡片展示，不再被跳过
  3. `cdCompressArchive` 加 COMPRESS-DIAG 诊断日志（AI原始返回/解析结果/回填成功）+ 失败 throw（方案B）
- 根因/动机：手动压缩后主线/支线在剧情界面消失（压缩把带【时间】标记的结构压成纯叙述，而"未解决"等字段残留时间标记使整页走时间线模式，纯叙述的主线/支线被过滤）
- 验证：node --check ✅ / grep 「【时间标记】必须原样保留」=1、「段落卡片兜底」=1、COMPRESS-DIAG=4 ✅ / 运行副本已同步 ✅ / 酒馆已重启 ✅
- GitHub：commit ef6a9273 / tag v2.7.5 已更新 ✅
- 备份：index.js.bak_compressdiag_*

#### 2026-08-20 · v2.7.5（此前会话，抓取即锁定）
- 改动文件：index.js
- 改动内容：方案A 治本修复「多入口触发导致的重复总结旧楼层」：
  - FIX-1 抓取即锁定（选定楼层后立即写入 processedFloors）
  - FIX-3 三游标对齐（lastFloor/_lastDiaryChatLength/_baselineChatLength）
  - FIX-2 失败回滚 + 成功路径清除锁定标记（window.__cdLockedBatch）
- 验证：node --check ✅ / 运行副本同步 ✅ / 酒馆重启 ✅
- GitHub：commit 3db4f51 / tag v2.7.5

---

## 七、核心技术档案（数据模型 / 运行机制）

### 1. 数据存储（核心 `data` 对象）
全部存在 ST 的 `chatMetadata.extensions['character-diary']`（PLUGIN_ID=`character-diary`）。统一入口：`cdGetData()` 读、`cdSaveData(data)` 写。结构（`emptyData()` 定义）：
```js
{
  diaries: {},        // 角色日记 { 角色名: [{turn,date,entry,mood,attitude_to_user,secret,key_events,relationship_with_others,message_id}] }
  aliases: {},        // 角色别名 { 角色名: [别名...] }
  cameo: {},          // 路人出场次数
  promoted: {},       // 是否正式角色
  relations: {},      // 人物关系 { from: { to: {type,attitude,note} } }
  lastFloor: -1,      // 已处理最后楼层 message_id
  _baselineChatLength: -1,
  _lastDiaryChatLength: 0,
  processedFloors: [],// 已处理楼层（抓取即锁定的标记）
  archive: { mainline, sideline, states, unresolved, custom:{} },  // 剧情档案（追加式）
  cards: [], archiveVectors: [], diaryVectors: [], liveTableData: [], liveTableSnapshots: [],
}
```
- `archive.mainline/sideline/states/unresolved` = 追加式文本（`\n\n` 拼接）；`archive.custom[key]` = 追加式数组 `[{time,desc}]`
- `diaries[角色]` = 追加式数组，每条带 `message_id`（用于去重/定位）

### 2. 保存链路（关键）
- **必须** `ctx.chatMetadata.extensions[PLUGIN_ID]` + 调用 `saveChat` 才能真落盘
- 保存优先级（去掉 break，全部执行）：`ctx.saveChat` → `window.saveChatConditional` → `window.saveChat` → `ctx.saveMetadata` → `window.saveMetadataDebounced`
- 兜底：`insertOrAssignVariables({[PLUGIN_ID]:data},{type:'chat'})` 双轨
- `cdGetData` 读取顺序：chatMetadata.extensions → chatMetadata 顶层 → Chat Variables

### 3. 运行机制（关键流程）
- **自动触发**：监听 `MESSAGE_RECEIVED`（AI 回复后）→ `cdOnMessageReceived` 用 `_baselineChatLength`/`data.lastFloor` 判断新增楼层，达到 `interval`(默认5) 触发 → `cdRunDiary`
- **自动触发铁律（v2.7.5 抓取即锁定）**：选定楼层后立即写入 `processedFloors` 并保存（不等 AI 返回），杜绝「选定后崩溃→旧楼层复发」；三游标对齐（lastFloor/_lastDiaryChatLength/_baselineChatLength）；失败回滚、成功清锁（window.__cdLockedBatch）
- **写日记三路并行**：`cdRunDiary` 并发调用 日记/关系/档案，各自独立、失败不互相影响
- **注入（核心）**：监听 `CHAT_COMPLETION_PROMPT_READY`，生成前手动操作 `eventData.chat` 数组按「开头/对话中/末尾」插入注入内容（`cdBuildDiaryInjectionText`）；角色数字 0=system/1=user/2=assistant
- **向量+Rerank**：`cdSearchVectors` 召回 → `cdRerankResults` 重排（OpenAI 兼容 `/rerank`，失败降级）
- **填表**：受 `liveTableEnabled/liveTableInject` 控制

### 4. 关键设置项（DEFAULT_SETTINGS 摘要）
`enabled`(主开关，关=全停) / `interval`(5) / `autoSummary` / `enableDiary|Relation|Archive` / `injectDiary|Relation|Archive` / `archiveMode`('append'|'vector') / `diaryMode` / `vectorTopK` / `vectorThreshold` / `rerankEnabled` / `rerankApi` / `customFields` / `injectPosition`('after'|'before'|'chat') / `autoCompress` / `autoCompressThreshold` / `liveTableEnabled|Inject`

## 八、关键函数速查表

| 函数 | 作用 |
|---|---|
| `cdGetData()` / `cdSaveData(data)` | 读写 data（唯一入口） |
| `cdRunDiary()` | 主写日记流程（三路并行） |
| `cdOnMessageReceived` | 自动触发入口（抓取即锁定） |
| `cdBuildDiaryPrompt` / `cdBuildRelationPrompt` / `cdBuildArchivePrompt` | 三路提示词构建 |
| `cdApiComplete(messages,s)` | 统一 LLM 调用（返回 `{text,elapsed,tokenUsage}`） |
| `cdParseCompressedBlocks` | 压缩结果解析（【标题】分段） |
| `cdCompressArchive` | 压缩融合剧情档案（手动/自动） |
| `cdRenderArchive` | 剧情时间线渲染（主线/支线/状态/未解决） |
| `cdBuildDiaryInjectionText` | 生成注入内容 |
| `cdOnBeforeGeneration` | CHAT_COMPLETION_PROMPT_READY 注入回调 |
| `cdSearchVectors` / `cdRerankResults` / `cdRerank` | 向量召回 / Rerank 重排 |
| `cdGetStCtx` / `_cdDoInit` / `cdInjectFab` | 初始化 / FAB 注入 |
| `cdSaveSettings` / `cdGetSettings` | 读写设置 |

## 九、踩坑与禁令清单（血的教训）

### 存储/数据
- 必须 `saveChat` 真落盘，`saveMetadata` 不一定持久化（退出会话丢数据）
- `cdGetData`/`cdSaveData` 是唯一读写入口，新增字段必须同步这两处
- 数据骤减自动从 localStorage 备份补回（数据保护）

### 代码修改
- **绝不用纯字符串 replace/re.sub 替换含 `\n` 的内容**，repl 一概用函数（`lambda m:...`），避免被二次转义展开
- 跨环境 JSON 替换：手动构造 `\n` 字面，别信 json.dumps/repr 在终端行为
- 改完必须 `node --check` + `repr()` 看真实字节，别信终端显示折行误导
- 动态字段解析用「逐行扫描」比非贪婪正则稳
- 中文引号/中文 key 混入半角引号易语法错；用全角/**书**更安全

### ST 环境
- ST API 多数是 `ctx.xxx`（saveChat/saveMetadata 等），裸全局调用会 ReferenceError
- 注入位置用 CHAT_COMPLETION_PROMPT_READY 手动操作 eventData.chat 最稳，别依赖 setExtensionPrompt
- 按钮「没反应」多因重渲染后事件失效 → 用 inline `onclick` 绑全局函数，或 `$('#cd-content').off('click',...).on('click',...)` 委托
- 插件磁盘文件改后必须完全重启 ST（force-stop+启动），只刷新不生效

### 用户设置快照坑
- ST 设置的旧快照优先于代码默认值（`Object.assign({},DEFAULT_SETTINGS,stored)`）→ 代码改了不生效时，提供「恢复默认」按钮让用户拉回

### 发布
- 发布前确认本地是远端完整超集（函数清单对比），防覆盖回退
- 版本号 4 处同步 + CHANGELOG 数组闭合
- 网络不稳，Release 用 GitHub API `POST /releases`（传 tag_name+target_commitish=main）最稳

### 方法论（最重要，多看几遍）
- 🚫 别在解析/渲染层反复自查（注释已写"避免负号被吞"就说明处理过）
- ✅ 界面错 → 存储对 → 源头（提示词/生成层）最可疑，按数据流反向验证
- ⚠️ **提示词示例即规则**：AI 模仿示例，示例补全（负号/时间标记）AI 才会输出
- ⚠️ 覆盖式输出最易丢信息（负号/时间标记）→ 必须显式要求保留
- 📌 历史数据不自动修复，只影响下次生成/覆盖
- 📌「完成」日志 ≠ 「生效」，要看能证明数据写入的那条日志

---

## 十、各功能专题速查

### 世界书联动（别名→主名归一化）
- 问题：聊天显示名(别名) ≠ 角色逻辑主名 → 世界书条目(key为主名)命中不了
- 修复：`cdSceneWorldbookRoles` 用 `data.diaries` 键 + `data.aliases`(主名→[别名]) 建「别名→主名」反向映射，把楼层显示名归并回主名
- 候选3 用 `async function` + `await loadWorldInfo`（新版 ST 返回 Promise）；forEach 改 for 循环
- 世界书路径：`data/default-user/worlds/*.json`，结构 `{entries:{'0':{...}}}`

### 负好感显示被吞（v2.7.2）
- 解析层没问题，病根在**喂给 AI 的状态提示词**没让写负数、示例全正数 → AI 把 -90 存成 90
- 修复：提示词示例补 `对主角好感 -90` + 显式要求「负好感必须带负号保留」

### 仪式注入台（v2.7.2）
- 每个「符契」= 一个可开关固定提示词模块 `{id,name,icon,enabled,desc,variant,position,texts}`
- 超长原文抽常量（文件顶部），settings 引用
- 注入复用 CHAT_COMPLETION_PROMPT_READY，按 position 分组 before/chat/after 独立插入
- 记忆注入为空时不直接 return，只跳过记忆继续仪式注入
- 动态样式 `document.createElement('style')` + `#cd-content` 限定作用域；类名前缀 `cd-rit-*`

### 选择性记忆（白名单）
- `selectiveMemory:true` 时只记 focusRoles（重点角色），其余跳过
- 非破坏：只拦新角色记录，不清旧记忆

### AI 去重
- 语义级检测近似重复条目，弹窗预览后清扫，可还原

---

*（本文档将随插件维护持续更新。任何新功能/修复/踩坑都必须同步进本文档的对应章节 + 改动日志。）*
