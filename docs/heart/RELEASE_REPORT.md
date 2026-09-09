# 本轮交付验收

日期：2026-09-09。基线0303c8c，仅refactor/campus-platform-foundation，未合并旧PR。

## 完成度口径

Heart MVP按以下10项等权计数，当前8/10=80%。这是本轮交付指标，不是Beta Ready；运行环境未验证不得计通过。

|验收项|结果|
|---|---|
|主动开启、18+声明、资料安全审核|PASS（内存）|
|同校、双向偏好、授权、账号状态候选过滤|PASS（内存）|
|双向Like/Match幂等及聊天服务端门槛|PASS（内存）|
|免费1次、Premium3次、服务端上海自然日|PASS（内存）|
|额度事务回滚、空池不扣、重复候选避让|PASS（内存）|
|公开卡片白名单、复用Block/Report|PASS（内存）|
|完整CI和新增消息模块内存闭环|PASS|
|产品、额度、隐私、未来权益文档|PASS|
|微信开发者工具编译和页面验收|NOT RUN：服务端口关闭|
|独立CloudBase及A/B真机闭环|NOT RUN|

新增6个回归测试文件（Beta访问、Heart资料、Like、Fate、隐私、安全）；CI按独立Node进程运行，避免Premium测试环境变量污染其他用例。未声称精确单元用例总数，现有运行器按文件执行，部分文件内包含多项断言。

Memory Smoke: PASS。旧9步smoke + Heart资料/发现/匹配/身份解析/消息写入闭环 + Fate额度套件。
CloudBase Real Smoke: NOT RUN。
Payment: NOT IMPLEMENTED。

## 限制与后续

微信CLI两次返回服务端口关闭；进程退出码0并非编译成功。没有新的有效二维码。尚未将Heart云函数部署到生产。不可用旧预览码证明本轮完成。

正式运行需新建7个服务端专用集合和索引，核验存储权限，并真实验证事务冲突、Block/退出竞争、同校异校区推荐、跨校隔离与双账号聊天。解除普通拉黑后Heart阻断保守保留，当前无重新授权入口。

当前发现使用15条候选窗口，过滤后不足15条时仍允许继续下一页。缘分最多扫描2000条候选；仅面向30–100人试点，不能据此宣称扩校扩量完成。照片内容审核复用现有服务，Storage文件归属与跨用户读取需要独立环境验证。

## Heart Beta Hardening + Real CloudBase Readiness（2026-09-09）

基线：`78f2c06`；实现与验证均在 `refactor/campus-platform-foundation`。Heart 不再参与通用私信授权：Market、Buddy、Mutual 和既有会话保留其原有的通用账号、拉黑、禁言、频率与内容安全规则；仅 `startHeartChat` 需要 Heart Match。

| 项目 | 当前结果 |
|---|---|
| Node CI | PASS（新增 5 个 Heart 回归文件已由统一运行器执行） |
| Heart Chat Isolation：Market / Buddy / 历史会话 | PASS（内存回归） |
| Heart no match / matched / block | PASS（内存回归） |
| Fate Free 1/day / Premium Test 3/day | PASS（内存回归） |
| Fate reaction exclusion | PASS：LIKED、PASSED、MATCHED、BLOCKED 均不回流 |
| OpenID client URL | 通知、Heart、Buddy、Bridge、Mutual、Market 已改为 public `userId` 路由；详见 `docs/security/OPENID_CLIENT_AUDIT.md` |
| School feature flag | PASS（客户端入口隐藏 + 每个 Heart API 服务端拒绝） |
| Collections | READY FOR PROVISIONING：`npm run provision:heart -- --env <test-env>` 已验证 dry run |
| Indexes | MANUAL ACTION REQUIRED：详见 `docs/heart/CLOUDBASE_INDEX_PLAN.md` |
| CloudBase Real Smoke | NOT RUN：Missing Test Environment Credentials；required 模式已验证 exit 1 |
| WeChat DevTools | NOT RUN：CLI 已安装，但本轮未取得启用服务端口后的真实 preview/build 结果 |
| A/B real device | NOT RUN |
| Payment | NOT IMPLEMENTED |

Release blockers: independent CloudBase test environment credentials/provisioning, deployed-function real smoke, WeChat DevTools preview validation, and two-account physical-device acceptance. No production deployment or production database mutation occurred.
