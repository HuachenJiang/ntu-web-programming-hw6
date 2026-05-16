# IB AAHL AI Study Assistant Bot Development Phases

本文档根据 `spec.md` 的基本功能要求制定开发阶段流程。当前版本只覆盖基础功能，不包含后续进阶需求。每个阶段都应在进入下一阶段前完成对应验收条件。

## Phase 1: 项目初始化与规范文件

### 开发目标

建立 Next.js + TypeScript 项目基础结构，并补齐项目规范文档，确保后续开发有统一的目录、代码风格和维护规则。

### 主要任务

- 初始化 Next.js with TypeScript 项目。
- 启用 TypeScript strict mode。
- 配置 ESLint 与 Prettier。
- 创建 `AGENTS.md`，写明项目开发规范：
  - 修改代码前必须先理解并遵守项目文档。
  - 项目整体保持模块化、易维护。
  - 尽量保持 single source of truth，避免不必要的 fallback 与兼容分支。
  - 新增功能必须同步考虑测试。
- 创建 `docs/architecture.md`，作为项目架构说明文档。
- 创建 `README.md`，先写项目简介、技术栈、开发方式占位，项目完成后补充完整。
- 建立基础目录结构，建议包括：
  - `src/app`
  - `src/app/api`
  - `src/lib`
  - `src/services`
  - `src/repositories`
  - `src/models`
  - `src/types`
  - `src/config`
  - `src/errors`
  - `src/tests` 或 `tests`

### 涉及模块

- 项目配置
- 文档规范
- 目录结构
- 测试基础设施

### 用户手动操作

本阶段暂无必须的外部账号操作。

### 验收条件

- 项目可以通过 `npm install` 安装依赖。
- 项目可以通过 `npm run dev` 启动本地开发服务器。
- `npm run lint` 可以运行。
- `tsconfig.json` 已启用 strict mode。
- `AGENTS.md`、`docs/architecture.md`、`README.md` 均已创建。
- 基础目录结构已建立，后续模块有明确放置位置。

## Phase 2: 环境变量与第三方服务准备

### 开发目标

整理项目需要的外部服务与环境变量，确保 Telegram、Qwen、MongoDB Atlas、本地 ngrok webhook 测试、Vercel 部署和 production webhook 配置都有明确入口。当前阶段只准备配置与账号条件，不要求完成 Vercel 部署；后续完成 webhook route 后优先通过 ngrok 做真实 Telegram 消息验证，最后再切换到 Vercel production。

### 主要任务

- 创建 `.env.example`，预留以下字段：

```bash
TELEGRAM_BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN"
TELEGRAM_WEBHOOK_SECRET="YOUR_TELEGRAM_WEBHOOK_SECRET"
QWEN_API_KEY="YOUR_QWEN_API_KEY"
QWEN_MODEL="qwen-plus"
QWEN_API_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
MONGODB_URI="YOUR_MONGODB_ATLAS_CONNECTION_STRING"
NEXT_PUBLIC_APP_URL="YOUR_PUBLIC_APP_URL"
ADMIN_POLLING_INTERVAL_MS="5000"
USER_RATE_LIMIT_WINDOW_MS="60000"
USER_RATE_LIMIT_MAX_MESSAGES="20"
RECENT_CONTEXT_MESSAGE_LIMIT="10"
```

- 在 `docs/architecture.md` 或单独文档中说明环境变量用途。
- 准备 ngrok 本地反代流程：
  - 确认本机已安装 ngrok CLI；当前开发机可使用 `ngrok version 3.37.6`。
  - 登录 ngrok dashboard 获取 authtoken。
  - 在本机运行 `ngrok config add-authtoken <YOUR_NGROK_AUTHTOKEN>` 完成 ngrok agent 配置。
  - 本地 webhook 测试时先运行 `npm run dev`，再运行 `ngrok http 3000`，并将 Forwarding HTTPS URL 临时填入 `.env.local` 的 `NEXT_PUBLIC_APP_URL`。
- 建立配置读取模块，集中读取并校验环境变量。
- 使用 Zod 或等价方式验证必要环境变量。

### 涉及模块

- `src/config`
- 环境变量
- 外部服务配置
- ngrok 本地反代测试准备

### 用户手动操作

详见 `docs/setup.md`。该文档集中说明 Telegram BotFather、Qwen API、MongoDB Atlas、ngrok 本地反代、Vercel 环境变量与 Telegram webhook 注册流程。

### 验收条件

- `.env.example` 包含所有基础功能所需字段。
- 本地 `.env.local` 可按 `.env.example` 创建。
- ngrok CLI 可用，且本机已通过 `ngrok config add-authtoken <YOUR_NGROK_AUTHTOKEN>` 配置账号 token。
- 文档明确说明 `NEXT_PUBLIC_APP_URL` 在本地测试阶段使用 ngrok HTTPS URL，部署后使用 Vercel production URL。
- 配置模块能在缺少必填变量时给出明确错误。
- 文档清楚说明每个 token、project URL 或 connection string 从哪里获取、填到哪里。

