# Architecture

本文档描述 IB AAHL AI Study Assistant Bot 的基础架构。当前内容覆盖 Phase 1 项目骨架与 Phase 2 环境变量配置，后续阶段会随着 Telegram、Qwen、MongoDB 与管理后台实现持续更新。

## 技术栈

- Next.js App Router + TypeScript
- React
- ESLint + Prettier
- Vitest
- 环境变量集中校验
- Telegram Bot API
- MongoDB Atlas + Mongoose
- 后续阶段接入 Qwen API

## 分层设计

项目采用面向职责的分层目录，避免将 webhook、AI 调用、数据库和后台页面混在同一模块中。

- `src/app`: HTTP 入口与页面入口。Telegram webhook 会放在 `src/app/api/telegram/webhook`。
- `src/config`: 集中读取与校验配置。`src/config/env.ts` 是唯一读取和校验运行时环境变量的入口。
- `src/services`: 编排业务流程，例如消息路由、AI 回复生成、统计聚合。
- `src/repositories`: 负责持久化读写，避免服务层直接依赖数据库细节。
- `src/models`: 定义 Mongoose models。
- `src/lib`: 保存不依赖框架状态的通用工具和常量。
- `src/errors`: 保存统一错误类型、错误码与错误转换逻辑。
- `src/types`: 保存 Telegram update、bot route、dashboard DTO 等共享类型。
- `src/tests`: 保存测试代码。

## 数据流规划

1. Telegram 将 update 发送到 Next.js webhook route。
2. Webhook route 校验 secret 与 payload。
3. Router 将命令、callback query 和普通消息分发到对应 service。
4. Service 读取近期上下文，必要时调用 Qwen。
5. Repository 写入完整对话记录与错误记录。
6. Telegram client 将结果发送给用户。
7. 发送成功后，Repository 写入 bot 回复记录。
8. Dashboard 通过 API route 查询统计与最近消息。

## MongoDB 持久化

Phase 5 起，数据库访问集中放在 `src/repositories`，服务层不直接操作 Mongoose model。`src/lib/mongodb.ts` 是唯一 MongoDB 连接入口，并使用全局缓存避免 Next.js 开发模式或 serverless 环境中重复创建连接。

基础集合：

- `User`: Telegram 用户资料与最近活跃时间，`telegramUserId` 唯一。
- `Conversation`: 用户与 chat 的 active/closed 会话状态，`/newchat` 会关闭旧 active 会话并创建新会话。
- `Message`: inbound text、callback interaction 与 outbound bot reply。
- `ErrorLog`: Telegram、Qwen、database、webhook 等错误事件。

查询能力先由 `conversation-repository` 暴露给后续 dashboard 与 Qwen context 使用，包括按 Telegram user id 查询完整消息、按日期范围查询消息、按文本搜索消息。错误记录统一通过 `error-log-repository` 写入。

## 测试策略

- Phase 1 建立 Vitest smoke test，确保基础配置可被 TypeScript 正确引用。
- Bot routing、配置校验、错误分类和 repository 会在对应阶段增加单元测试。
- Webhook route 与 dashboard API 会补充集成测试或 handler-level 测试。

## 配置策略

`.env.example` 记录所有基础功能所需字段，真实值只放入本地 `.env.local` 或 Vercel 环境变量。

运行时服务配置通过 `loadAppConfig()` 读取。该函数会校验必填变量、占位值、URL、MongoDB connection string 和正整数配置；缺失或格式错误时抛出 `ConfigError`，错误信息会列出具体环境变量名。需要在测试或 handler 中先检查结果时，可使用 `validateAppConfig()` 获取 `Result`。

环境变量按职责组织为：

- `telegram`: `TELEGRAM_BOT_TOKEN`、`TELEGRAM_WEBHOOK_SECRET`
- `qwen`: `QWEN_API_KEY`、`QWEN_MODEL`、`QWEN_API_BASE_URL`
- `mongodb`: `MONGODB_URI`
- `app`: `NEXT_PUBLIC_APP_URL`
- `admin`: `ADMIN_POLLING_INTERVAL_MS`
- `rateLimit`: `USER_RATE_LIMIT_WINDOW_MS`、`USER_RATE_LIMIT_MAX_MESSAGES`
- `conversation`: `RECENT_CONTEXT_MESSAGE_LIMIT`

其他模块不直接读取 `process.env`，而是依赖 `src/config` 返回的配置对象，避免多处配置来源不一致。
