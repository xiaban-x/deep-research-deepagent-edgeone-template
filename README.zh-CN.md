# 深度研究助手 (Deep Research Agent)

基于 [OpenAI Agents SDK](https://github.com/openai/openai-agents-js) 的多 Agent 深度研究助手，支持人机互动审批、并行子 Agent 调用、真实网页搜索（沙箱 Playwright）、学术文献检索（CrossRef + Semantic Scholar）和研究报告持久化。部署在 [EdgeOne Pages](https://edgeone.ai) Agent 平台。

## 功能特性

- **多阶段研究流水线** — 问题分解 → 并行搜索 → 综合报告
- **真实网页搜索** — DuckDuckGo HTML 搜索（沙箱或 runtime fetch）
- **真实学术文献检索** — CrossRef API + Semantic Scholar，结构化论文数据
- **沙箱集成** — 通过 `context.sandbox.commands.run()` 远程执行命令
- **人机互动（HITL）** — AI 生成子问题后暂停，用户审核编辑后再继续
- **并行子 Agent 调用** — 文献搜索和网页搜索通过 `context.agents.invoke()` 并行执行
- **对话记忆** — 基于 EdgeOne Pages Memory API 保存历史
- **研究归档** — 完成的报告存储在 Blob Storage，支持历史浏览
- **深度控制** — 快速（2-3 分钟）/ 标准（5-7 分钟）/ 深入（10+ 分钟）
- **实时流式输出** — SSE + 进度指示 + 阶段生命周期事件
- **双语界面** — 中文 / English 一键切换
- **优雅降级** — 沙箱 → 运行时 fetch → Mock 数据（三层容错）

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | Next.js 16 + React 19 | App Router, Turbopack |
| 样式 | Tailwind CSS 3.4 | 暗色模式 |
| Agent 框架 | deepagents 1.9+ | 工具调用 + 中间件 |
| LLM | LangChain.js (`@langchain/openai`) | ChatOpenAI 子 Agent |
| 平台 | EdgeOne Pages | Cloud Functions, Memory API, Blob Storage, Sandbox, Agent Invoke |
| 语言 | TypeScript 5.6 | ESM 模块 |

## 架构

```
┌─────────── 前端 ─────────────────────────────────────────────┐
│ ResearchForm → POST /research (SSE)                          │
│ ApprovalCard → POST /approve → 继续研究                      │
│ ProgressTree ← subagent_lifecycle 事件                       │
│ SourcesPanel ← 从阶段完成中解析来源                           │
│ ReportView   ← 综合 Agent 流式输出报告                       │
└──────────────────────────────────────────────────────────────┘

┌─────────── 编排器 (/research) ───────────────────────────────┐
│ context.agents.invoke('/decompose')                           │
│   → 人机互动暂停（emit hitl_request，等待 /approve）         │
│ Promise.all([                                                │
│   context.agents.invoke('/search-lit'),                       │
│   context.agents.invoke('/search-web'),                       │
│ ])                                                           │
│ context.agents.invoke('/synthesize')                          │
│ context.store.appendMessage() → Memory                       │
│ blobStore.setJSON() → 归档                                   │
└──────────────────────────────────────────────────────────────┘

┌─────────── 子 Agent ─────────────────────────────────────────┐
│ /decompose   — 拆解为子问题                                   │
│ /search-lit  — 学术文献检索（CrossRef + Semantic Scholar）    │
│ /search-web  — 网页搜索（DuckDuckGo + 沙箱）                │
│ /synthesize  — 编写完整研究报告                               │
│ /search      — 独立 deepagents 搜索（工具调用演示）           │
│ /approve     — 人机互动审批端点                               │
│ /history     — 研究历史 CRUD（Blob）                         │
│ /stop        — 取消正在进行的研究                             │
│ /health      — 健康检查                                      │
└──────────────────────────────────────────────────────────────┘
```

## 使用的平台能力

| 能力 | 用法 |
|------|------|
| `context.agents.invoke()` | 编排器调用 4 个子 Agent（decompose/search-lit/search-web/synthesize） |
| `Promise.all` + `agents.invoke` | 文献 + 网页搜索并行执行 |
| `context.sandbox.commands.run()` | 沙箱内执行 shell 命令进行网页爬取 |
| `context.store` (Memory API) | 保存问题和报告到对话历史 |
| `context.conversation_id` | 自动关联请求到同一会话 |
| `@edgeone/pages-blob` | 归档研究报告 |
| `context.utils.abortActiveRun()` | 通过 /stop 端点优雅取消 |

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 AI Gateway 凭证

# 启动开发服务器（需要 EdgeOne CLI）
edgeone pages dev

# 注意：修改 agents/ 下文件后需强制重建：
rm -rf .edgeone/agent-node && edgeone pages dev
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `AI_GATEWAY_API_KEY` | 是 | AI Gateway API Key |
| `AI_GATEWAY_BASE_URL` | 是 | AI Gateway Base URL |
| `AI_MODEL` | 否 | 模型名称（默认 `@Pages/deepseek-v4-flash`） |
| `PROJECT_ID` | 否 | Pages 项目 ID（部署时自动注入） |
| `EDGEONE_PAGES_API_TOKEN` | 否 | API Token（部署时自动注入） |
| `SANDBOX_API_BASE` | 否 | 沙箱 API 地址（平台自动解析） |

## 研究流程

```
1. 用户输入研究问题 + 选择深度
2. POST /research → 编排器启动
3. agents.invoke('/decompose') → 生成子问题
4. SSE: hitl_request → 前端展示审批卡片
5. 用户编辑子问题 → POST /approve
6. POST /research（恢复）→ 继续执行
7. Promise.all([agents.invoke('/search-lit'), agents.invoke('/search-web')])
8. agents.invoke('/synthesize') → 生成 Markdown 报告
9. 报告通过 SSE 流式输出 → 前端渲染
10. 报告保存到 Memory + 归档到 Blob
```

## 项目结构

```
deep-research-edgeone/
├── agents/
│   ├── _shared.ts        # 模型初始化、日志、SSE 工具、沙箱封装
│   ├── research.ts       # 编排器 — agents.invoke + Memory + Blob
│   ├── chat.ts           # 追问对话
│   ├── project.ts        # 项目管理 + 版本
│   ├── scrape.ts         # 独立网页抓取
│   ├── sandbox-test.ts   # 沙箱连通测试
│   ├── stop.ts           # 取消研究
│   └── health.ts         # 健康检查
├── app/
│   ├── page.tsx          # 主页面（SSE 消费、HITL、历史）
│   └── components/
│       ├── research-form.tsx     # 输入 + 深度选择
│       ├── progress-tree.tsx     # 阶段进度可视化
│       ├── sources-panel.tsx     # 学术/网页来源
│       ├── report-view.tsx       # Markdown 报告渲染
│       ├── follow-up-chat.tsx    # 追问对话
│       ├── project-selector.tsx  # 项目选择器
│       └── version-selector.tsx  # 版本切换
├── components/ui/         # 通用 UI 组件
├── lib/
│   ├── i18n.tsx          # 中英文翻译
│   └── utils.ts
├── edgeone.json
└── package.json
```

## 部署

```bash
edgeone pages deploy
```

部署后所有平台能力（Memory、Blob、Sandbox）自动可用。