## Phase 3: Telegram Bot 基础对话与按钮路由

### 开发目标

实现 Telegram Bot 的基础交互能力，包括命令脚本、inline keyboard、callback query response 与功能路由。

### 主要任务

- 实现以下命令：
  - `/start`
  - `/help`
  - `/newchat`
- 定义 bot 功能菜单：
  - AI 问答
  - Quiz me
  - 学习规划
  - Help
  - New Chat
- 实现 inline keyboard。
- 实现 callback query 解析。
- 建立统一 routing 逻辑，将命令、按钮与普通文本消息分发到对应 handler。
- 设计基础预设回复文案。

### 涉及模块

- Telegram update parser
- Command handlers
- Callback query handlers
- Bot routing
- Scripted responses

### 用户手动操作

本阶段需要已经完成 Phase 2 的 Telegram Bot Token 配置。
本阶段只实现 bot 路由、命令、按钮和纯逻辑测试，不需要 webhook 真正上线。

### 验收条件

- 用户发送 `/start` 后收到欢迎信息与功能按钮。
- 用户发送 `/help` 后收到帮助说明。
- 用户发送 `/newchat` 后近期上下文被清空或标记为新会话。
- 用户点击 inline keyboard 后收到对应 callback response。
- 普通文本消息可以进入 AI 问答路由。

## Phase 4: Next.js Webhook Server 与消息处理

### 开发目标

使用 Next.js API Route 建立 Telegram webhook endpoint，完成 Telegram update 接收、验证、路由与回复。

### 主要任务

- 创建 Telegram webhook API route。
- 校验 webhook secret。
- 接收 Telegram message 与 callback query。
- 对 invalid payload 返回不支持此消息格式。
- 调用 Phase 3 的 routing 逻辑。
- 使用 Telegram Bot API 回复用户。
- 建立基础 structured logging。
- 记录请求处理过程中的错误。

### 涉及模块

- `src/app/api/telegram/webhook`
- Telegram Bot API client
- Update validation
- Central router
- Logging

### 用户手动操作

本阶段优先使用 ngrok 将本地 Next.js webhook 暴露给 Telegram，完成真实 Telegram update 的本地验证。标准流程：

1. 启动本地 Next.js 开发服务器：

```bash
npm run dev
```

2. 另开终端启动 ngrok，本地端口默认使用 Next.js 的 `3000`；如 `npm run dev` 使用了其他端口，则同步替换：

```bash
ngrok http 3000
```

3. 复制 ngrok 输出中的 Forwarding HTTPS URL，例如 `https://xxxx.ngrok-free.app`。
4. 将 `.env.local` 中的 `NEXT_PUBLIC_APP_URL` 临时改为该 ngrok HTTPS URL。
5. 使用 ngrok HTTPS URL 向 Telegram 注册 webhook：

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<NGROK_HTTPS_URL>/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

需要替换：

- `<TELEGRAM_BOT_TOKEN>` 为 BotFather token。
- `<NGROK_HTTPS_URL>` 为 ngrok Forwarding HTTPS URL。
- `<TELEGRAM_WEBHOOK_SECRET>` 为 `.env.local` 中配置的 webhook secret。

检查 webhook 状态：

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

如果 `getWebhookInfo` 中的 `url` 显示为当前 ngrok HTTPS URL，即代表 Telegram 已经将 webhook 指向本地反代环境。免费 ngrok tunnel 重启后 URL 可能变化，需要同步更新 `.env.local` 中的 `NEXT_PUBLIC_APP_URL`、重启本地 dev server，并重新调用 `setWebhook`。

### 验收条件

- Telegram webhook endpoint 可以通过 ngrok 接收真实 Telegram update。
- `getWebhookInfo` 显示 webhook URL 是当前 ngrok HTTPS URL。
- webhook secret 不正确时拒绝请求。
- 文字消息与 callback query 都可以被识别。
- Telegram Bot API failed 时记录错误 log。
- Bot 能在本地开发服务器中通过 Telegram API 回复用户。

## Phase 5: MongoDB + Mongoose 数据持久化

### 开发目标

将完整对话记录、用户信息、错误记录与统计所需数据保存到 MongoDB Atlas。

### 主要任务

- 建立 MongoDB 连接模块。
- 使用 Mongoose 定义基础数据模型：
  - User
  - Conversation
  - Message
  - ErrorLog
- 建立 repository 层，统一封装数据库读写。
- 在每次收到用户消息与 bot 回复后保存完整记录。
- 保存 callback query 产生的互动记录。
- 记录 Qwen API 错误、Telegram API 错误、数据库错误等错误事件。
- 为后台筛选准备必要索引，例如 user id、created at、message text。

