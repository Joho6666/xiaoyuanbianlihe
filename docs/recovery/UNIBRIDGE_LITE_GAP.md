# UniBridge 友桥功能恢复与轻量化迁移审计 (UNIBRIDGE_LITE_GAP)

> 目标：将原项目 `Joho6666/unibridge` 作为权威 Source of Truth，审计其中外学生跨文化与语言交换功能，进行校园便利盒轻量化迁移决策。
> 原则：以“找到语言互补语伴并直接交流”为核心；轻量核心、低门槛冷启动；杜绝假数据推断；暂缓多人群聊、Connect Request 实体、Supabase RLS 重构。

---

## 1. 功能特性比对矩阵

| 原项目功能 | 当前便利盒实现 | 是否保留 | 是否迁移 | 为什么 | 对应文件 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Language Profile 语言档案**<br>(母语、正在学习语言、交流方式、简介) | 已有表单，但初次填写字段过多阻碍冷启动 | **保留** | **轻量重构** | 核心是母语和目标语言，首次进入仅需 2 个必填项，其余均可后续补充 | `campus_treehole/packageBridge/pages/language-setup/`<br>`shared/domain/language.js` |
| **语言互补匹配算法 (Language Exchange Match)**<br>(我教你 A 你教我 B) | 已实现双向互补打分与高亮原因 | **保留** | **已迁移** | 核心算法简单有效，能精准算出双方语言匹配度与推荐理由 | `shared/domain/language.js`<br>`campus_treehole/cloudfunctions/dbOperations/modules/bridge.js` |
| **语伴广场列表与筛选**<br>(按语言、学生类型、校区筛选) | 当前存在性别推测国籍/语言假数据 | **保留** | **修复重构** | **彻底删除假数据**；未填写语言资料者不展示，提供清晰空状态 | `campus_treehole/cloudfunctions/dbOperations/modules/bridge.js`<br>`campus_treehole/packageBridge/pages/bridge-home/` |
| **语伴详情页 (Partner Detail)**<br>(母语、学门、匹配分析、简介) | 已有详情卡片 | **保留** | **迁移优化** | 清晰展示对方语言背景与匹配原因，隐藏内部 OpenID | `campus_treehole/packageBridge/pages/partner-detail/` |
| **直接私信联系**<br>(一键进入一对一聊天) | 已接入小程序聊天流 | **保留** | **已迁移** | 发现心仪语伴后直接发起 1 对 1 交流，体验直观顺畅 | `campus_treehole/pages/chat/`<br>`campus_treehole/packageBridge/pages/partner-detail/` |
| **Connect Request / 语伴请求单实体** | 暂未实现 | **暂缓** | **否** | **主动舍弃**：增加不必要的阻断流程，初期直接私聊建立联系最高效 | 无（延后规划） |
| **Friendship / 复杂好友关系模型** | 暂未实现 | **暂缓** | **否** | **主动舍弃**：MVP 阶段无需建立强关系图谱，关注/私信即满足需求 | 无 |
| **多语言工作坊 / 活动报名** | 暂未作为 UniBridge 专有模块接入 | **暂缓** | **否** | **主动舍弃**：大型跨文化活动由校园便利盒通用活动模块承接，不重复造轮子 | `campus_treehole/packageEvents/` |
| **Next.js App Router 前端与组件** | 微信原生小程序分包 `packageBridge` | **否** | **否** | **技术差异**：Web DOM 无法在小程序运行，提取其信息层级用原生 WXML 重现 | `campus_treehole/packageBridge/` |
| **Supabase PostgreSQL & Edge Functions** | 使用 CloudBase 云开发与 NoSQL | **保留现状** | **否** | **架构稳定**：微信生态下 CloudBase 调用免鉴权，无外部 Supabase 运维成本 | CloudBase |
| **基于性别推测国籍与语言的 Fake Fallback** | `bridge.js` 中 `u.gender === 1 ? '中国' : '法国'` | **彻底删除** | **修复移除** | **严重违背真实性**：绝对不能造假国际学生数据，必须根据真实资料匹配 | `campus_treehole/cloudfunctions/dbOperations/modules/bridge.js` |

---

## 2. 结论与执行要点
1. **保留核心**：极简双语档案、双向互补匹配、真实语伴详情、一键 1 对 1 私聊。
2. **主动舍弃**：Connect Request 申请单、Friendship 好友网、多人群聊、国际活动单独发布、Supabase/RLS/Next.js 代码。
3. **关键修复与优化**：
   - 彻底删除 `u.gender === 1 ? 'chineseStudent' : 'internationalStudent'` 假数据逻辑；
   - 极简 Onboarding：首次进入友桥仅弹窗选两项（母语、想学的语言），3 秒即可完成并开始发现语伴。
