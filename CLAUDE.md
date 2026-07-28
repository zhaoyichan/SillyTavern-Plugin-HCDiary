# 角色日记插件 - 开发避坑指南

> 写给任何想要修改这个插件的人（包括未来的自己）

## 一、文件结构

```
character-diary/
├── manifest.json   # 插件声明
├── index.js        # 主文件（所有代码合并在此）
├── style.css       # 样式表
├── api.js          # API层（已合并到index.js，保留参考）
├── constants.js    # 常量（已合并到index.js）
├── data.js         # 数据层（已合并到index.js）
├── engine.js       # 引擎逻辑（已合并到index.js）
└── prompts.js      # Prompt模板（已合并到index.js）
```

manifest.json只加载index.js。其他.js是拆分模块的原始文件，不会被加载。
改代码请在index.js中直接操作。

---

## 二、绝对禁止改动的内容

### 1. 数据存储方案
禁止改回getVariables / insertOrAssignVariables（酒馆助手API）。
当前正确方案：ctx.chatMetadata + saveMetadata()

### 2. 楼层获取方案
禁止改回getChatMessages()（酒馆助手API）。
当前正确方案：_cdGetChat()遍历ctx.chat数组，注入message_id

ST原生chat数组结构：
- mes: 消息内容（不是.message）
- name: 角色名
- is_user: 用户消息？
- is_system: 系统/隐藏消息？
- 数组下标i = message_id
- 用!is_user && !is_system判断AI消息

### 3. 初始化时序
不要改初始化方式。APP_READY事件驱动经过多次翻车验证正确。

### 4. LLM调用三层fallback
必须保留三种方式：
1. generateRaw
2. ctx.generateQuietPrompt
3. generate

### 5. 上下文注入时机
必须用CHAT_COMPLETION_PROMPT_READY事件。

---

## 三、常见踩坑记录

### 1. 初始化时ST API不可用
现象：FAB不显示，面板弹不出
修复：SillyTavern.getContext() + APP_READY事件

### 2. 楼层永远为0
原因：用了getChatMessages()或用错字段名
修复：直接遍历ctx.chat

### 3. undefined显示
原因：用了.message而不是.mes
修复：全部改为.mes

### 4. 保存失败
原因：insertOrAssignVariables不存在
修复：chatMetadata + saveMetadata()

### 5. 日记不注入AI上下文
原因：注入时机不对
修复：CHAT_COMPLETION_PROMPT_READY事件

### 6. 括号不匹配
现象：插件不加载
修复：每次改完必做：花括号diff<=5，圆括号diff=0

---

## 四、修改后检查清单

- [ ] 花括号匹配
- [ ] 圆括号匹配
- [ ] toastr前有typeof判断
- [ ] getContext()在try/catch中
- [ ] 无getChatMessages等残留
- [ ] callTavern有三个fallback
- [ ] CHAT_COMPLETION_PROMPT_READY已注册
- [ ] scene模板用m.mes不是m.message

---

## 五、版本记录

v2.0.0 - 从酒馆助手脚本重构为独立插件
- 分步try/catch + 详细日志
- APP_READY事件驱动
- _cdGetStCtx兼容层
- 日间米色主题
- cdGetAiFloors直接读ST chat数组（核心修复）
- m.message→m.mes + 注入message_id
- chatMetadata + saveMetadata（核心修复）
- CHAT_COMPLETION_PROMPT_READY注入（核心修复）
- FAB小窗可拖拽 + 全屏
- CSS重做米色风格
- 关系图谱flex横竖连线
- 注入三段式（日记+关系+剧情档案）
