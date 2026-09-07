# 三仓库全量深度审计报告 (CURRENT_AUDIT)

> 日期：2026-09-07  
> 责任人：首席架构师 & 代码重构负责人  
> 审计对象：
> 1. 校园便利盒 (`xiaoyuanbianlihe` / `xyblh426`)
> 2. Tongpin 同频 (`tongpin`)
> 3. UniBridge 友桥 (`unibridge`)

---

## 1. 真实状态与技术栈矩阵

| 维度 | 校园便利盒 (xiaoyuanbianlihe) | Tongpin / 同频 (tongpin) | UniBridge / 友桥 (unibridge) |
| :--- | :--- | :--- | :--- |
| **产品定位** | 校园生活综合服务（树洞/集市/活动/公告/推广） | 校园兴趣搭子、找搭子交友、成局评价 | 中外学生跨文化社交与语言交换 |
| **前端技术** | 原生微信小程序 (WXML/WXSS/JS, custom-tab-bar) | React 19 + TypeScript + Vite + Tailwind CSS | Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui |
| **后端技术** | 微信云开发云函数 (Node.js, wx-server-sdk) | Fastify 5 + TypeScript + Zod | Next.js Server Actions + Supabase Edge / Client |
| **数据引擎** | CloudBase NoSQL (Document / MongoDB API) | PostgreSQL 15 (Prisma ORM) | PostgreSQL 15+ (Supabase, RLS, Realtime) |
| **用户主键** | 微信 `_openid` 直接作为业务关联主键 | `User.id` (UUID / cuid)，`AuthIdentity` 解耦 | `profiles.id` (Supabase Auth `auth.users.id` UUID) |
| **国际化** | 纯中文硬编码，无 i18n 机制 | 纯中文硬编码，无 i18n 机制 | 完整 `next-intl` (zh-CN, en-US)，全站双语字典 |
| **测试与 CI** | 0 单元测试，0 CI 工作流 | Vitest 单元测试 (auth, buddy 状态机) | Vitest 测试 (matching, i18n, safety)，GitHub Actions |
| **代码组织度** | 存在 3467 行 `dbOperations/index.js` 超级大单文件；全部 24 页面塞在主包 | Fastify 模块化路由清晰 (`modules/*`)，Prisma Schema 严谨 | Next.js App Router 结构整洁，RLS 规范完善 |

---

## 2. 三方重复能力与异同分析

### 2.1 用户系统 (User & Identity)
- **校园便利盒**：`users` 集合存储用户基本资料（nickname, avatar, gender, campusId, role, status, banExpiry 等）。致命缺陷是业务逻辑高度绑定微信 `_openid`，将第三方平台的身份凭证直接当作主键与外键使用。
- **Tongpin**：设计了清晰的 `User` 1:N `AuthIdentity` 模型。`User.id` 为稳定内部主键，`AuthIdentity` 支持 `provider`（wechat_mini, phone, email）和 `providerKey`，天然具备多渠道登录扩展能力。
- **UniBridge**：采用 `profiles` 表，扩展了中外学生双轨属性（`identity: chinese_student | international_student`、`country`、`exchange_mode`、`available_time`、`social_prefs`）。

### 2.2 消息与会话系统 (Conversation & Message)
- **校园便利盒**：在 `messages` 集合中直接存私信列表，通过 `[openid, targetOpenid].sort().join('_')` 手工生成会话 ID，且把卡片分享（post, goods）作为附带字段塞入。没有独立的 Conversation 实体，无法支持多人搭子群聊或活动群聊。
- **Tongpin**：标准的 `Conversation` + `ConversationMember` + `Message` 模型，支持一对一和多人群聊，支持 `relatedId` 关联搭子局，支持成员读取标记 `lastReadAt`。
- **UniBridge**：同样的 `conversations` + `conversation_members` + `messages` 模型，并通过 Supabase Realtime 实现实时收发与未读统计。

### 2.3 活动与事件系统 (Event)
- **校园便利盒**：`activity_zone` 集合（单一 config 文档），仅用于后台配置单条官方运营活动或专属贴文聚合标签，并非可参与的日程事件模型。
- **Tongpin**：`BuddyEvent` + `EventParticipant` + `BuddyReview`，涵盖搭子成局后的线下确认、出勤核对、标签化互相评价、信誉分结算闭环。
- **UniBridge**：`events` + `event_members`，涵盖校园活动/跨文化工作坊发布、报名、名额限制、审核流。

### 2.4 社交关系与安全防护 (Safety: Block & Report)
- **校园便利盒**：`user_blocks`（拉黑）+ `reports`（举报）+ `contentCheck`（微信内容安全接口：文本/图片/视频过滤）+ 用户封禁/禁言状态机。已有微信生态安全兜底，但拉黑拦截逻辑分散在各个 SQL/NoSQL 查询片段中。
- **Tongpin**：`Block` + `Report`，双向拉黑查询过滤，完备的 `UserTrust` 信任积分与信誉防刷体系。
- **UniBridge**：基于 Postgres RLS 强制在数据层执行双向拉黑过滤，前台无感屏蔽。

### 2.5 学校与校区系统 (School & Campus)
- **校园便利盒**：硬编码单一校区标识 `guit-hangtian`（桂林航天工业学院），通过 `resolveCampusIdForRead` 和 `campusWhereClause` 进行简单查询合并。
- **Tongpin**：`School` 模型（`id`, `name`, `city`, `campuses: String[]`），已具备多校多校区数据抽象。
- **UniBridge**：`schools` 表，支持外键级联与校区字段。

---

## 3. 资产复用价值分类

