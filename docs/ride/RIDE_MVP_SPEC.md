# 拼车同行 MVP 规格 (RIDE_MVP_SPEC)

> 版本：v1.0.0
> 日期：2026-09-11
> 责任人：Ride 模块主开发 Agent
> 基线：`origin/refactor/campus-platform-foundation`（60c0a51）
> 分支：`feat/campus-ride-mvp`

---

## 1. 产品定位

拼车同行是「校友同行信息匹配」：学生发布“我在哪里 → 我要去哪里 → 什么时候出发 → 几个人”，系统与同校校友的行程做相似度匹配，同时保留拼车广场供自由浏览。

- 平台**不提供车辆运输服务**，不是滴滴/网约车/司机平台/顺风车接客平台。
- 不开发：司机端、车辆、车牌、抢单、派单、司机钱包、平台抽佣、实时 GPS 轨迹、网约车计价、自动叫车、在线支付、多人群聊、AI/LLM 匹配、校园实名认证、评价体系。
- 车费由同行人线下自行协商（AA），平台不经手资金。

## 2. 用户故事

1. 学生 A：首页/发现页进入拼车同行 → 我要拼车 → 桂航南校门 → 桂林北站 → 现在出发 → 3 人 → 发布 → 立即看到“为你找到 N 个可能同行的人”。
2. 学生 B：打开拼车广场 → 看到 A 的行程（桂航南校门 → 桂林北站，今天 18:00，1/3）→ 申请加入。
3. 学生 A：收到申请通知 → 申请管理 → 接受。
4. 系统：创建 RIDE Contact Grant → A 与 B 可私信（复用现有私信，聊天顶部显示行程上下文）→ 双方约定集合点 → 各自叫正规网约车/出租车。
5. 发起人可标记 已出发 / 已完成 / 取消；成员可在出发前退出。

## 3. 页面结构（packageRide，8 页）

| 页面 | 路由 | 职责 |
| --- | --- | --- |
| 拼车首页 | `packageRide/pages/ride-home/ride-home` | 双入口（我要拼车/浏览广场）+ 热门目的地 + 最近行程 |
| 发布行程 | `packageRide/pages/ride-publish/ride-publish` | 起终点、现在出发/预约、时间浮动、人数、备注 |
| 地点选择 | `packageRide/pages/ride-place-select/ride-place-select` | 预置目录 + 关键词搜索（腾讯 LBS 升级钩子） |
| 拼车广场 | `packageRide/pages/ride-square/ride-square` | tabs 全部/现在出发/今天/明天 + 目的地搜索 + 分页 |
| 推荐同行 | `packageRide/pages/ride-matches/ride-matches` | 发布成功后展示匹配列表（匹配%） |
| 行程详情 | `packageRide/pages/ride-detail/ride-detail` | 路线/时间/人数/成员/小地图/申请/私信/举报/作者操作 |
| 我的行程 | `packageRide/pages/my-rides/my-rides` | 我发布的 / 我加入的 |
| 申请管理 | `packageRide/pages/ride-requests/ride-requests` | 收到的申请（审批）/ 我发出的申请 |

入口：发现页频道卡片、首页导航「拼车」、发布页顶部入口条、我的-菜单「我的拼车」。不改 tabBar 结构。

## 4. 数据模型

### 4.1 `ride_posts`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_id` | string | 自动生成 |
| `_openid` | string | 发起人（服务端注入，即 authorUserId；客户端不可伪造） |
| `authorSnapshot` | object | `{ nickName, avatarUrl }` 发布时快照，公开展示用 |
| `schoolId` | string | 由 campusId 经学校目录解析（`getCampusById().schoolId`） |
| `campusId` | string | 校区作用域（查询过滤） |
| `departureMode` | string | `NOW` / `SCHEDULED` |
| `origin` | object | `{ poiId, name, address, latitude, longitude }` |
| `destination` | object | 同上 |
| `departureTime` | Date | NOW=发布时间；SCHEDULED=预约时间 |
| `flexibleMinutes` | number | 15 / 30 / 60（NOW 默认 30） |
| `maxPeople` | number | 2–6，**含发起人** |
| `currentPeople` | number | 发布时 = 1（发起人占 1 席） |
| `note` | string | ≤100 字，违禁词 + 微信文本审核 |
| `status` | string | `OPEN/FULL/DEPARTED/COMPLETED/CANCELLED/EXPIRED` |
| `createdAt/updatedAt` | Date | 服务端时间 |
| `expiresAt` | Date | NOW = createdAt+60min；SCHEDULED = departureTime + flexibleMinutes + 30min grace |

