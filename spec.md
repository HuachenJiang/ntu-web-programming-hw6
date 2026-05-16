# IB AAHL AI Study Assistant Bot

## 基本说明

本项目将实现一个 AI 学习助理聊天机器人, 主题是关于高中IB AAHL。用户可以通过 Telegram 与 AI bot 互动，获得相关的学习建议、问题解释、任务整理和简单的学习规划。

Bot 会根据用户输入内容，判断应该使用：

1. 预先设计好的对话脚本
2. Qwen API 生成的 AI 回复
3. 按钮菜单与功能路由

系统同时会将完整对话记录存储到数据库，并在管理后台中提供查询、筛选、统计与实时更新功能。

## 项目规范要求

1. 创建AGENTS.md文件，其中包括以下基本规范要求：
   (1) 在修改代码前必须修改代码;
   (2) 项目整体应模块化、易维护;
   (3) 尽量不要有fallback和兼容，尽量保持统一的来源，注重single source of truth;
   (4) 创建docs/文件夹，其中是文档部分，其中docs/architecture.md为本项目的文档架构;
   (5) 创建README.md文件，项目完成后补充完整;
   (6) 应有测试代码等等要求。

2. 根据下文的功能要求，分成合理的阶段phase进行开发，各个阶段开发的内容可以放在docs/文件夹下，类似docs/dev-phase.md中详细规定开发内容和需要达成的验收条件。可以按照功能要求的1,2,3等顺序进行开发顺序编排。后续会有进阶功能要求开发，请先重点满足基本功能要求的开发要求。

3. 本项目如有需要用户自己操作完成的，比如 Oauth 认证 github、vercel 部署、pusher、mongodb、telegram 开发者注册、Qwen API key 获取、webhook 回填等等，需要在 docs/ 下写清楚用户需要操作的内容，每个步骤需要非常详细，以及需要获取什么 token 或 projectID 等内容，并指明填写在哪些文件，比如 .env 中，并留好相应的字段如 QWEN_API_KEY="YOUR TOKEN"。

## 基本功能要求

1. Telegram Bot 对话 / 功能设计:
   (1) 主题：AI Study Assistant Bot;
   (2) 功能列表：AI 问答、Quiz me、学习规划、Help、New Chat
   (3) 对话脚本：/start, /help, /newchat, inline keyboard, callback query response
   (4) 对话上下文：保留每位用户最近 N 条消息; 回复时将近期上下文传入 Qwen prompt
   (5) LLM prompt template: system prompt; user prompt; recent conversation context
   (6) 回复设计: 预设脚本回复; Qwen AI 回复; fallback 回复; button-based response
2. Bot Server
   (1) 使用 Next.js API Route 建立 Telegram webhook endpoint
   (2) 从 Telegram Bot API 接收用户消息
   (3) 支持文字消息与 callback query
   (4) 根据消息内容进行 routing
   (5) 调用 Qwen API 生成 AI 回复
   (6) 使用 Telegram Bot API 回复用户
   (7) 存储完整对话记录
   (8) 统计对话数、用户数、错误数
   (9) 支持错误处理与 fallback response
3. 数据库整合
   (1) 使用 MongoDB Atlas + Mongoose 存储数据。
4. 基础管理后台
   (1) 查看所有对话记录
   (2) 查看单一用户完整对话
   (3) 按用户 ID 筛选
   (4) 按日期筛选
   (5) 按消息内容搜索
   (6) 查看总消息数
   (7) 查看总用户数
   (8) 查看 Qwen API 错误次数
   (9) 查看最近消息
   (10) 实时更新新消息
5. 错误处理
   系统需要处理以下错误：
   (1) 错误类型: Qwen API timeout; 处理方式: 回复友好的 fallback
   (2) 错误类型: Qwen API quota exceeded; 处理方式: 回复 quota fallback
   (3) 错误类型: Qwen API 429; 处理方式: 回复稍后再试
   (4) 错误类型: Telegram API failed; 处理方式: 记录错误 log
   (5) 错误类型: Database connection failed; 处理方式: 回复基本错误消息并记录 log
   (6) 错误类型: Invalid webhook secret; 处理方式: 拒绝请求
   (7) 错误类型: Invalid message payload; 处理方式: 回复不支持此消息格式
   (8) 错误类型: Unknown server error 处理方式: 集中式错误处理
6. LLM 配额与速率限制处理
   (1) 检测 Qwen API quota error
   (2 )检测 429 rate limit error
   (3) 对单一用户进行简单限流
   (4) 当超过限制时回复：You are sending messages too quickly. Please wait a moment and try again.
   (5) 当 LLM quota 用尽时回复：The AI service has reached its current usage limit. Please try again later.
7. 实时更新
   管理后台需要能实时看到新消息与新会话。
   (1) 使用 polling 每隔数秒更新数据
   (2) 或使用 Server-Sent Events / Pusher 实现实时更新
   (3) 新消息写入数据库后，后台可看到最新记录
   (4) Dashboard 显示最新消息时间与最新用户

## 技术栈要求

必须使用的技术栈：

1. Next.js with TypeScript
2. Telegram Bot API
3. Qwen API / Alibaba Cloud Model Studio 或 Qwen Cloud API
4. MongoDB Atlas
5. Mongoose ODM
6. Vercel deployment
7. Environment variables
8. Webhook endpoint
9. Admin dashboard
10. Error handling
11. Conversation persistence

推荐使用的技术栈：

1. Tailwind CSS
2. Zod for validation
3. Service Layer
4. Repository Pattern
5. Centralized error handling
6. Structured logging
7. ESLint
8. Prettier
9. TypeScript strict mode
