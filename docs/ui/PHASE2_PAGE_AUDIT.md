# Campus Box 3.0 Phase 2 页面审计

> 审计基于 `refactor/campus-platform-foundation` 当前工作树。管理后台、登录、个人中心和黑名单页面不属于本阶段用户侧迁移。

| Page | 功能 | 当前样式 | 目标样式 | 是否修改业务 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `pages/index/index` | 首页精选 / Campus Feed | 首页私有卡片与分区样式 | 单列精选、统一头部与内容卡 | 否 | 基础组件接入 |
| `pages/discover/discover` | 发现与服务入口 | 服务矩阵私有样式 | 统一页面头部、服务卡和区块标题 | 否 | 基础组件接入 |
| `pages/detail/detail` | 动态详情 | 详情页私有媒体与内容卡 | 统一内容卡、作者行和状态标签 | 否 | 待迁移 |
| `pages/market/market` | 集市列表 | 搜索、分类、商品卡私有样式 | 图片优先商品卡与稳定列表 | 否 | 待迁移 |
| `packageMarket/pages/market-detail/market-detail` | 商品详情 | 价格、描述、卖家区块私有样式 | 大图、价格突出、卖家弱化 | 否 | 待迁移 |
| `packageMarket/pages/market-post/market-post` | 发布商品 | 连续表单区块 | 图片、标题、价格、分类、成色、交易方式、描述分组 | 否 | 待迁移 |
| `pages/message/message` | 会话与互动通知 | 消息页私有列表样式 | 统一会话行、状态和空状态 | 否 | 待迁移 |
| `pages/chat/chat` | 私信 | 聊天气泡与输入栏私有样式 | 统一气泡、业务上下文头部 | 否 | 待迁移 |
| `packageBuddy/pages/buddy-square/buddy-square` | 找搭子列表 | 找搭子私有筛选与卡片 | 事情优先、时间标签、统一卡片 | 否 | 待迁移 |
| `packageBuddy/pages/buddy-detail/buddy-detail` | 搭子详情 | 状态横幅与详情卡私有样式 | 活动信息、人数状态、成员卡 | 否 | 待迁移 |
| `packageBuddy/pages/buddy-create/buddy-create` | 创建组局 | 分步表单私有样式 | 统一步骤、表单卡和 CTA | 否 | 待迁移 |
| `packageBuddy/pages/heart-home/heart-home` | Heart 首页 / Discover / Fate / Matches | Heart 专用长样式 | Campus Box 表面 + 珊瑚红辅助色 | 否 | 待迁移 |
| `packageBuddy/pages/heart-profile-edit/heart-profile-edit` | Heart 资料编辑 | Heart 表单私有样式 | 统一图片区、资料区和状态提示 | 否 | 待迁移 |
| `packageBridge/pages/bridge-home/bridge-home` | 友桥首页 | UniBridge 独立品牌样式 | 校园语言互助卡片 | 否 | 待迁移 |
| `packageBridge/pages/partner-detail/partner-detail` | 语伴详情 | 能力矩阵私有样式 | 母语、目标语言、共同兴趣优先 | 否 | 待迁移 |
| `packageBridge/pages/language-setup/language-setup` | 语言资料设置 | 连续表单卡 | 两步资料卡与统一标签 | 否 | 待迁移 |
| `packageMutual/pages/mutual-list/mutual-list` | 互助 / 失物列表 | 互助与失物双套列表样式 | Campus Service Feed，类型和状态清晰 | 否 | 待迁移 |
| `packageMutual/pages/mutual-detail/mutual-detail` | 互助 / 失物详情 | 详情页私有卡片 | 地点、时间、状态统一展示 | 否 | 待迁移 |
| `packageMutual/pages/mutual-create/mutual-create` | 发布互助 / 失物 | 表单私有样式 | 服务条目表单卡 | 否 | 待迁移 |
| `packageEvents/pages/activity/activity` | 活动列表与详情 | 活动专区私有横幅与列表 | 封面、日期、地点、类型、报名状态 | 否 | 待迁移 |

## 视觉约束

- 参考 Campus Box 视觉稿：浅蓝灰背景、白色大圆角卡片、柔和阴影、蓝色主操作。
- Heart 使用珊瑚红局部强调，不出现“恋爱成功率 / 成功率 %”。
- 空状态使用具体业务文案，不使用单一“暂无数据”。
- 组件只负责展示和事件转发；成熟业务请求、授权、配额和内容安全逻辑保持原样。
