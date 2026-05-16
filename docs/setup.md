# Phase 2 Setup Guide

本文档是第三方平台注册、密钥获取、环境变量填写与 webhook 注册的统一说明。后续需要新增外部平台或环境变量时，应优先更新本文档，避免在多个文档中重复维护同一套步骤。

## 1. 准备环境变量文件

项目根目录已预留两个环境变量文件：

- `.env.example`: 可提交到仓库的模板文件，只放占位值。
- `.env.local`: 本机开发使用的真实配置文件，已被 `.gitignore` 排除，不应提交真实 token、API key 或数据库连接字符串。

请先确认两个文件包含以下字段，然后把 `.env.local` 中的占位值替换成你从各平台取得的真实值：

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

字段用途：

- `TELEGRAM_BOT_TOKEN`: Telegram BotFather 提供的 bot token，用于调用 Telegram Bot API。
- `TELEGRAM_WEBHOOK_SECRET`: 自行生成的 webhook secret，用于校验 Telegram webhook 请求来源。
- `QWEN_API_KEY`: Qwen / 阿里云百炼 Model Studio API key，用于调用 Qwen 模型。
- `QWEN_MODEL`: Qwen 模型名称，默认可先使用 `qwen-plus`，后续可按成本、延迟与效果调整。
- `QWEN_API_BASE_URL`: Qwen OpenAI-compatible endpoint。中国内地阿里云百炼北京地域通常使用 `https://dashscope.aliyuncs.com/compatible-mode/v1`；国际站或新加坡地域通常使用 `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`。
- `MONGODB_URI`: MongoDB Atlas connection string，用于连接云端数据库。
- `NEXT_PUBLIC_APP_URL`: 项目公开访问地址。本地可先填 ngrok 等公网隧道地址，部署后填 Vercel production URL。
- `ADMIN_POLLING_INTERVAL_MS`: 管理后台轮询刷新间隔，默认 `5000` 毫秒。
- `USER_RATE_LIMIT_WINDOW_MS`: 用户限流时间窗口，默认 `60000` 毫秒。
- `USER_RATE_LIMIT_MAX_MESSAGES`: 单个用户在限流窗口内最多消息数，默认 `20`。
- `RECENT_CONTEXT_MESSAGE_LIMIT`: 传给 Qwen 的近期上下文消息数量，默认 `10`。

## 2. Telegram BotFather

入口：

- BotFather: <https://t.me/BotFather>
- Telegram Bot API: <https://core.telegram.org/bots/api>
- BotFather 官方说明: <https://core.telegram.org/bots/features#botfather>

操作步骤：

1. 打开 Telegram，搜索并进入 `@BotFather`。
2. 发送 `/start`，确认你正在和官方 BotFather 对话。
3. 发送 `/newbot` 创建新 bot。
4. 按提示输入 bot 显示名称，例如 `IB AAHL AI Study Assistant`。
5. 按提示输入 bot username。username 必须以 `bot` 结尾，例如 `ibaahl_study_assistant_bot`。
6. 创建成功后，BotFather 会返回一段 bot token，格式通常类似 `123456789:ABC...`。
7. 将 token 填入 `.env.local`：

```bash
TELEGRAM_BOT_TOKEN="BotFather 返回的 token"
```

可选设置：

1. 发送 `/setdescription`，选择你的 bot，填写 bot 简介。
2. 发送 `/setabouttext`，填写用户打开 bot 资料页时看到的短说明。
3. 发送 `/setcommands`，为基础命令建立菜单：

```text
start - Start the study assistant
help - Show help and available features
newchat - Start a fresh conversation
```

注意事项：

- 不要把 `TELEGRAM_BOT_TOKEN` 发给别人，也不要提交到 Git。
- 如果 token 泄露，立刻在 BotFather 中使用 `/revoke` 重新生成。

## 3. Telegram Webhook Secret