### 4.2 `ride_join_requests`

| 字段 | 说明 |
| --- | --- |
| `_id` | `makeDeterministicId('ride_req', rideId, requesterOpenid)` → 重复申请幂等 |
| `rideId` / `_openid`（申请人）/ `requesterSnapshot` | |
| `status` | `PENDING/ACCEPTED/REJECTED/CANCELLED` |
| `createdAt` / `handledAt` | |

语义：已有 PENDING → 幂等返回；已有 ACCEPTED → 提示已加入；REJECTED → 拒绝重复申请；CANCELLED（自己撤销过）→ 重置回 PENDING 允许再次申请。

### 4.3 `ride_members`

| 字段 | 说明 |
| --- | --- |
| `_id` | `makeDeterministicId('ride_mem', rideId, memberOpenid)` |
| `rideId` / `_openid` | |
| `role` | `author` / `member`（发布时写入 author 成员） |
| `joinedAt` | |

### 4.4 复用既有集合

- `notifications`：新增 `type = ride_join_request / ride_join_accepted / ride_join_rejected / ride_cancelled / ride_member_left`，`targetType = 'ride'`，`targetId = rideId`。**不建 ride_notifications。**
- `contact_grants`：接受申请时服务端创建 `type = 'RIDE'`、`sourceId = rideId` 的授权（复用 `contacts.grantForOpenids`），双方即可私信；`grantIsActive` 对未知类型默认 active，无需改 contacts 模块。
- `user_blocks` / `reports`：复用安全体系；举报 `targetType = 'ride'` 加入后台 `reportTargetCollection()` 映射。
- `messages`：私信零改动（sendMessage 的 `contactAllowed` 门槛由 RIDE grant 满足）。

## 5. 状态机

```
OPEN ──→ FULL ──→ DEPARTED ──→ COMPLETED
 │        │  ↘
 │        │    ↘
 ▼        ▼      ↘
CANCELLED        EXPIRED（OPEN/FULL 可过期）
```

- `OPEN → FULL / DEPARTED / CANCELLED / EXPIRED`
- `FULL → OPEN（成员退出回补）/ DEPARTED / CANCELLED / EXPIRED / COMPLETED`
- `DEPARTED → COMPLETED`
- 终态：`COMPLETED / CANCELLED / EXPIRED`
- 与任务书偏差：允许 `FULL → CANCELLED`（发起人随时可取消）与 `FULL → COMPLETED`。
- **客户端提交的 status 字段一律忽略**；状态只能由服务端动作（审批满员、出发、完成、取消、惰性过期）流转，且每次流转经 `canTransitionRideStatus()` 校验。
- 惰性过期：读取时 `expiresAt <= now` 且状态为 OPEN/FULL → 视为 EXPIRED 并异步更正数据库（与 buddy deadline 处理一致），不依赖定时器。

## 6. 匹配算法（shared/domain/ride-matching.js，纯函数）

Eligibility（`isRideEligible`）：同 schoolId、`status=OPEN`、非本人、不在 Block 集合、`currentPeople < maxPeople`、未过期。

Score（`scoreRidePair`，满分 100）：

| 维度 | 规则 | 分值 |
| --- | --- | --- |
| 目的地 50 | 同 POI | +50 |
| | 距离 ≤500m | +45 |
| | ≤1.5km | +35 |
| | 其他 | 0 |
| 时间 30 | ≤15min | +30 |
| | ≤30min | +25 |
| | ≤60min | +15 |
| | 其他 | 0 |
| 起点 20 | ≤500m | +20 |
| | ≤1km | +15 |
| | ≤2km | +8 |
| | 其他 | 0 |

硬门槛（`isRecommendable`）：

- 目的地分 < 35 → 不推荐；
- 时间差 > 允许窗口 → 不推荐。窗口：任一行程为 NOW 时 60min；双方均为 SCHEDULED 时 `max(flexibleA, flexibleB)`。

匹配百分比 = `clamp(score, 0, 99)`，仅用于 UX 展示，不暴露算法细节。推荐列表 Top 10。

用例验收（§测试）：A 同路线 18:00/18:10 = 高分；C 北门→北站 18:30 = 中分；D 目的地不同 = 不推荐；E 同路线 21:00 = 不推荐；BLOCKED / EXPIRED = 不推荐。

