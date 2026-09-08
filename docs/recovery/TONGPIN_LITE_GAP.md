# Tongpin 同频功能恢复与轻量化迁移审计 (TONGPIN_LITE_GAP)

> 目标：将原项目 `Joho6666/tongpin` 作为权威 Source of Truth，审计其功能并进行校园便利盒轻量化迁移决策。
> 原则：以“此刻有什么人，想和我一起做什么”为核心；轻量核心、低门槛冷启动、YAGNI；严禁 Tinder 化（重事情轻照片）；暂缓校园教务认证、多人群聊、复杂成局实体与信誉积分体系。

---

## 1. 功能特性比对矩阵

| 原项目功能 | 当前便利盒实现 | 是否保留 | 是否迁移 | 为什么 | 对应文件 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **9 大搭子分类 (BUDDY_CATEGORIES)**<br>(吃饭/运动/学习/游戏/旅行/出游/电影/拍照/自定义等) | 已实现基础枚举，但分类与原版存在命名差异 | **保留** | **迁移** | 分类明确降低发布与查找认知负担，涵盖大学核心高频生活场景 | `campus_treehole/packageBuddy/pages/buddy-create/`<br>`shared/domain/buddy.js` |
| **三步极速发布 (30秒完成)**<br>1.想做什么 2.何时何地 3.差几个人 | 原便利盒为长表单，输入项分散较慢 | **保留** | **迁移** | 核心体验是让学生 30 秒内完成发布，减少无谓阻力，提升供给频次 | `campus_treehole/packageBuddy/pages/buddy-create/` |
| **5 态搭子生命周期**<br>(OPEN, FULL, FINISHED, CANCELLED, EXPIRED) | 已实现 5 态流转 | **保留** | **已迁移** | 状态机清晰极简，天然覆盖搭子生命全周期，无需增加更复杂状态 | `shared/domain/buddy.js`<br>`campus_treehole/cloudfunctions/dbOperations/modules/buddies.js` |
| **搭子申请与审批看板**<br>(申请加入/撤销/发起人接受/拒绝) | 已有审批逻辑，但缺少并发防护 | **保留** | **迁移优化** | 核心双向确认机制。通过服务端事务避免同时接受导致超员 | `campus_treehole/cloudfunctions/dbOperations/modules/buddies.js` |
| **轻量可解释推荐排序**<br>(时间临近 + 同校区 + 兴趣重合 + 最近活跃) | 原版只按单一 `startAt` 排序，无加权评分 | **保留** | **迁移** | 提升匹配效率，综合考虑时间紧迫感与同校区就近原则，无需复杂 AI | `campus_treehole/cloudfunctions/dbOperations/modules/buddies.js` |
| **原 UI 紧迫感与信息层级**<br>(“现在有人约”、“附近正在发生”、“还差X人”、“马上开始”) | 之前卡片偏向传统列表，缺乏原版视觉节奏 | **保留** | **迁移优化** | 突出“事情与时效”而非“头像与颜值”，符合非 Tinder 化原则 | `campus_treehole/packageBuddy/pages/buddy-square/` |
| **成局后快速联系发起人**<br>(直接私聊) | 当前通过私信页面跳转 | **保留** | **迁移优化** | 通过现有 1 对 1 聊天直接沟通集合细节，极简可用 | `campus_treehole/packageBuddy/pages/buddy-detail/`<br>`campus_treehole/pages/chat/` |
| **BuddyReview / 评价与出勤确认** | 暂未实现 | **暂缓** | **否** | **主动舍弃**：当前处于冷启动，评价体系链条过长，增加用户负担，YAGNI | 无（延后规划） |
| **UserTrust 信用积分体系** | 暂未实现 | **暂缓** | **否** | **主动舍弃**：依赖大量历史数据与人工审核，MVP 依靠举报与黑名单足够防刷 | 无（延后规划） |
| **BuddyMatch / BuddyMatchMember 复杂实体** | 暂未实现 | **暂缓** | **否** | **主动舍弃**：单表+事务完全可支撑，避免为了架构过早设计多层中介实体 | 无 |
| **多人搭子群聊 (Group Chat)** | 暂未实现 | **暂缓** | **否** | **主动舍弃**：微信群或现有一对一私信已满足初期成局沟通，群聊维护成本高 | 无 |
| **学生身份认证 / 学号核验** | 暂未实现 | **暂缓** | **否** | **主动舍弃**：零接入成本首要，扫码直接用，不与各高校教务系统对接 | 无 |
| **Tinder 式左滑右滑交友** | 明确禁止 | **否** | **否** | **严格禁止**：同频核心是“事情 → 人”，杜绝颜值优先与恋爱配对首页 | 架构红线约束 |
| **PostgreSQL + Prisma ORM 架构** | 当前使用 CloudBase 文档数据库 | **保留现状** | **否** | **主动保留**：小程序云开发开箱即用、无运维负担，不因原项目技术栈而迁库 | CloudBase NoSQL |

---

## 2. 结论与执行要点
1. **保留核心**：分类、30秒发布、5态流转、申请审批事务、轻量推荐排序、一对一联系。
2. **主动舍弃**：BuddyReview 评价、UserTrust 信用、复杂 Match 实体、多人群聊、教务学号认证、PostgreSQL 迁移。
3. **关键体验恢复**：
   - 恢复微信小程序端 30 秒三步极速发布；
   - 优化推荐排序（`timeScore*0.35 + campusScore*0.25 + interestScore*0.25 + activityScore*0.15`）；
   - 卡片突出“还差 X 人”、“今晚/明天”、“马上开始”。
