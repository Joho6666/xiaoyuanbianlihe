# Ride 1.1 Product Hardening & Bugfix Report

> 版本：v1.1.0
> 日期：2026-09-13
> 分支：`feat/campus-ride-mvp`
> 评审基础：PR #3 Codex Review & 任务书 P1 清单

---

## 1. Known Issues & Fixed Summary

| 编号 | 模块 | 缺陷描述 | 修复方案 | 验证测试 |
| --- | --- | --- | --- | --- |
| **P1-1** | 限流 | `checkRateLimit` 硬编码查询 `createTime`，ride 使用 `createdAt` 且类型不兼容，导致限流计数永远为 0，限流完全失效 | 抽象独立 `createRateLimiter` 纯工厂，增加 `field` 参数；ride 明确传入 `'createdAt'` 并将发布与申请记录存储为 `db.serverDate()` | `test/regression/ride-rate-limit.test.js` 真实契约验证 10/10 及 30/30 上限拦截 |
| **P1-2** | 状态 | 审批加入申请（`reviewRideJoin`）在事务中未校验 `expiresAt`，导致已过期行程仍可被发起人通过 | 审批事务内部加入 `resolveExpiredRideStatus` 检查，若已过期立即回滚事务并打回，事务外补偿更正为 `EXPIRED` | `test/regression/ride-requests.test.js` 验证过期审批失败 |
| **P1-3** | 事务 | 成员记录（`ride_members`）在审批主事务提交后单独在外部添加，若失败会导致席位已被占用但成员丢失的数据不一致 | 将 `ride_members` 写入完全合并进 `reviewRideJoin` 的同一个事务内，确保要么全部生效要么全部回滚 | `test/regression/ride-capacity.test.js` 注入 commit 失败验证零残留 |
| **P1-4** | 状态 | 成员退出（`leaveRide`）只删除了成员记录和回补名额，未同步修改申请单，导致申请单仍为 `ACCEPTED`，退出后无法重新申请 | 在 `leaveRide` 事务中同步将对应的 `ride_join_requests` 状态原子更新为 `CANCELLED`，退出者可再次发起申请 | `test/regression/ride-requests.test.js` 验证退出后状态同步及可重申 |
| **P1-5** | 隐私/UX | 行程发布时未对发起人信息打快照持久化，导致广场与匹配页大多降级展示为匿名“同学” | `publishRide` 时从用户档案提取公开字段持久化至 `authorSnapshot: { nickName, avatarUrl }`，绝不携带私密标识 | `test/regression/ride-security.test.js` 验证快照正确展示 |
| **P1-6** | UX | 发布页中起点为 null 但界面渲染了默认地点文字，导致用户误认为已选择起点，提交时触发报错 | 发布页 `onLoad` 时主动通过预置地点目录获取 `guat-south-gate` 并赋予 `origin`，且占位符文案更正为“选择出发地” | 小程序页面编译与加载逻辑核验 |
| **P1-7** | 隐私 | 行程对象包含经纬度与详细地址，在公开广场列表中暴露存在高精度轨迹泄漏风险 | 划分 `publicPlace`（仅 poiId/name/shortName）与 `memberPlace`（包含坐标与地址）；广场与列表仅给脱敏信息，只有发起人与已确认成员能获取完整坐标用于小地图 | `test/regression/ride-public-privacy.test.js` 验证公开 JSON 过滤 |
| **P1-8** | 安全 | 允许任意两个行程成员之间直接建立私信联系，不符合第一版“由发起人统一协调”的原则，且已取消/已过期行程仍可建连 | `startRideContact` 严格限定只能在 发起人 ↔ 成员 之间建立联系，禁止成员间横向联系；已取消/已过期行程禁止新建联系 | `test/regression/ride-contact-auth.test.js` 覆盖全状态与关系矩阵 |
| **P1-9** | 状态机 | 状态机允许 `FULL -> COMPLETED`，跳过了“已出发”阶段 | 移除 `FULL -> COMPLETED` 转移通道，规范为必须先流转至 `DEPARTED`，再流转至 `COMPLETED`；全端同步 | `test/unit/ride-domain.test.js` 翻转断言并通过 |
| **§11** | 举报 | 举报功能未对 ride 目标进行真实性校验，允许举报不存在的行程；后台映射缺失 | 在 `safety.js` 中接入 `targetType === 'ride'` 校验，确保行程在 `ride_posts` 真实存在；确认 `webAdminHandlers` 正确映射至 `ride_posts` | `test/regression/ride-report.test.js` 验证存在性检查与后台处理 |
| **§22** | 并发 | `updateRideStatus` 采用单纯 doc update，在并发取消或出发时可能存在状态竞态 | 采用原子条件更新 `where({ _id, status: post.status })`，确保状态未变方可变更 | `test/regression/ride-capacity.test.js` 验证竞态条件拦截 |
| **§31** | 容错 | 成员读取异常时直接忽略，可能导致授权判定非预期放行（fail-open） | 关键鉴权链路统一采用 fail-closed：数据库异常立即阻断操作并返回友好的统一服务异常提示 | 代码审计与 `startRideContact` 测试 |
| **§12** | 体验 | 缺少“使用当前位置附近”快捷选点入口 | 页面增加主动定位按钮，利用 `nearestRidePlaces` 纯函数计算预置地点距离并排序推荐；`app.json` 补充权限声明 | `test/unit/ride-domain.test.js` 覆盖计算逻辑 |
| **§13** | 体验 | 地点搜索高频触发，缺少防抖机制 | 在 `onKeywordInput` 增加 400ms 防抖定时器，兼顾点击确认立即搜索 | 代码审查 |
| **§16** | 排序 | 匹配算法在得分相同且时间相同时排序不稳定 | 增加包含 4 级决策的确定性排序：得分降序 -> 时间差升序 -> 出发时间升序 -> ID 字典序 | `test/unit/ride-matching.test.js` 验证平局场景稳定排序 |
| **§17** | 体验 | 广场 NOW 模式时间显示刻板 | 增加 `formatNowUrgency`（刚刚 / 15分钟内 / 30分钟内 / 即将过期） | `test/unit/ride-domain.test.js` 验证时间阶段划分 |
| **§19** | 体验 | 申请被拒绝后详情页仍显示“申请加入”按钮，点击被后端拒绝 | 详情页根据 `myRequest.status === 'REJECTED'` 展示为“申请未通过”禁用按钮 | 详情页 WXML 状态补全 |