`TELEGRAM_WEBHOOK_SECRET` 是本项目用于验证 Telegram webhook 请求的随机字符串。它需要同时配置在项目环境变量和 Telegram webhook 注册请求里。

生成方式：

1. 在本机终端运行：

```bash
openssl rand -hex 32
```

2. 复制输出结果，填入 `.env.local`：

```bash
TELEGRAM_WEBHOOK_SECRET="上一步生成的随机字符串"
```

注意事项：

- 本地 `.env.local`、Vercel 环境变量、`setWebhook` 请求中的 `secret_token` 必须完全一致。
- secret 不需要来自 Telegram 平台，项目自行生成即可。

## 4. Qwen API / 阿里云百炼 Model Studio

入口：

- 阿里云百炼控制台: <https://bailian.console.aliyun.com/>
- 阿里云百炼获取 API Key 文档: <https://www.alibabacloud.com/help/zh/doc-detail/2712195.html>
- Alibaba Cloud Model Studio 获取 API Key 文档: <https://www.alibabacloud.com/help/en/model-studio/get-api-key>
- Qwen API Reference: <https://www.alibabacloud.com/help/en/model-studio/qwen-api-reference/>

操作步骤：

1. 打开阿里云百炼控制台或 Alibaba Cloud Model Studio，并登录账号。
2. 如果页面提示需要开通百炼 / Model Studio 服务，先完成开通与服务协议确认。
3. 进入 API Key 管理页面，创建新的 API key。
4. 创建成功后复制 API key。不要把 key 写入 README、截图或提交记录。
5. 确认你准备使用的地域和 endpoint：
   - 中国内地阿里云百炼北京地域：`https://dashscope.aliyuncs.com/compatible-mode/v1`
   - 国际站或新加坡地域：`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
6. 选择默认模型。基础版本建议先使用 `qwen-plus`；如果后续有更明确的成本、响应速度或推理能力要求，再切换到其他 Qwen 模型。
7. 将 API key、模型名和 base URL 填入 `.env.local`：

```bash
QWEN_API_KEY="百炼 / Model Studio 返回的 API key"
QWEN_MODEL="qwen-plus"
QWEN_API_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
```

安全建议：

1. API key 只放在服务端环境变量中，不放在前端代码、公开 README、截图或提交记录里。
2. 尽量为本项目单独创建 API key，便于后续轮换、禁用和排查调用量。
3. 如果发现 key 泄露，立即删除或轮换 key，并更新 `.env.local` 与 Vercel 环境变量。
4. 若启用付费调用，请在阿里云费用中心或 Model Studio 控制台设置预算、余额提醒或用量告警，避免异常调用造成费用风险。

## 5. MongoDB Atlas

入口：

- MongoDB Atlas: <https://cloud.mongodb.com/>
- Atlas connection string 官方文档: <https://www.mongodb.com/docs/atlas/connect-to-database-deployment/>
- MongoDB connection string 说明: <https://www.mongodb.com/docs/manual/reference/connection-string/>

操作步骤：

1. 打开 MongoDB Atlas，注册或登录账号。
2. 创建一个 organization 或使用已有 organization。
3. 创建 project，例如 `ib-aahl-study-assistant`。
4. 在 project 中创建 database deployment / cluster。
5. 开发阶段可选择免费或低成本 tier；区域建议选择离部署区域较近的位置。
6. 等待 cluster 创建完成。
7. 进入 `Database Access`，创建数据库用户：
   - 选择 `Password` 认证方式。
   - 设置 username 与强密码。
   - 权限可先选择 `Read and write to any database`，后续可收紧。
8. 进入 `Network Access`，添加允许访问的 IP：
   - 本地开发阶段可点击 `Add Current IP Address`。
   - Vercel 部署阶段如果没有固定出站 IP，基础作业项目可临时使用 `0.0.0.0/0`，但需要理解这会放宽网络访问限制；务必搭配强数据库密码。
9. 回到 cluster 页面，点击 `Connect`。
10. 选择 `Drivers` 或 Node.js driver 连接方式。
11. 复制 connection string，通常类似：

```text
mongodb+srv://<username>:<password>@<cluster-host>/<database-name>?retryWrites=true&w=majority
```

12. 替换 `<username>`、`<password>` 与 `<database-name>`。
13. 如果密码包含 `@`、`:`、`/`、`?`、`#` 等特殊字符，需要进行 URL encode，或重新生成不含特殊字符的数据库密码。
14. 将最终连接字符串填入 `.env.local`：

