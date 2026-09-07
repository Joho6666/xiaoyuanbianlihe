# 三合一全生命周期迁移路线图 (MIGRATION_PLAN)

> 版本：v1.0.0  
> 目标：将 Tongpin (同频找搭子) 与 UniBridge (友桥中外交流) 平稳、渐进式地并入校园便利盒微信小程序宿主。

---

## 路线图总览

```
Phase 0 [当前执行] ────────► Phase 1 ────────► Phase 2 ────────► Phase 3
校园便利盒底座重构           统一用户与身份      统一即时消息       Tongpin搭子系统
(导航/分包/dbOp拆分/CI)      (User/Identity)   (Conversation)    (Buddy/成局/评价)
        │
        ▼
Phase 4 ────────► Phase 5 ────────► Phase 6 ────────► Phase 7 ────────► Phase 8
UniBridge语言     统一活动日程       统一集市与贴文     统一后台与风控     微信公众号生态
(中英双语/匹配)    (Event/Party)     (Market/Post)     (Admin/Audit)     (模板消息/跨端)
```

---

## Phase 0: 校园便利盒底座重构 (Foundation & Modularization)

- **目标**：解除巨型单文件债务，将集市移出 TabBar 并引入发现频道，启动小程序分包，建立 Domain 契约、Auth 适配器与 i18n 基础工具库，健全 CI/CD。
- **改动文件**：
  - `campus_treehole/app.json`: TabBar 更新为“首页、发现、发布、消息、我”，新增分包 `packageMarket`, `packageEvents`
  - `campus_treehole/custom-tab-bar/*`: 替换第 2 个 Tab 为“发现 (discover)”，使用原生高质感指南针图标
  - `campus_treehole/pages/discover/*`: 新建发现页，汇聚同频、友桥、集市、活动、校园圈等核心入口
  - `campus_treehole/cloudfunctions/dbOperations/*`: 拆分为 `modules/*` 与 `shared/*`，保持旧 action 协议 100% 兼容
  - `shared/domain/*` 或 `campus_treehole/utils/domain/*`: 统一 TypeScript / JSDoc 领域契约定义
  - `campus_treehole/utils/i18n.js` & `campus_treehole/locales/*`: 双语底座
  - `.github/workflows/ci.yml`: 自动化语法与测试检查
- **数据迁移**：无（纯结构解耦与向后兼容适配器）。
- **向后兼容**：旧版所有客户端调用 action 完全不变；旧版 `pages/market/market` 保持可用并由发现页与旧路由支持重定向/跳转。
- **测试**：云函数 dispatch 回归测试套件，页面分包路由冒烟测试。
- **回滚方案**：Git 单独还原 `app.json` 与 `dbOperations/index.js`，无数据脏读风险。
- **完成条件**：CI 流水线绿色通过，发现页正常打开，原集市/贴文/私信无报错。

---

## Phase 1: 统一 User / Identity / School / Campus

- **目标**：彻底打破 `_openid` 作为唯一业务外键的局限，建立 `User` 1:N `AuthIdentity` 与多校多校区层级。
- **改动文件**：
  - `cloudfunctions/login/index.js`: 返回统一 `internalUserId`，写入 `auth_identities` 映射
  - `cloudfunctions/dbOperations/modules/users.js`: 支持多校区查询与档案更新
  - `campus_treehole/utils/auth.js`: 小程序全局缓存 `userId` 与 `identity`
  - `campus_treehole/pages/profile/*`: 支持学籍身份（中国学生/国际学生）与学校校区切换
- **数据迁移**：
  - 运行 `scripts/migrate-user-identities.js`：为现有 `users` 集合文档批量补齐 `internalUserId` (UUID) 并生成对应 `auth_identities` 记录。
- **向后兼容**：所有 API 同时返回 `_openid` 与 `userId`；若调用方传入 openid，内部自动映射为 `userId`。
- **测试**：新老用户登录单测，多渠道身份绑定单测，校区切换边界测试。
- **回滚方案**：保留 `users._openid` 索引与旧字段，云函数保留直接读 openid 分支。
- **完成条件**：100% 活跃用户拥有合法的 `internalUserId`，学校/校区不再硬编码。

---

## Phase 2: 统一 Conversation / Message / Notification

- **目标**：将校园便利盒简陋的 `[a,b].join('_')` 私信机制升级为支持 1v1、群聊、二手卡片、搭子成局的全能会话系统。
- **改动文件**：
  - `cloudfunctions/dbOperations/modules/messages.js`: 拆分为会话管理与消息投递
  - `campus_treehole/pages/message/message.js`: 会话列表适配多上下文类型（DIRECT / MARKET / BUDDY / EVENT）
  - `campus_treehole/pages/chat/chat.js`: 支持群成员头像展示、业务卡片头悬浮
- **数据迁移**：
  - 运行 `scripts/migrate-legacy-messages.js`：将旧 `messages` 中的散列私信抽取并升级为 `conversations` 与 `conversation_members` 实体。
- **向后兼容**：旧版 chat 页面传入 `targetOpenid` 时，自动查找或懒创建 DIRECT 会话并返回。
- **测试**：单聊未读消息计数测试，并发消息幂等测试，会话列表置顶与分页测试。
- **回滚方案**：保持旧 `messages` 集合数据不变，双写或视图适配。
- **完成条件**：私信收发延迟 < 300ms，未读消息红点统计 100% 准确，支持卡片消息。

