# 真实 CloudBase 云开发端到端 Smoke 操作指南 (CLOUDBASE_REAL_SMOKE_GUIDE)

> 目标：提供在真实独立腾讯云开发环境（CloudBase）上执行全功能链路验收的标准流程，坚决杜绝测试脏数据污染正式校区。

---

## 一、基本原则与安全防线

1. **环境隔离**：
   - 默认**严禁**直接向线上正式环境运行自动化增删脚本；即使传入生产环境 ID，脚本也会拒绝。
   - 必须使用独立的开发/预发环境（如新建独立的腾讯云开发环境 `xyblh-dev-xxxx`）。
2. **校区隔离**：
   - 测试脚本写入的所有实体必须强制打上 `campusId: '__test__'` 标签。
   - 正式微信小程序前端由于学校目录不存在 `__test__`，任何学生在正常使用中均无法看到测试内容。
3. **闭环自清理**：
   - 脚本必须在 `finally` 阶段逐一物理删除所有产生的测试记录。

---

## 二、执行指令与参数

```bash
# 1. 纯内存沙箱测试 (秒级完成，日常 CI 默认运行)
npm run test:integration:memory

# 2. 真实 CloudBase 端到端测试 (需先配置测试凭证)
export TCB_ENV_ID="your-test-env-id"
export TCB_SECRET_ID="AKIDxxxx"
export TCB_SECRET_KEY="xxxx"
npm run smoke:cloudbase

# Release Gate：凭证缺失、生产环境或真实 Smoke 失败都会退出 1
npm run smoke:cloudbase:required
```

---

无凭证时普通命令输出 `NOT RUN: Missing Test Environment Credentials` 并退出 0；required 命令退出 1。不得把此状态或内存测试写为 CloudBase PASS。

## 三、真实环境覆盖用例

| 模块 | 测试链路 | 验证点 |
| :--- | :--- | :--- |
| **同频 Buddy** | `addBuddyPost` → `getBuddyPosts` → `applyBuddyPost` → `handleBuddyApplication` (ACCEPT) | 验证事务锁人数防超员、自动置为 FULL、过期时间计算 |
| **友桥 Bridge** | `updateLanguageProfile` → `getLanguagePartners` → `getLanguagePartnerProfile` | 验证互补推荐打分、严格排除未完善资料用户、隐私 OpenID 隐藏 |
| **校园互助** | `addMutualPost` → `getMutualPosts` → `updateMutualPostStatus` (resolved) | 验证违禁词拦截、微信文本安全审查、状态变更流转 |
| **二手闲置** | `addMarketGoods` → `getMarketGoods` → `deleteMarketGoods` | 验证图片安全检查、价格校验、校区严格隔离 |
| **树洞动态** | `addPost` → `getPosts` → `toggleLikePost` → `deletePost` | 验证点赞数自增、校区隔离与作者安全返回 |
| **Heart** | 资料 A/B/C… → Discover → Like/Match → `startHeartChat` → `sendMessage` → Free/Premium Fate → Block → Disable | 验证真实集合写入、事务额度、聊天门槛、Block 和 finally 清理 |

执行前先运行 `npm run provision:heart -- --env <test-env>`。只在确认 dry run 输出正确后，再使用 `--apply` 创建缺失集合；索引按 `docs/heart/CLOUDBASE_INDEX_PLAN.md` 在控制台确认。
