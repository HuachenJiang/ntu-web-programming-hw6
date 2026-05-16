# Architecture

本文档描述 IB AAHL AI Study Assistant Bot 的基础架构。当前内容覆盖 Phase 1 的项目骨架，后续阶段会随着 Telegram、Qwen、MongoDB 与管理后台实现持续更新。

## 技术栈

- Next.js App Router + TypeScript
- React
- ESLint + Prettier
- Vitest
- 后续阶段接入 Telegram Bot API、Qwen API、MongoDB Atlas 与 Mongoose

## 分层设计

项目采用面向职责的分层目录，避免将 webhook、AI 调用、数据库和后台页面混在同一模块中。

- `src/app`: HTTP 入口与页面入口。Telegram webhook 会放在 `src/app/api/telegram/webhook`。
- `src/config`: 集中读取与校验配置，后续使用 Zod 校验环境变量。
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
7. Dashboard 通过 API route 查询统计与最近消息。

## 测试策略

- Phase 1 建立 Vitest smoke test，确保基础配置可被 TypeScript 正确引用。
- Bot routing、配置校验、错误分类和 repository 会在对应阶段增加单元测试。
- Webhook route 与 dashboard API 会补充集成测试或 handler-level 测试。

## 配置策略

环境变量将在 Phase 2 集中接入 `src/config`，并通过 schema 校验必填项。配置模块是唯一读取 `process.env` 的入口，其他模块只依赖经过校验的配置对象。