---

## Phase 3: 迁移 Tongpin Buddy 系统 (找搭子核心频道)

- **目标**：在小程序分包 `packageBuddy/` 中完整植入 Tongpin 的搭子广场、搭子详情、发起搭子、组局申请与成局群聊。
- **改动文件**：
  - 新增小程序分包 `packageBuddy/pages/square/square` (搭子广场瀑布流)
  - 新增 `packageBuddy/pages/detail/detail` (搭子招募详情与报名)
  - 新增 `packageBuddy/pages/create/create` (发起搭子)
  - 新增 `packageBuddy/pages/review/review` (线下评价与信用结算)
  - `cloudfunctions/dbOperations/modules/buddies.js`: 移植 Fastify buddies 状态机
  - `pages/discover/discover`: 点亮“同频搭子”正式业务入口
- **数据迁移**：
  - 如果 Tongpin 独立线上库有存量种子用户或搭子类别，通过 ETL 导入统一库中的 `buddy_categories` 与 `buddy_posts`。
- **向后兼容**：未升级的小程序版本通过发现页入口静默降级或引导热更新。
- **测试**：搭子 5 态状态机流转单测（发起 -> 满员 -> 结束 -> 评价），人数并发锁定测试。
- **回滚方案**：发现页暂时下线搭子入口卡片，已创建的搭子数据保留。
- **完成条件**：可在小程序内顺畅完成“发起羽毛球搭子 -> 申请加入 -> 满员生成群聊 -> 线下打球 -> 互相评价加信誉分”。

---

## Phase 4: 迁移 UniBridge Language Exchange (友桥跨文化频道)

- **目标**：在分包 `packageBridge/` 中植入 UniBridge 核心能力：中外学生双语匹配卡片、语言搭子申请、跨文化交流。
- **改动文件**：
  - 新增小程序分包 `packageBridge/pages/home/home` (双语卡片瀑布流)
  - 新增 `packageBridge/pages/partner/partner` (伙伴资料与语言互助)
  - 新增 `packageBridge/pages/onboarding/onboarding` (双语身份选择与母语/目标语言配置)
  - `campus_treehole/locales/*`: 导入 UniBridge 的完整中英文对照表
  - `cloudfunctions/dbOperations/modules/bridge.js`: 移植语言互助匹配算法
  - `pages/discover/discover`: 点亮“友桥国际交流”入口
- **数据迁移**：初始化标准语言表（中文、英语、日语、俄语、西班牙语、韩语、法语等）。
- **向后兼容**：纯中文用户默认显示中文界面；国际学生可一键切换英文界面。
- **测试**：语言熟练度互补筛选测试（如：母语英语学中文 + 母语中文学英语），双语渲染覆盖率测试。
- **回滚方案**：关闭发现页友桥卡片，不影响原有小程序功能。
- **完成条件**：国际留学生可使用全英文流畅注册档案并与中国学生发起语言搭子邀约。

---

## Phase 5: 统一 Event (活动日程生态)

- **目标**：统一学校官方活动、Tongpin 线下搭子局活动与 UniBridge 跨文化活动（English Corner / 国际文化节）。
- **改动文件**：
  - `packageEvents/pages/activity/activity`: 升级为多源活动中心（官方/社团/跨文化）
  - `packageEvents/pages/event-detail/event-detail`: 活动报名、签到、多语言描述
  - `cloudfunctions/dbOperations/modules/events.js`: 完善报名审核、活动提醒
- **数据迁移**：将旧版单一的 `activity_zone` 升级为通用 `events` 表。
- **向后兼容**：保留旧版 banner 聚合标签功能。
- **测试**：活动名额满员锁止测试，活动开始前订阅消息通知测试。
- **完成条件**：首页“校园此刻”可聚合展示不同类型的热门活动。

---

## Phase 6: 统一 Market / Post (生活服务与内容生态)

- **目标**：将原树洞贴文和二手集市融入全局信息流，支持标签关联、多校区筛选与搜索优化。
- **改动文件**：
  - `packageMarket/pages/market/*`: 二手交易流程进一步规范化，打通即时议价会话
  - `pages/post-editor/*`: 统一发布入口（发贴子 / 发二手 / 发搭子 / 发活动）
- **数据迁移**：贴文与集市补充统一 `schoolId` 索引。
- **完成条件**：发布按钮成为全局枢纽，一站式发布四类内容。

---

## Phase 7: 后台与风控 (Admin & Safety)

- **目标**：打通 PC 管理端 (`admin.html`) 与小程序管理员后台，统一管理三方模块的举报、违规下架、实名认证与数据看板。
- **改动文件**：
  - `cloudfunctions/adminPanel/*`: 扩展搭子审核、跨文化内容审核、申诉仲裁
  - `campus_treehole/hosting/admin.html`: 增加同频与友桥管理 Tab
- **完成条件**：管理员单点登录，一站式审核贴文、集市、搭子与跨文化事件。

---

## Phase 8: 微信公众号生态与多端协同 (Ecosystem & Retention)

- **目标**：利用微信服务号/订阅号实现搭子成局强提醒、活动前夕提醒，打造校园私域留存闭环。
- **改动文件**：
  - `cloudfunctions/notifySender/*`: 联动公众号模板消息与小程序服务通知
- **完成条件**：搭子成行时未打开小程序的同学可通过微信服务号收到出游提醒。