---

## 2. 状态机规范 (Ride 1.1)

```
        ┌─────────────┐
        │    OPEN     │◀───────────┐
        └──────┬──────┘            │
               │                   │
      ┌────────┴────────┐          │
      ▼                 ▼          │
┌───────────┐     ┌───────────┐    │ (成员退出)
│   FULL    │     │ DEPARTED  │    │
└─────┬─────┘     └─────┬─────┘    │
      │                 │          │
      │ (成员退出)      │          │
      └─────────────────┼──────────┘
                        │
                        ▼
                  ┌───────────┐
                  │ COMPLETED │
                  └───────────┘

终态（不可逆）：
OPEN / FULL ──(取消)──▶ CANCELLED
OPEN / FULL ──(到期)──▶ EXPIRED
```

---

## 3. 测试覆盖矩阵

全部 11 个专用测试套件均处于 **PASS** 状态：
- `test/unit/ride-domain.test.js` (11 项断言)
- `test/unit/ride-matching.test.js` (12 项断言)
- `test/regression/ride-action-contract.test.js` (14 ride actions, 99 client calls)
- `test/regression/ride-capacity.test.js` (串行事务与容量防护)
- `test/regression/ride-contact-auth.test.js` (双向与单向联系权限)
- `test/regression/ride-e2e.test.js` (§39 双账号工作流 + §40 过期闭环)
- `test/regression/ride-public-privacy.test.js` (地理精度与身份脱敏)
- `test/regression/ride-rate-limit.test.js` (真实限流契约)
- `test/regression/ride-report.test.js` (举报存在性与管理端映射)
- `test/regression/ride-requests.test.js` (申请、幂等、审批与退出)
- `test/regression/ride-security.test.js` (伪造防护与黑名单阻断)
