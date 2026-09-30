# DeepSeek_Harness框架深度调研

> 生成时间: 2026-09-30 15:35:20
> 文件名: 20260930-1535-DeepSeek_Harness框架深度调研.md
> 日期时间前缀: 20260930-1535
> 生成模型: agnes-3.0-flash

---
# DeepSeek Harness (DSH) 框架深度调研

> 主题：DeepSeek Harness —— DeepSeek 于 2026-08-13 开源的 Agent 运行时框架（MIT 协议）
> 一句话定位：**"Model + Harness = Agent"**，核心是"一切皆插件"（Everything is a Plugin），基于 Cordis 插件框架。
> 它不是 AI 模型本身，而是连接模型与真实环境、调度工具完成任务的**中介层 / 运行时**。

---

## 一、它是什么（定位与背景）

- **性质**：开源 Agent 执行框架（Runtime / Harness），不是聊天客户端，也不只是"另一个 Claude Code"。它是一整套用于**组装 Agent** 的开源底座。
- **背景节奏**：DeepSeek 先于 2026-08-13 上午上线 V4 Pro 正式版，当晚 Harness 即跟进开源，"模型 + 编排框架同日上线"。开源 24 小时内 GitHub star 逼近 9.5 万、fork 约 8.8k。
- **对标**：直接对标 Anthropic 的 Claude Code / OpenAI 的 Codex。行业观点：这是"中国公司第一次把 模型 + 工程（Harness）一起完整开源"，把"如何造 Agent"的方法论与源码公之于众，"杀死 Agent 黑箱"。
- **形态**：既可作为桌面应用（macOS Apple Silicon / Windows 64 位），也可通过代码启动为 Web 端，还提供 headless、SDK、ACP 自动化等多种 Profile。

---

## 二、核心设计理念：Cordis "无特权内核"

Cordis 是 DSH 内嵌（vendored）的插件框架，设计哲学来自其论文《A Programming Paradigm for Spatiotemporal Composability》（时空可组合性）。

| 要点 | 说明 |
|---|---|
| **无特权内核** | 不存在需要打补丁的"内核"；模型适配器、工具注册表、会话日志、甚至 agent loop 本身都是**插件** |
| **副作用可逆** | 各项注册都是副作用，插件卸载时自动撤销 |
| **挂载即扩展** | 把新插件挂到其他插件旁边，而非修改已有代码 |
| **共享上下文 `ctx`** | 插件向 `ctx` 贡献服务、类型化事件与副作用：`ctx.sessions`、`ctx.tools`、`ctx.llm`、`ctx.agents`、`ctx.sandbox` 等 |
| **一句话** | "一切皆插件，挂载即扩展，卸载即撤销" |

**最激进的一点**：连 Agent 主循环（Agent Loop）本身都是一个可热替换的插件。这是它相对 Codex 的"声明式插件"最大的结构性差异——为"自进化 / 自改写 Harness"预留了物理插槽。

---

## 三、包结构与组合体系（Profile / Bundle）

### 3.1 核心包（向 Cordis 树贡献内容）

| 包 | 职责 | 提供的 `ctx` 键 |
|---|---|---|
| `core/session` | 仅追加的 `SessionEvent` 日志 + 内存存储 | `ctx.sessions` |
| `core/system-prompt` | 提示词片段与工具 schema 组装 | `ctx.systemPrompt` |
| `core/tools` | 作用域化工具注册表 + 把关执行流水线 | `ctx.tools` |
| `core/agent` | `Agent` 接口、活跃 agent 注册表、`agent/*` 事件 | `ctx.agents` |
| `core/agent-loop` | 默认驱动器（实现 Agent 接口） | `ctx.agentLoop` |
| `core/scope` | 按 agent 划分作用域的注册原语 | 库，无 ctx 键 |
| `llm/llm` | 消息与流式词汇表、适配器 seam | `ctx.llm` |
| `webhook/webhook` | 已认证 delivery 分派 + 创建 Workspace Session | `ctx.webhookRuntime` |