服务端流程：按 `campusId + status=OPEN + expiresAt>now + departureTime 粗窗口` 取候选（≤50）→ 排除 Block（`findAuthorsHiddenByBlockRelation`）→ 纯函数打分排序 → Top 10。不使用 geoNear / Route Matrix。

## 7. 地点数据

- 地点结构：`{ poiId, name, address, latitude, longitude, category, hot }`。
- 第一版数据源 = 预置目录（桂航南/北校门、桂林站、桂林北站、桂林西站、两江机场、万达广场、东西巷、阳朔等），存放于：
  - `shared/domain/ride-places.js`（客户端/测试源，镜像到 `campus_treehole/utils/domain/`）
  - `campus_treehole/cloudfunctions/dbOperations/domain/ride-places.js`（云函数副本）
  - contract 测试断言两份目录同步。
- `searchRidePlaces` 服务端做目录关键词/分类过滤；预留 `TENCENT_LBS_KEY` 环境变量：配置后切换腾讯位置服务 webservice POI 搜索，数据结构不变。**不引入定位权限、不用 wx.chooseLocation。**
- 公开面只展示 POI 名称；经纬度仅详情页小地图使用；不采集、不展示实时位置。

## 8. 服务端 Action（modules/ride.js，flat camelCase）

| Action | 权限 | 说明 |
| --- | --- | --- |
| `publishRide` | 登录 | 限流 + 内容审核；忽略客户端 status；写 author 成员 |
| `getRidePlaces` | 公开读 | 预置目录（可按 category/hot 过滤） |
| `searchRidePlaces` | 公开读 | 目录关键词搜索（腾讯升级钩子） |
| `getRideSquare` | 公开读 | tab=全部/现在出发/今天/明天 + keyword + 20/页；Block 过滤；脱敏白名单 |
| `getRideMatches` | 仅作者 | 发布成功后的推荐列表（Top 10） |
| `getRideById` | 公开读 | Block 检查；脱敏；viewer 关系态（申请态/成员态/是否作者） |
| `applyRideJoin` | 登录 | 非本人/OPEN/未过期/有余位/双向 Block 检查/幂等 |
| `cancelRideJoin` | 申请人 | 撤销自己的 PENDING |
| `reviewRideJoin` | 仅作者 | accept/reject；**事务内**容量检查 + 写成员 + 满员置 FULL + 创建 RIDE grant + 通知 |
| `updateRideStatus` | 仅作者 | depart/complete/cancel；状态机校验；取消通知成员并拒绝残余 PENDING |
| `leaveRide` | 成员 | 出发前退出；回补名额；FULL→OPEN；通知作者 |
| `getMyRides` | 登录 | tab=published/joined |
| `getRideRequests` | 登录 | tab=received/sent |
| `startRideContact` | 成员/作者 | 校验双方为成员 → 创建/确认 RIDE grant → 返回 targetUserId |

容量并发（关键）：`reviewRideJoin(accept)` 使用 `db.startTransaction()`（与 buddy 审批同一模式）：事务内读 request 必须 PENDING、读 ride 必须 OPEN 且 `currentPeople < maxPeople` → 更新 request=ACCEPTED、`currentPeople+1`、达上限置 FULL → commit。两个并发接受最后 1 席时事务串行化，只有一个成功。成员写入用确定性 `_id` 兜底防重。

## 9. 隐私与安全

- 序列化：广场/匹配/详情对非作者返回 `publicRidePost()` 白名单（剥离 `_openid`/`authorOpenid`，`authorId = publicId(openid)` 确定性 UUID），复用 `shared/public-data.js` 的 `sanitizePublicPost` 语义；**绝不返回** openid、numericId、internalUserId、手机号、微信、实时位置、宿舍地址。
- Block：广场与匹配前过滤（`findAuthorsHiddenByBlockRelation`）；申请前 `conversationBlocked` 双向检查；详情页被 Block 返回不可查看。
- 内容安全：备注走 `createContentValidator`（违禁词 + 微信 msgSecCheck），与 buddy 一致。
- 限流：`checkRateLimit`（发布 60min≤10、申请 60min≤30）。
- 页面轻量提示：「校园便利盒仅提供同行信息匹配，不提供车辆运输服务。请使用正规出租车、网约车或公共交通工具出行。车费请同行人员自行协商 AA。」
- 集合权限：三个新集合设为仅云函数访问（控制台/脚本核对）。

## 10. 消息与通知