```bash
MONGODB_URI="mongodb+srv://username:password@cluster-host/ib-aahl-study-assistant?retryWrites=true&w=majority"
```

注意事项：

- `MONGODB_URI` 中的数据库用户密码是敏感信息，不要提交。
- Atlas 的 database name 可以先使用 `ib-aahl-study-assistant`，后续代码会通过 Mongoose models 创建集合。
- 如果连接失败，优先检查 Network Access、用户名密码、connection string 中的 database name 与特殊字符转义。

## 6. ngrok 本地反代测试准备

Phase 4 完成 Telegram webhook route 后，本地应优先通过 ngrok 接收真实 Telegram update。当前开发机可用版本为：

```bash
ngrok version 3.37.6
```

如果本机尚未安装 ngrok，请先从 <https://ngrok.com/download> 安装 CLI。

账号与 token 配置：

1. 打开 ngrok dashboard: <https://dashboard.ngrok.com/>
2. 注册或登录账号。
3. 进入 `Your Authtoken` 页面，复制 authtoken。
4. 在本机终端运行：

```bash
ngrok config add-authtoken <YOUR_NGROK_AUTHTOKEN>
```

本地 webhook 测试流程：

1. 启动 Next.js 本地开发服务器：

```bash
npm run dev
```

2. 另开一个终端，将本地 `3000` 端口暴露为 HTTPS 地址：

```bash
ngrok http 3000
```

3. 复制 ngrok 输出中的 `Forwarding` HTTPS URL，例如 `https://xxxx.ngrok-free.app`。
4. 将 `.env.local` 中的 `NEXT_PUBLIC_APP_URL` 临时改为该 ngrok HTTPS URL：

```bash
NEXT_PUBLIC_APP_URL="https://xxxx.ngrok-free.app"
```

5. Phase 4 webhook route 完成后，用该地址注册 Telegram webhook：

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<NGROK_HTTPS_URL>/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

检查 webhook 状态：

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

注意事项：

- 每次重启免费 ngrok tunnel 后，Forwarding URL 可能变化，需要同步更新 `.env.local` 与 Telegram webhook。
- `NEXT_PUBLIC_APP_URL` 在本地 webhook 测试阶段使用 ngrok HTTPS URL；部署后改为 Vercel production URL。
- 如果 `npm run dev` 使用的不是 `3000` 端口，`ngrok http` 和 webhook URL 都要同步使用实际端口对应的 Forwarding URL。

## 7. Vercel 部署与环境变量

本项目推荐先完成本地功能开发与 ngrok webhook 端到端验证，再在最后部署到 Vercel。也就是说，Vercel 不需要在 Phase 2 或 Phase 4 前完成；只要提前知道最终需要哪些环境变量即可。

入口：

- Vercel New Project: <https://vercel.com/new>
- Vercel Environment Variables: <https://vercel.com/docs/environment-variables>

操作步骤：

1. 打开 Vercel New Project 页面。
2. 使用 GitHub、GitLab 或 Bitbucket 连接本项目仓库。
3. 导入项目时确认 framework preset 为 Next.js。
4. 在 `Environment Variables` 区域添加以下变量：