### 3.2 组合包（Bundle）与 Profile 叠加顺序

```
空条目列表
  → profile 列出的组合包（按序叠加）
  → profile 的 cordis.patch.yml
  → home 级 patch
  → --patch overlay
```

| 组合包 | 作用 |
|---|---|
| `dsh-base` | 所有 profile 共享第一层：模型适配器、工具、持久化、**沙箱与审批策略**、设置、凭据、遥测 |
| `dsh-web-app` | 增加浏览器应用 |
| `dsh-headless` | 增加不带服务器的一次性运行器 |
| `dsh-sdk-app` | 增加 SDK JSON-RPC 服务器 |
| `dsh-acp-app` | 仅用于自动化的 ACP 服务器 |
| `dsh-sdk-minimal` | 例外：一个组合包拥有完整显式 SDK 配置树，**不**应用 `dsh-base` |

---

## 四、运行模式（Profile）

### 4.1 Profile 与启动

| Profile | 启动命令 | 配置重载 | 说明 |
|---|---|---|---|
| `web` | `dsh web` | 实时重载 patch | 浏览器应用 |
| `headless` | `dsh --profile headless` | 仅启动时一次 | 一次性运行器 |
| `sdk` | `dsh --profile sdk` | 仅启动时一次 | SDK JSON-RPC 服务器 |
| `sdk-minimal` | `dsh --profile sdk-minimal` | 仅启动时一次 | 独立组合包，不依赖 dsh-base |
| `acp` | `dsh --profile acp` | 仅启动时一次 | 自动化 ACP 服务器 |

> 一次性 / stdio 应用不实时重载，是因为替换运行中依赖会破坏其生命周期。
> 查看配置树：`dsh --profile web --dump-config`

### 4.2 四种"业务"运行模式

| 模式 | 定位 | 适用场景 |
|---|---|---|
| **标准模式** | 全能均衡，功能最完整 | 默认首选，覆盖 90% 日常需求 |
| **PTC 模式** | 标准 + TypeScript 程序化工具调用 | 批量任务、多步骤重复操作 |
| **极简模式** | 仅 Bash + str_replace_editor | 纯本地代码修改，无额外功能 |
| **创造模式** | 自定义 Agent 预设的元模式 | 打造专属 Agent；可对话生成新插件（如"番茄时钟"悬浮插件，用时 5 分 24 秒） |

---

## 五、Agent Loop 可替换 与 轮次流程

- `core/agent` 定义 `Agent` 接口 + 活跃 agent 注册表 + `agent/*` 事件；`core/agent-loop` 仅是"实现该接口的默认驱动器"。两者都是插件，可**整体替换**；替换后 `agent/pre-step`、`agent/request`、`agent/turn-stopping` 等事件契约不变。

轮次（Turn）流程摘要：
```
turn/start → claim next-step → assemble prompt + tool schemas
  → agent/pre-step (waterfall, 可 reject/改写)
  → step/start → agent/request → llm/stream → assistant/chunk* → assistant/message
  → tool/call* → tools/pre-execute → tools/execute → tools/post-execute → tool/result*
  → step/end → 判断是否还有欠下工作
  → agent/turn-stopping (serial) → turn/end
```
- `turn/*`、`step/*`、`user/message`、`assistant/*`、`tool/*` → **持久会话事件**
- `agent/*`、`llm/stream`、`tools/*` → **实时扩展点**（瀑布式，监听器须调用 `next()`）

---

## 六、事件溯源 / 会话日志（唯一真相源）

| 原则 | 说明 |
|---|---|
| **模型可见即已记录** | 抵达模型请求的一切必须能从日志重建，由运行时不变量断言 |
| 新增模型可见输入 | 必须扩展 `SessionEventMap` 并新增会话事件 |
| 投影 seam | `dsh-session-projection` 提供 `ctx.sessionProjections`：增量折叠已提交事件，host 用 `stateOf()` 读单条，载体用 `snapshot()` 批量取裁剪视图 |
| 派生用途 | fork、恢复、transcript、遥测、持久化**全部**从该事件流派生 |