- 私信：复用现有私信，不建第二套 IM、不建群聊（A↔B、A↔C、A↔D 各自单聊）。
- 聊天入口：详情页「私信发起人」/成员列表 → `startRideContact` → 跳转 `/pages/chat/chat?targetUserId=…&title=…&rideId=…`；聊天页顶部显示行程上下文横幅（路线+时间，点击回详情）。
- 应用内通知（复用 notifications 集合与消息页）：收到拼车申请（ride_join_request→作者）、申请已通过（ride_join_accepted）、申请被拒绝（ride_join_rejected）、行程取消（ride_cancelled）、成员退出（ride_member_left）。消息页 `formatInteractionText` / `formatInteractionTypeLabel` / `onNotificationTap` 增加 ride 分支（跳 ride-detail / ride-requests）。
- 订阅消息推送（notifySender 模板）：本轮 **NOT IMPLEMENTED**（需小程序后台模板 ID）。

## 11. 权限矩阵

| 操作 | 作者 | 已接受成员 | PENDING 申请人 | 其他校友 | 被 Block |
| --- | --- | --- | --- | --- | --- |
| 查看广场/详情 | ✓ | ✓ | ✓ | ✓ | ✗ |
| 申请加入 | ✗（自己） | ✗ | 幂等 | ✓ | ✗ |
| 审批申请 | ✓ | ✗ | ✗ | ✗ | ✗ |
| 私信（首连） | 成员间 ✓ | 成员间 ✓ | ✗ | ✗ | ✗ |
| 出发/完成/取消 | ✓ | ✗ | ✗ | ✗ | ✗ |
| 退出行程 | — | ✓（出发前） | ✗ | ✗ | ✗ |

## 12. 测试

| 文件 | 覆盖 |
| --- | --- |
| `test/unit/ride-domain.test.js` | 实体构造、NOW/SCHEDULED 过期数学、状态机合法/非法流转 |
| `test/unit/ride-matching.test.js` | 任务书全场景 A/B/C/D/E + BLOCKED + EXPIRED + 排序 + Top10 截断 |
| `test/regression/ride-requests.test.js` | 自己申请 FAIL、重复申请幂等、FULL/CANCELLED/EXPIRED 不可申请、非作者审批 FAIL、撤销/重申语义 |
| `test/regression/ride-capacity.test.js` | 双人并发抢最后 1 席 → 恰好一人 ACCEPTED；currentPeople 永不超 maxPeople |
| `test/regression/ride-security.test.js` | 序列化白名单（无 openid/numericId/精确坐标泄露）、Block 不可申请/不推荐、伪造 status 被拒、RIDE grant 建立后私信放行（contactAllowed 403→0） |
| `test/regression/ride-action-contract.test.js` | 客户端 `callDB('...')` 字面量 ⊆ 服务端注册 action；双端地点目录同步 |

测试登记进 `scripts/run-tests.js` testFiles；`scripts/lint.js` TARGET_DIRS 增加 `campus_treehole/packageRide`。

## 13. 索引

见 [INDEXES.md](./INDEXES.md)。集合需预创建（云函数不保证 createCollection），脚本 `campus_treehole/scripts/run-ride-nosql.js` 输出创建/索引清单。

## 14. 验收标准

- 任务书 §56 六步场景（A 发布→推荐；B 广场申请；A 接受；私信；约定集合；自行叫车）全链路可走通。
- Release Gate（`docs/ride/RELEASE_GATE.md`）逐项 PASS/FAIL/NOT RUN/NOT IMPLEMENTED。
- `npm run ci`（validate + lint + test）全绿。

## 15. 与任务书的偏差说明

1. **Contact Grant 已存在**于本基线（`contact_grants` + `contacts` 模块），接受申请时创建 `type='RIDE'` 授权；私信本身有 `contactAllowed` 门槛，grant 是首连私信的**必要**条件——按任务书原意实现。
2. 腾讯 POI → 预置目录落地 + `TENCENT_LBS_KEY` 升级钩子（仓库无 Key、无定位权限声明，不引入合规成本）。
3. authorUserId 沿用 `_openid` 服务端注入惯例；公开面使用 `publicId`（确定性 UUID）。
4. 状态机增加 `FULL→CANCELLED`、`FULL→COMPLETED`。
5. 首页/发布页入口最小侵入（导航「拼车」+ 编辑器顶部入口条），不改 tabBar。
6. 多人场景只做两两单聊，无群聊。