### 3.1 极高复用价值（保留并作为核心基石）
1. **校园便利盒微信生态基建**：
   - `campus_treehole/cloudfunctions/contentCheck`：微信官方敏感文本与图片审核能力。
   - `campus_treehole/cloudfunctions/notifySender`：微信订阅消息模板精准触达机制。
   - `custom-tab-bar`：轻量、无外部大图依赖的高性能 CSS 图标导航栏。
   - 二手集市业务闭环（发布、我想要的、留言问价、下架）。
   - 现有的移动端样式与交互适配细节（上拉加载、瀑布流、骨架屏）。
2. **Tongpin 业务领域与状态机**：
   - `BuddyPost` 的 5 态生命周期：`OPEN` -> `FULL` -> `FINISHED` -> `CANCELLED` -> `EXPIRED`。
   - `BuddyApplication` 申请/同意流程与席位自动计算。
   - `BuddyReview` + `UserTrust` 的校园信用评估闭环。
   - `AuthIdentity` 的抽象设计。
3. **UniBridge 国际化与多元用户档案**：
   - 完整的中英文翻译字典（`zh-CN.json` 与 `en-US.json` 共上百个标准化 UI 词条）。
   - `UserLanguage`（native, fluent, intermediate, learning）模型与匹配语义。
   - 国际学生与中国学生的一体化资料设计。

### 3.2 严禁直接迁移的代码（不应入主小程序）
1. **Next.js App Router 服务端组件与 DOM 代码**：UniBridge 的 React Web 组件包含 `window`, `document`, HTML tags，不可直接放入小程序。
2. **Prisma 运行时客户端**：微信小程序客户端与云函数环境不可直接打包完整 Prisma 客户端；应统一数据访问层（微服务化或 CloudBase SDK / pg 驱动）。
3. **已弃用的历史脚本与本地路径**：如校园便利盒 scripts 中出现的固定 Windows 桌面绝对路径。

---

## 4. 核心技术债与系统瓶颈

1. **`dbOperations/index.js` 单文件爆炸**：
   - 代码行数已达 **3,467 行**，包含 50 余个 action，涵盖帖子、评论、点赞、关注、集市、私信、通知、活动、公告、封禁等所有逻辑。
   - 代码缺乏抽象，多个模块共享局部全局变量，极易引发回归故障。
2. **小程序主包体积与单包膨胀**：
   - 目前 24 个页面全部声明在 `app.json` 的 `pages` 主包数组中。随着 Tongpin（搭子广场、搭子详情、发起搭子、搭子群聊、评价页）和 UniBridge（语言交流、国际伙伴卡片、活动详情）并入，小程序主包必然突破微信 2MB 限制。
3. **OpenID 强绑定陷阱**：
   - 当前所有数据集合均以 `_openid` 作为用户外键。一旦未来引入手机号验证码、邮箱或多端认证，将无法进行身份汇聚。
4. **测试与工程化缺失**：
   - 校园便利盒没有任何自动测试或 CI 流水线，改动代码全靠手工点击校验，重构风险极高。
5. **配置硬编码**：
   - 部分脚本和配置文件中存在硬编码的云开发环境 ID、管理员秘钥占位符与本机目录。

---

## 5. 数据模型与业务语义冲突清单

| 实体领域 | 校园便利盒现状 | Tongpin 现状 | UniBridge 现状 | 统一裁定标准 |
| :--- | :--- | :--- | :--- | :--- |
| **用户 ID** | `_openid` (String) | `User.id` (cuid/uuid) | `profiles.id` (uuid) | **采用统一 `InternalUserId` (UUID)**；OpenID 降级为 `AuthIdentity` 渠道键值 |
| **学校校区** | 纯字符 `campusId: 'guit-hangtian'` | `schoolId` + `campus` (字符) | `school_id` (uuid) + `campus` | **统一 `School` (id, code, name) + `Campus` (id, schoolId, name)** |
| **聊天与消息** | `messages` 扁平存储，复合 key 模拟会话 | `Conversation` (type, relatedId) + `Message` | `conversations` + `messages` | **统一采用三层结构**：`Conversation` -> `ConversationMember` -> `Message` |
| **活动模型** | `activity_zone` (运营配置) | `BuddyEvent` (搭子线下局) | `events` (校园跨文化活动) | **解耦区分**：`Event` 为通用活动日程实体；搭子成局映射到特定类型的 Event |
| **动态与树洞** | `posts` 集合 (匿名/实名, 圈子) | 无独立动态（以搭子贴为主） | `posts` (动态发帖) | **保留校园便利盒成熟的 `posts`** 作为校园圈底座，搭子贴采用独立专用域 `buddy_posts` |

---

## 6. 审计结论与 Phase 0 策略

三个项目各有千秋：
- 校园便利盒**拥有最真实的微信小程序运行环境与高粘性的生活工具（树洞、二手集市、微信安全审核）**；
- Tongpin**拥有最严密的领域模型（搭子成局状态机、信誉评估、身份解耦）**；
- UniBridge**拥有最成熟的跨文化双语能力与开放的活动模型**。

**结论**：合并绝不是“三合一粘贴复制代码”，必须以**校园便利盒为基座宿主**，先执行 **Phase 0 底座重构**：
1. 建立 `docs/merge/` 四大架构规范；
2. 拆分 3467 行 `dbOperations` 巨石；
3. 将“集市”移出一级 Tab，开辟“发现”频道；
4. 启动小程序分包架构（`packageMarket`, `packageEvents` 等）；
5. 引入 `InternalUserId` 与 `AuthIdentity` 抽象适配层；
6. 确立 `Conversation` 通用会话模型；
7. 落地 i18n 基础工具库；
8. 补齐 Node.js 测试框架与 GitHub Actions CI。