> 这带来从"日志"到"事件 - 可重放 - 可审计"的跃迁：会话可分叉、可回放、可审计。

---

## 七、安全模型（多层把关）

| 层面 | 机制 |
|---|---|
| **沙箱** | `ctx.sandbox` 后端；消费方在启动进程前**包装 argv**；文件/进程提供方共享同一执行世界，指向远程沙箱可一并迁移 Bash、PTY、LSP |
| **审批策略** | 包含在 `dsh-base` 中（模型适配器、工具、**沙箱与审批策略**、凭据） |
| **工具执行流水线** | `tools/pre-execute → tools/execute → tools/post-execute` 三步把关，监听器可拦截 |
| **Webhook 认证** | `ctx.webhookRuntime` 上注册**可信规则** + 挂载提供方适配器 |
| **作用域隔离** | `core/scope` 按 agent 划分注册原语；agent preset 中的服务行需 `isolate` realm |
| **进程限制** | `ctx.sandbox` 后端限制所启动的进程 |

> **官方明示（重要）**：当前预览版**未经安全审计**，Sandbox / Approval / Permission **不构成完全隔离保证**。生产环境需自行评估。

---

## 八、能力 Seam（可替换接缝）

一个 **seam = Service Definition（声明接口）+ Service Provider（实现）+ Consumer（面向模型的工具）**。

- 单个包可合并承担多个角色，但单一角色本身不构成 seam
- **替换一个提供方即可改变整个产品行为**（例如把 fs + 进程提供方指向远程沙箱，Bash/PTY/LSP 一并迁移）
- subagent 提供方在同一接口后支持"新建子 agent"到"把轮次委派给另一个产品"
- 实验性 **Agent Teams**（`ctx.agentTeams`）：在 subagent 之上提供持久 roster、任务板和 mailbox，需显式启用

---

## 九、SDK 与安装方式

| 方式 | 命令 / 说明 |
|---|---|
| CLI + Web | `npm install @deepseek-ai/dsh`；`npx @deepseek-ai/dsh web`（需 Node.js 22.19.x 或 24+，默认 `http://127.0.0.1:3080`） |
| 源码运行 | `git clone https://github.com/deepseek-ai/deepseek-harness` → `pnpm install` → `pnpm run build` → `pnpm dsh web` |
| Python SDK | `pip install deepseek-harness-sdk`（Python 3.10+，无需本机 Node.js；wheel 把 CLI 打包为平台运行时分发，默认以 `dsh --profile sdk` 启动；暴露"profile 选择 + 有序 patch 文件"而非完整 Cordis 树） |
| 安装插件 | `dsh plugin --profile web add <package-or-git-spec>`；外部插件以声明 `dsh.bundle` 的 Bundle 加入指定 Profile |

> Python SDK 与 TypeScript SDK **共享同一套 profile / patch 机制**，架构一致。

---

## 十、开发者工具与可观测性

- 查看**执行轨迹**与详细运行信息；按**轮次**展开"用户指令 → 助手推理 → 工具调用（bash / read / grep 等）"
- 每步显示参数、结果、Schema、计时（示例单步 34ms）
- 会话事件流驱动，可接 OpenTelemetry GenAI Trace（社区插件 LoongSuite DSH Plugin 等）

---

## 十一、生态现状（快速膨胀）

围绕"一切皆插件"，社区在数周内沉淀出大量第三方内容（节选分类）：