```bash
TELEGRAM_BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN"
TELEGRAM_WEBHOOK_SECRET="YOUR_TELEGRAM_WEBHOOK_SECRET"
QWEN_API_KEY="YOUR_QWEN_API_KEY"
QWEN_MODEL="qwen-plus"
QWEN_API_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
MONGODB_URI="YOUR_MONGODB_ATLAS_CONNECTION_STRING"
NEXT_PUBLIC_APP_URL="https://your-project.vercel.app"
ADMIN_POLLING_INTERVAL_MS="5000"
USER_RATE_LIMIT_WINDOW_MS="60000"
USER_RATE_LIMIT_MAX_MESSAGES="20"
RECENT_CONTEXT_MESSAGE_LIMIT="10"
```

5. 对 Production 环境至少配置全部变量。
6. 基础开发流程不使用 Vercel Preview URL 注册 Telegram webhook，避免 Preview URL 变化造成额外维护；如确实需要 Preview 测试，再为 Preview 配置同一组变量。
7. 点击 Deploy，等待部署完成。
8. 部署完成后，复制 production domain，例如 `https://your-project.vercel.app`。
9. 回到 Vercel project settings，将 `NEXT_PUBLIC_APP_URL` 更新为 production domain。
10. 重新部署一次，让最新环境变量进入 production deployment。

本地开发补充：

- Next.js 本地开发默认读取 `.env.local`。
- 如果使用 Vercel CLI，也可以通过 `vercel env pull` 拉取 Development 环境变量到本地 `.env` 文件；本项目仍建议保留 `.env.local` 作为主要本地配置。

## 8. Telegram Webhook 注册：ngrok 本地路径与 Vercel production 路径

Telegram 只会把消息推送到当前注册的一个 webhook URL。因此开发期间可以先注册到 ngrok URL，最后部署完成后再重新注册到 Vercel production URL。

### 8.1 本地 ngrok webhook 注册

适用阶段：

- Phase 4 完成 Next.js webhook route 后。
- Phase 5-9 每完成数据库、Qwen、错误处理、后台或 polling 功能后，需要用真实 Telegram 消息验证本地行为时。

前置条件：

- 本地 `npm run dev` 已启动。
- `ngrok http 3000` 已启动，并拿到当前 Forwarding HTTPS URL。
- `.env.local` 中的 `NEXT_PUBLIC_APP_URL` 已临时改为当前 ngrok HTTPS URL。
- `.env.local` 中已有真实 `TELEGRAM_BOT_TOKEN` 与 `TELEGRAM_WEBHOOK_SECRET`。

注册 webhook 到 ngrok：

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<NGROK_HTTPS_URL>/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

替换规则：

- `<TELEGRAM_BOT_TOKEN>` 替换为 BotFather 返回的 token。
- `<NGROK_HTTPS_URL>` 替换为当前 ngrok Forwarding HTTPS URL，例如 `https://xxxx.ngrok-free.app`。
- `<TELEGRAM_WEBHOOK_SECRET>` 替换为 `.env.local` 中配置的 secret。

示例：

```bash
curl "https://api.telegram.org/bot123456789:ABCDEF/setWebhook?url=https://xxxx.ngrok-free.app/api/telegram/webhook&secret_token=your-random-secret"
```

检查 webhook 状态：

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

如果返回结果中的 `url` 是当前 ngrok HTTPS URL，说明 Telegram 已经把 webhook 指向本地开发环境。此时可以在 Telegram 中发送 `/start`、点击按钮或发送普通文本，验证本地 `/api/telegram/webhook` 是否能收到 update 并回复。

ngrok 本地路径注意事项：

- 免费 ngrok tunnel 每次重启后 Forwarding URL 可能变化；URL 变化后必须重新调用 `setWebhook`。
- 修改 `.env.local` 中的 `NEXT_PUBLIC_APP_URL` 后，通常需要重启 `npm run dev`，确保 Next.js 读取到新值。
- 如果本地 Next.js 不是运行在 `3000` 端口，`ngrok http` 的端口和 webhook URL 都要同步使用实际端口对应的 Forwarding URL。
- 本地阶段不需要 Vercel production deployment，也不需要把 webhook 注册到 Vercel。