### 涉及模块

- `src/models`
- `src/repositories`
- MongoDB connection
- Conversation persistence
- Error log persistence

### 用户手动操作

本地开发阶段需要确保 `.env.local` 已经设置：

```bash
MONGODB_URI="mongodb+srv://..."
```

开发阶段优先继续使用本地 Next.js + ngrok webhook 验证数据库写入；Vercel 环境变量在最终部署前集中配置。

### 验收条件

- 数据库连接失败时能够记录错误，并返回基础错误消息。
- 每条用户消息都会写入数据库。
- 每条 bot 回复都会写入数据库。
- 可以按 user id 查询该用户完整对话。
- 可以按日期范围查询消息。
- 可以按消息内容搜索。

## Phase 6: Qwen API 回复与上下文 Prompt

### 开发目标

接入 Qwen API，让 bot 能围绕 IB AAHL 主题生成 AI 学习回复，并将用户近期上下文传入 prompt。

### 主要任务

- 建立 Qwen service layer。
- 定义统一 LLM prompt template：
  - system prompt
  - user prompt
  - recent conversation context
- 从数据库或上下文服务读取每位用户最近 N 条消息。
- 将近期上下文传入 Qwen。
- 将 Qwen 回复返回 Telegram。
- 对 Quiz me 与学习规划功能提供基础 prompt 模板。
- 将 Qwen 请求失败交给集中错误处理模块。

### 涉及模块

- Qwen client
- Prompt templates
- Conversation context service
- AI reply handler
- Quiz me handler
- Study planning handler

### 用户手动操作

本地开发阶段需要确保 `.env.local` 已经设置：

```bash
QWEN_API_KEY="Qwen API key"
QWEN_MODEL="qwen-plus"
QWEN_API_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
RECENT_CONTEXT_MESSAGE_LIMIT="10"
```

开发阶段优先继续使用本地 Next.js + ngrok webhook 验证 Qwen 回复、上下文传递和 Telegram 真实消息链路；Vercel 环境变量在最终部署前集中配置。

### 验收条件

- 普通文本问题会触发 Qwen 回复。
- 回复内容围绕 IB AAHL 学习场景。
- Qwen 请求中包含最近 N 条上下文。
- `/newchat` 后新问题不再使用旧上下文。
- Qwen 失败时不会中断 webhook 请求流程。

## Phase 7: 错误处理、Quota 与用户限流

### 开发目标

建立集中式错误处理，覆盖 spec 中列出的错误类型，并处理 Qwen quota、429 rate limit 与单用户消息限流。

### 主要任务

- 创建统一 error 类型与 error handler。
- 处理 Qwen API timeout。
- 处理 Qwen API quota exceeded。
- 处理 Qwen API 429。
- 处理 Telegram API failed。
- 处理 Database connection failed。
- 处理 Invalid webhook secret。
- 处理 Invalid message payload。
- 处理 Unknown server error。
- 实现单一用户简单限流。
- 在超过用户限流时回复：

```text
You are sending messages too quickly. Please wait a moment and try again.
```

- 在 LLM quota 用尽时回复：

```text
The AI service has reached its current usage limit. Please try again later.
```

### 涉及模块

- `src/errors`
- Rate limiter
- Qwen error mapping
- Telegram reply fallback
- Error logging

### 用户手动操作

可通过 `.env.local` 调整用户限流参数：

```bash
USER_RATE_LIMIT_WINDOW_MS="60000"
USER_RATE_LIMIT_MAX_MESSAGES="20"
```

开发阶段优先继续使用本地 Next.js + ngrok webhook 验证 quota fallback、429 fallback、限流提示和错误记录；不要求在本阶段部署 Vercel。

### 验收条件

- Qwen timeout 会回复友好的 fallback。
- Qwen quota exceeded 会回复 quota fallback。
- Qwen 429 会回复稍后再试。
- 单一用户超过限流时收到指定英文提示。
- Invalid webhook secret 会拒绝请求。
- Invalid message payload 会回复不支持此消息格式。
- Unknown server error 由集中式错误处理捕获。
- 所有错误均尽量写入 ErrorLog。

## Phase 8: 基础管理后台

### 开发目标

实现基础 admin dashboard，支持查询、筛选、搜索、统计和查看最近消息。

### 主要任务

- 创建后台页面。
- 展示所有对话记录。
- 支持查看单一用户完整对话。
- 支持按用户 ID 筛选。
- 支持按日期筛选。
- 支持按消息内容搜索。
- 展示总消息数。
- 展示总用户数。
- 展示 Qwen API 错误次数。
- 展示最近消息。
- 展示最新消息时间与最新用户。
- 为后台创建查询 API route。

### 涉及模块

- Admin dashboard page
- Admin API routes
- Repository query methods
- Dashboard statistics service