- **工作流与 Agent**：`dsh-toolkit`（确定性工具集）、`dsh-deep-research`、`dsh-auto-approval`、`dsh-agent-teams`、`dsh-automation`、`mstar-harness` 等
- **上下文 / 会话 / 输入**：`dsh-context`（Token 组成面板）、`dsh-memory-evolve`、`dsh-turn-rewind`、`dsh-filesnap`、`dsh-compaction-instant` 等
- **浏览器 / 视觉 / 界面**：`dsh-browser`（Chrome 侧边栏）、`dsh-vision-toolkit`、`dsh-computer-use`、`dsh-ios` / `dsh-android`（真机/模拟器操控）
- **沙箱与执行**：`sandbox-micro`（fail-closed microVM）、`dsh-credentials-keyring`（系统钥匙串存凭据）、`dsh-win32`（Windows 诊断/安全修复）
- **外部集成**：腾讯云 ADP、Milvus/Zilliz、Ollama、Sealos、QQ Bot / 飞书 / iMessage 等
- **第三方客户端 / 发行版**：多个 Electron 桌面壳（AnyWhere-Labs、dsh-desktop、TinyWhale、Oh-DSH 等）、TUI、Docker 版

> 注意：绝大多数为**早期预发布**项目，多数未做安全审计；安装 GitHub-only 插件会触发在 Agent 沙箱**之外**执行的构建脚本，需先审查并授权。

---

## 十二、实测表现（与 Claude 对比，均为 DeepSeek V4 Pro）

| 场景 | 结果 | 结论 |
|---|---|---|
| 3D 黑洞模拟器（对比 Claude Harness） | DSH 40min vs Claude 25min | 速度约慢 33%，但**效果基本持平** |
| 创造模式"门店宣传助手" | 3 分钟完成网页生成 + 检查 | 预设可落地，非噱头；但曾出现 Bash noop 死循环 |
| 复杂数据处理压测（对比成熟平台 WorkBuddy） | DSH 首次执行 20min 报错，总计近 50min | 稳定性有隐患，效率慢 30%–50% |

**综合评价**：
- 亮点：四种模式设计清晰、"一切皆插件"扩展性强、创造模式可落地、任务质量与 Claude 持平
- 短板：执行效率偏低（比成熟平台慢 30%–50%）、复杂任务稳定性有隐患、个别场景死循环
- 结论：模型上限已被 V4 Pro 验证，**Harness 当前处于公测阶段，稳定性和效率是主要短板**

---

## 十三、对你自研 Agent 的启示（结合本仓库 microgpt）

1. **"Model + Harness = Agent"** 是把"编排框架"单独抽出来、与模型解耦的思路。你的 microgpt 若要走向 Agent，可借鉴"模型层 / 工具层 / 运行时 / UI 层解耦"。
2. **"一切皆插件"过重**：DSH 的复杂度被社区评价为"日常写代码并不需要 Cordis 的复杂度"。除非你要做"可自进化 / 可热替换 Agent Loop"的产品，否则不必一开始就上无内核插件体系。
3. **可借鉴的轻量特性**：
   - **事件溯源会话日志**（"模型可见即已记录"）—— 带来可 fork / 可回放 / 可审计，成本低、收益高，值得自研借鉴
   - **工具执行三步流水线**（pre-execute / execute / post-execute）做安全拦截点
   - **Profile + Bundle 叠加**做"标准 / 极简 / 创造"多模式
   - **seam（接口 + 提供方 + 消费方）可替换**做沙箱/工具的可插拔
4. **安全必须先行**：DSH 官方都明示预览版"未经安全审计、不构成完全隔离"，自研时沙箱与审批策略要作为一级需求设计。
5. **结合前两次讨论**：DSH 同时提供 Web 端与桌面端，正是"本地引擎 + Web 前端"路线的产品化范本；双平台（Windows + 统信）若要跟进，关注其 `dsh-win32` 与打包/CI 方案。

---

## 参考来源

- 官方页：`https://www.deepseek.com/harness/`
- 源码仓库：`https://github.com/deepseek-ai/deepseek-harness`（含 `docs/architecture.zh.md`）
- 官方 Python SDK：`deepseek-harness-sdk`
- 社区索引：`https://github.com/libukai/awesome-deepseek-harness`
- 深度评测：阿里云开发者社区《DEEPSEEK HARNESS 原生 AGENT 框架首发深度评测》（2026-08-16）
- 架构/事件溯源解读：知乎《DeepSeek Harness 深度解析》、《Cordis 在做什么》等
