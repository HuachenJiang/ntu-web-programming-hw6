# AGENTS.md

本文件记录本项目的协作与维护规范。所有后续开发都应先阅读 `spec.md`、`docs/dev-phase.md` 与本文件，再修改代码。

## 开发原则

- 修改代码前先理解当前阶段目标、验收条件和已有架构文档。
- 项目整体保持模块化、可测试、易维护。
- 尽量保持 single source of truth，避免不必要的 fallback、兼容分支和重复配置。
- 新增功能必须同步考虑测试；无法补测试时，需要在交付说明中写清原因。
- 优先沿用项目既有目录职责，不为单个功能引入过度抽象。

## 目录约定

- `src/app`: Next.js App Router 页面与 API routes。
- `src/config`: 环境变量与应用配置读取。
- `src/lib`: 通用纯函数、常量与跨模块工具。
- `src/services`: 面向业务流程的服务层，例如 Telegram、Gemini、dashboard 统计。
- `src/repositories`: 数据访问层，隔离 MongoDB/Mongoose 细节。
- `src/models`: Mongoose schema 与 model。
- `src/types`: 跨模块共享类型。
- `src/errors`: 统一错误类型与错误处理辅助。
- `src/tests`: 单元测试与轻量集成测试。

## 常用命令

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run format:check
```
