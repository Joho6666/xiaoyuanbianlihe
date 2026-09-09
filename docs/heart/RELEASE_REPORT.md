# Heart Beta Release Candidate Report

日期：2026-09-09。分支：`refactor/campus-platform-foundation`。本报告只记录已实际验证的结果；`NOT RUN` 不等同于通过。

## 已验证

| 项目 | 结果 | 证据 |
|---|---|---|
| GitHub Actions Node 18/20 | PASS | 提交 `8ac294b` 的 [CI run](https://github.com/Joho6666/xiaoyuanbianlihe/actions/runs/34362464536)：Node 18.x 与 20.x 的 `npm ci`、验证、语法检查和统一测试均成功。后续提交必须重新核验对应 HEAD。 |
| 本地统一 CI | PASS | `npm run ci`：学校、领域、配置、144 个 JS 语法文件和统一回归套件均通过；不替代远端 CI。 |
| 内存集成 Smoke | PASS | `npm run test:integration:memory` 通过；这不是 CloudBase PASS。 |
| Heart Chat Isolation | PASS（内存） | Market/Buddy/历史私信不要求 Heart Match；`startHeartChat` 仍要求 Match，Block 拒绝全部来源。 |
| Fate 额度与反应排除 | PASS（内存） | Free 1/day、Premium Test 3/day、上海自然日、并发、失败回滚、空池不扣和已反应对象排除均有回归。 |
| CloudBase 保护边界 | PASS | 无凭证普通 Smoke 为 `NOT RUN`/退出 0；required 为 `NOT RUN`/退出 1；生产目标被拒绝；部署脚本要求显式环境 ID。 |
| Contact Grant 授权 | PASS（内存） | 陌生入口拒绝、Market 下架后不再授权新会话、Mutual、Block 与 Heart Match 入口均有回归。 |
| Heart CloudBase 索引 | MANUAL ACTION REQUIRED | 见 `docs/heart/CLOUDBASE_INDEX_PLAN.md`；CLI 未证明创建时不得写为 READY。 |

## 独立环境 Smoke

真实 Smoke 已具备以下执行契约：唯一 `runId`、仅独立环境、生产环境硬拒绝、真实 `heart/<publicUserId>/<uuid>.jpg` 上传、跨用户照片拒绝、移除照片删除检查、数据库与 Storage run-scoped 清理。它覆盖 Discover、Like/Match、Heart chat、通用消息、Free/Premium Fate、并发额度、Block 和 Disable。

部署检查会显式部署独立环境的 `dbOperations`，再调用仅返回服务名的无副作用 `health` action。该检查仅证明函数可执行；完整 Heart 业务仍由同版本模块连接真实 CloudBase 数据库验证。

## 未执行与发布阻塞项

| 项目 | 结果 | 原因 |
|---|---|---|
| Heart 集合 provisioning | NOT RUN | 尚未提供独立 `TCB_ENV_ID`，未执行 `--apply`。 |
| CloudBase Real Smoke | NOT RUN | Missing Test Environment Credentials；未写入任何 CloudBase 环境。 |
| 测试环境 `dbOperations` 部署/health | NOT RUN | 缺少明确的独立环境 ID 与临时会话凭证。 |
| CloudBase 控制台索引 | MANUAL ACTION REQUIRED | 必须在独立环境按索引计划创建并留存核对结果。 |
| 微信 DevTools build/preview | NOT RUN | 服务端口未启用，不能将 CLI 存在或退出码当作编译成功。 |
| 双账号真机 A/B | NOT RUN | 尚未完成两台已登录测试设备闭环。 |

Payment：**NOT IMPLEMENTED**。未修改 `main`、未部署生产云函数、未向生产数据库或 Storage 写入测试数据。