### 8.2 Vercel production webhook 注册

适用阶段：

- Phase 10 完成测试、README、Vercel 环境变量配置和 production deployment 后。
- 需要将 Telegram webhook 从本地 ngrok URL 正式切换到线上 Vercel URL 时。

前置条件：

- Vercel production deployment 已成功。
- Vercel Production 环境变量已配置完整。
- Vercel Production 中的 `NEXT_PUBLIC_APP_URL` 已填为 production URL。
- `TELEGRAM_BOT_TOKEN` 与 `TELEGRAM_WEBHOOK_SECRET` 已在 Vercel Production 环境变量中配置。

注册 webhook 到 Vercel production：

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<VERCEL_PRODUCTION_URL>/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

替换规则：

- `<TELEGRAM_BOT_TOKEN>` 替换为 BotFather 返回的 token。
- `<VERCEL_PRODUCTION_URL>` 替换为 Vercel production URL，例如 `https://your-project.vercel.app`。
- `<TELEGRAM_WEBHOOK_SECRET>` 替换为 `.env.local` 与 Vercel 环境变量中一致的 secret。

示例：

```bash
curl "https://api.telegram.org/bot123456789:ABCDEF/setWebhook?url=https://your-project.vercel.app/api/telegram/webhook&secret_token=your-random-secret"
```

检查 webhook 状态：

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

如果返回结果中的 `url` 已从 ngrok HTTPS URL 变为 Vercel production URL，说明切换完成。随后应在 Telegram 中重新测试 `/start`、按钮点击、普通 AI 问答、MongoDB 入库和后台更新。

如果需要移除 webhook：

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/deleteWebhook"
```

注意事项：

- Telegram 会在 webhook 请求 header 中带上 secret token，项目的 webhook route 需要与 `TELEGRAM_WEBHOOK_SECRET` 对比。
- 每次更换 webhook URL 或 webhook secret 后，都需要重新调用 `setWebhook`。
- `TELEGRAM_WEBHOOK_SECRET` 在本地 `.env.local`、ngrok `setWebhook` 命令、Vercel Production 环境变量和 Vercel `setWebhook` 命令中应保持一致。
- 前期默认不使用 Vercel Preview URL 做 Telegram webhook 验证；Preview URL 每次部署可能变化，容易导致 webhook 指向过期地址。

## 9. 最终检查清单

完成平台配置后，请确认：

- `.env.local` 已填写真实 `TELEGRAM_BOT_TOKEN`。
- `.env.local` 已填写真实 `TELEGRAM_WEBHOOK_SECRET`。
- `.env.local` 已填写真实 `QWEN_API_KEY`。
- `.env.local` 已确认 `QWEN_MODEL` 与 `QWEN_API_BASE_URL` 可用。
- `.env.local` 已填写真实 `MONGODB_URI`。
- `.env.local` 已填写当前可访问的 `NEXT_PUBLIC_APP_URL`。
- 本地 webhook 测试时，ngrok 已配置 authtoken，且 `NEXT_PUBLIC_APP_URL` 使用当前 Forwarding HTTPS URL。
- 本地 webhook 测试时，`getWebhookInfo` 显示 webhook URL 是当前 ngrok HTTPS URL。
- 最终部署阶段，Vercel Production 环境变量与本地 `.env.local` 的关键值一致。
- 最终部署阶段，`getWebhookInfo` 显示 webhook URL 已切换为 Vercel production URL。
- MongoDB Atlas Network Access 允许 Vercel 或当前开发环境访问。
- Telegram webhook 已注册到当前阶段对应的 `<PUBLIC_APP_URL>/api/telegram/webhook`。
- 没有把真实 secrets 写入 `.env.example`、README、截图或提交记录。
