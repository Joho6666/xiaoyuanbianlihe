# Ride Release Gate

> 版本：v1.1.0
> 日期：2026-09-13
> 分支：`feat/campus-ride-mvp`（基线 `origin/refactor/campus-platform-foundation` @ 60c0a51）
> 状态取值：PASS / FAIL / NOT RUN / NOT IMPLEMENTED

| 项 | 状态 | 证据 / 说明 |
| --- | --- | --- |
| Ride Domain | PASS | `test/unit/ride-domain.test.js`：实体构造、NOW/SCHEDULED 过期数学、收紧状态机(禁 FULL->COMPLETED)、最近地点计算、NOW 紧迫度标签 11 项全过 |
| Publish | PASS | `publishRide`：真实时间戳限流(P1-1)、authorSnapshot 持久化(P1-5)、内容审核、伪造字段剥离、author 成员写入；`ride-security.test.js` 验证 |
| Place Select | PASS | 预置目录 9 地点 + 分类/防抖搜索 + 附近定位选点；三份目录同步由 contract 测试守护；`TENCENT_LBS_KEY` 升级钩子就绪 |
| NOW Mode | PASS | departureTime=发布时间、60min TTL；匹配窗口 60min；NOW 紧迫度标签；`ride-domain.test.js` |
| Scheduled Mode | PASS | 未来 14 天校验、flex 15/30/60、过期 = 出发+flex+30min；窗口 = max(双方 flex)；`ride-matching.test.js` |
| Ride Square | PASS | `getRideSquare`：tabs 全部/现在出发/今天/明天、目的地搜索、Block 过滤、20/页、惰性过期、publicPlace 坐标脱敏 |
| Matching | PASS | 任务书 §46 全场景：A=99 高分、C=推荐、D/E/BLOCKED/EXPIRED/FULL/CANCELLED=不推荐；4 级确定性平局排序；Top10 截断；`ride-matching.test.js` 12 项全过 |
| Join Request | PASS | `ride-requests.test.js`：自申请 FAIL、重复申请幂等、过期/满员/已取消拒绝审批(P1-2)、非作者审批 FAIL、拒绝后禁重申、成员退出后 request 置 CANCELLED 且可重申(P1-4) |
| Capacity | PASS | `ride-capacity.test.js`：并发审批最后 1 席恰好一人成功（事务串行化），member 写入原子提交(P1-3)，currentPeople ≤ maxPeople，leave 回补 FULL→OPEN，原子条件更新防竞态(§22) |
| Block | PASS | 广场过滤、详情拦截、申请双向拦截；`ride-security.test.js` |
| Report | PASS | 详情页举报入口 → `reportContent(targetType:'ride')` 校验目标行程真实存在(§11)；管理后台 `reportTargetCollection` 正确映射至 `ride_posts` 并在违规时标记处理；`ride-report.test.js` 验证 |
| Chat | PASS | 接受后创建 RIDE Contact Grant → sendMessage 403→0；`startRideContact` 严格限制仅 发起人 ↔ 成员 双向联系(P1-8)，已结束行程禁止联系；聊天页 Ride 上下文横幅；`ride-contact-auth.test.js` 验证 |
| Notification | PASS | ride_join_request / accepted / rejected / cancelled / member_left 写入 notifications；消息页文案/跳转 switch 已扩展 |
| Action Contract | PASS | `ride-action-contract.test.js`：14 个 ride action 全注册；99 个客户端 action 全覆盖校验；三份目录同步 |
| Rate Limit | PASS | `ride-rate-limit.test.js`：真实契约工厂，彻底解决 createTime vs createdAt 不匹配导致的限流绕过问题(P1-1) |
| Public Privacy | PASS | `ride-public-privacy.test.js`：publicPlace 剥离经纬度和详细地址，仅成员与作者返回 memberPlace 全量坐标(P1-7) |
| Dual-Account E2E | PASS | `test/regression/ride-e2e.test.js`：学生 A/B 真实双账号完整工作流与过期行程全生命周期保护全覆盖(§39/§40) |
| CI | PASS* | `validate-config` 0 异常、`lint` 223 文件 0 错误、测试 11/11 Ride 套件 PASS。*基线遗留：`express-input-stability`、`express-3-7-ui` 两个 Express UI 测试在基线 commit 60c0a51 上同样失败（已用 stash 验证），非本分支引入 |
| CloudBase | NOT RUN | 需开发者工具/CLI 云环境部署 `dbOperations` + 预创建 ride_posts / ride_join_requests / ride_members + 索引（见 docs/ride/INDEXES.md 与 campus_treehole/scripts/run-ride-nosql.js） |
| DevTools | NOT RUN | 需在微信开发者工具安全设置中手动开启“服务端口”或通过项目界面直接导入 worktree 目录 |
| iOS | NOT RUN | 需真机/开发者工具 iOS 模拟环境验证 |
| Android | NOT RUN | 需真机/开发者工具 Android 模拟环境验证 |
| 订阅消息推送 | NOT IMPLEMENTED | notifySender 需小程序后台模板 ID 与场景映射，本轮仅应用内通知 |
| 腾讯 POI 实时搜索 | NOT IMPLEMENTED | 配置 `TENCENT_LBS_KEY` 云函数环境变量后自动启用；未配置时回退预置目录搜索（功能可用） |

## 部署前置（CloudBase 解除 NOT RUN 的步骤）

1. 预创建集合并设为仅云函数访问：`ride_posts`、`ride_join_requests`、`ride_members`。
2. 按 `docs/ride/INDEXES.md` 建议创建索引。
3. 部署云函数 `dbOperations`。
4. （可选）云函数环境变量 `TENCENT_LBS_KEY` 启用腾讯 POI 实时搜索。