### 用户手动操作

本阶段暂无额外外部平台操作。若后续加入后台鉴权，应单独补充配置说明；基础版本不实现复杂多管理员权限系统。

本阶段仍以本地后台页面配合 ngrok Telegram webhook 做端到端验证，确认真实 Telegram 消息入库后能在后台查询。

### 验收条件

- 后台可以看到所有对话记录。
- 后台可以进入或筛选单一用户完整对话。
- 用户 ID、日期、消息内容搜索均可用。
- 总消息数、总用户数、Qwen API 错误次数显示正确。
- 最近消息列表按时间倒序展示。
- 没有数据时页面有清晰空状态。

## Phase 9: 后台实时更新

### 开发目标

让管理后台可以看到新消息与新会话的实时变化。基础版本优先使用 polling，每隔数秒刷新数据。

### 主要任务

- 在后台页面实现 polling。
- 默认使用 `ADMIN_POLLING_INTERVAL_MS` 控制刷新间隔。
- 新消息写入数据库后，后台下一次 polling 可获取最新记录。
- Dashboard 展示最新消息时间。
- Dashboard 展示最新用户。
- 保持筛选条件下的刷新结果一致。

### 涉及模块

- Admin dashboard client logic
- Admin API routes
- Polling configuration

### 用户手动操作

可通过环境变量调整轮询间隔：

```bash
ADMIN_POLLING_INTERVAL_MS="5000"
```

本阶段仍以本地后台页面配合 ngrok Telegram webhook 做端到端验证：在 Telegram 产生新消息后，本地后台应在 polling 间隔内更新。

### 验收条件

- 用户向 bot 发送新消息后，后台能在数秒内看到更新。
- 新会话出现后，后台最新用户与最近消息同步变化。
- polling 不会清空当前筛选条件。
- polling 失败时页面不会崩溃，并能显示基础错误状态。

## Phase 10: 测试、README 与 Vercel 部署

### 开发目标

补齐测试、部署文档和最终 README，最后再部署到 Vercel，确保项目可以被复现、部署和验收。

### 主要任务

- 编写单元测试：
  - command routing
  - callback query routing
  - prompt template
  - rate limiter
  - error mapping
- 编写集成测试或 handler 测试：
  - webhook secret validation
  - invalid payload
  - message persistence
  - admin query API
- 更新 `README.md`：
  - 项目介绍
  - 技术栈
  - 本地开发步骤
  - 环境变量说明
  - Telegram webhook 配置方式
  - Vercel 部署步骤
  - 基础测试命令
- 确认 Vercel 环境变量配置。
- 部署到 Vercel。
- 将 Telegram webhook 从本地 ngrok URL 切换到 Vercel production URL。
- 使用真实 Telegram Bot 完成 Vercel production 端到端测试，并保留前期已完成的本地 ngrok 端到端验证记录。

### 涉及模块

- Tests
- README
- Vercel deployment
- Telegram webhook setup
- End-to-end verification

### 用户手动操作

Vercel 环境变量与 Telegram webhook 注册步骤详见 `docs/setup.md`。部署完成后需要重新调用 `setWebhook`，将 Telegram webhook 从 Phase 4 使用的 ngrok URL 切换到 Vercel production URL。随后按以下流程做 production 端到端测试：

1. 在 Telegram 中打开 bot。
2. 发送 `/start`。
3. 点击功能按钮。
4. 发送一个 IB AAHL 数学问题。
5. 打开后台确认消息已经入库。
6. 确认后台统计数据更新。

切换后应再次调用 `getWebhookInfo`，确认 webhook URL 已经从 ngrok HTTPS URL 变为 Vercel production URL。

### 验收条件

- `npm run lint` 通过。
- `npm test` 或项目定义的测试命令通过。
- README 包含完整本地运行与部署说明。
- 本地 ngrok 端到端测试已经完成。
- Vercel 部署成功。
- Telegram webhook 已成功切换到 Vercel production URL。
- `getWebhookInfo` 显示 webhook URL 已切换为 Vercel production URL。
- 真实 Telegram 对话可以在 Vercel production 环境触发 Qwen 回复。
- MongoDB Atlas 中可以看到完整对话记录。
- 管理后台可以查看、筛选、搜索、统计并实时更新消息。

## 阶段推进原则

- 每个 phase 完成后再进入下一 phase。
- 新增功能优先走 service layer 与 repository pattern，避免页面、API route 与数据库逻辑混杂。
- 环境变量、prompt template、错误文案、限流参数等配置应集中管理，保持 single source of truth。
- 基础版本默认使用 polling 实现后台实时更新；SSE 或 Pusher 留给后续进阶功能。
- 当前不实现复杂后台权限、多管理员系统、高级 analytics、复杂任务规划算法或付费级别 quota 管理。
