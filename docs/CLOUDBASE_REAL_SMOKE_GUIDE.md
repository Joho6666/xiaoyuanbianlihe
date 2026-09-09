# 独立 CloudBase Heart Smoke 指南

> 本指南只验收 Heart 在独立 CloudBase 测试环境中的数据库、Storage 和部署可用性。它不代表微信真机验收，也不覆盖 Buddy、Bridge、Mutual、Market 或树洞的真实云端流程。

## 安全边界

1. 仅使用独立的开发或预发环境。脚本从小程序唯一的生产环境配置读取拒绝目标；生产环境会被直接拒绝，不能以参数绕过。
2. 本机临时设置 `TCB_ENV_ID`、`TCB_SECRET_ID`、`TCB_SECRET_KEY`，不要写入 `.env`、`cloudbaserc.json`、仓库或终端记录。
3. Smoke 使用有效的 `guit-hangtian` 校区来覆盖学校功能开关；隔离依赖独立环境、唯一 `runId`、专属文档 ID 和 Storage 路径，而不是无效的 `campusId: "__test__"`。
4. 所有数据库和 Storage 测试对象均由当前 run 跟踪并在完成或失败后清理；清理失败即为 `FAIL`。

## 执行顺序

在仓库根目录的同一 PowerShell 会话中临时设置凭证后执行：

```powershell
# 无副作用地核对目标和集合清单
npm run provision:heart -- --env <test-env>

# 显式创建缺失集合；已有集合保持不变
npm run provision:heart -- --env <test-env> --apply

# 在控制台按 docs/heart/CLOUDBASE_INDEX_PLAN.md 完成人工索引清单

# 仅部署独立环境的 dbOperations，并调用无副作用 health action
$env:TCB_ENV_ID = '<test-env>'
npm run deploy:cloudbase:test:dboperations -- --apply --required

# 真实 Storage + 数据库 Heart Smoke
npm run smoke:cloudbase:required
```

`provision-heart` 默认是 dry-run，且永不删除数据。索引创建尚未由 CLI 证明时只能保持 `MANUAL ACTION REQUIRED`。

## Smoke 覆盖与结果口径

数据库 Smoke 分 `[1/10]` 至 `[10/10]` 输出：资料 A/B、Discover、Like → Match、`startHeartChat`、通用消息、Free 1 次、Premium Test 3 次、并发 Free 额度、Block 后 Discover/Fate/Match/Heart chat 阻断、Disable 停止曝光与 finally 清理；同时上传 `heart/<publicUserId>/<uuid>.jpg`，验证跨用户照片拒绝和已移除照片删除。微信图片内容安全 API 在该独立 Smoke 中使用 Mock，结论必须单列为 `Real Image Content Security API: NOT RUN`。

- 未设置凭证：普通命令输出 `NOT RUN` 且退出 0；`--required` 退出 1。
- 生产环境 ID：拒绝执行，`--required` 退出 1。
- 业务断言、CloudBase API 或清理失败：`FAIL` 且退出 1。
- 只有所有断言及 run-scoped 清理成功时：`PASS`。

部署 health 调用只证明测试环境的 `dbOperations` 已部署且可执行，不模拟微信 OpenID，因此不能替代 Heart 业务 Smoke 或双账号真机验收。

## 仍需独立验收

微信 DevTools 真正 build/preview、两名已登录微信账号的 A/B 流程、存储访问规则和 CloudBase 控制台人工索引均仍是 Pilot 发布条件；不能因内存测试、health 调用或缺凭证 `NOT RUN` 将其标记为通过。
