# Campus Box 3.0 Phase 2 页面审计

## 2026-09-10 参考图还原进度（尚未完成整体验收）

- 首页：恢复关注入口、浅色校园图片宣传卡、8 个本地图标、限制长图；点赞收藏同步源数据与分栏，失败回滚和重复点击已通过行为回归。
- 发现：入口使用相同本地图标，移除额外英文宣传标题。
- 我的：移除大封面最小高度与负边距，封面编辑改为明确入口。
- 发布：修正闲置发布错误路由，中心按钮取消向上凸起。
- Heart/Fate：可见卡片补回举报、拉黑、公开搭子和资料；Fate 使用 matchScore 与 sharedInterests。
- 已删除多个页面中固定为 false 的旧模板。其他 CSS 隐藏模板、共享导航模式、业务页完整布局、统一线性导航图标和图片失败占位仍需继续收口，不能将所有页面标记完成。
- 本地 CI 与内存 Smoke：PASS。微信 CLI 实际返回 IDE service port disabled，编译与截图：NOT RUN。图标设备兼容性、胶囊避让和键盘安全区尚无截图验收。
- GitHub Actions 以最终提交的实际运行状态为准；后端和生产环境未变更。

> 审计基于 `refactor/campus-platform-foundation` 当前工作树。管理后台、登录、个人中心和黑名单页面不属于本阶段用户侧迁移。

| Page | 功能 | 当前样式 | 目标样式 | 是否修改业务 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `pages/index/index` | 首页 / Campus Feed | 混合旧导航与单列卡 | 浅蓝服务首页、服务宫格、真实双列帖子瀑布流 | 否 | 已实现；DevTools 截图验收待执行 |
| `pages/discover/discover` | 发现与服务入口 | 假动态与隐藏旧频道矩阵 | 两列真实服务入口，随学校功能开关变化 | 否 | 已实现；DevTools 截图验收待执行 |
| `pages/detail/detail` | 动态详情 | 详情页私有媒体与内容卡 | 统一内容卡、作者行和状态标签 | 否 | 已接入统一头部；详情媒体卡待截图核对 |
| `pages/market/market` | 集市列表 | 搜索、分类、商品卡私有样式 | 图片优先商品卡与稳定列表 | 否 | 已迁移：product-card、filter-tabs |
| `packageMarket/pages/market-detail/market-detail` | 商品详情 | 价格、描述、卖家区块私有样式 | 大图、价格突出、卖家弱化 | 否 | 已迁移：price-text、user-row |
| `packageMarket/pages/market-post/market-post` | 发布商品 | 连续表单区块 | 图片、标题、价格、分类、成色、交易方式、描述分组 | 否 | 已接入统一头部；表单样式待截图核对 |
| `pages/message/message` | 会话与互动通知 | 消息页私有列表样式 | 统一会话行、状态和空状态 | 否 | 已迁移：user-row |
| `pages/chat/chat` | 私信 | 聊天气泡与输入栏私有样式 | 统一气泡、业务上下文头部 | 否 | 已迁移：校园联系上下文；静态验证通过 |
| `packageBuddy/pages/buddy-square/buddy-square` | 找搭子列表 | 找搭子私有筛选与卡片 | 事情优先、时间标签、统一卡片 | 否 | 已迁移：buddy-card、empty-state |
| `packageBuddy/pages/buddy-detail/buddy-detail` | 搭子详情 | 状态横幅与详情卡私有样式 | 活动信息、人数状态、成员卡 | 否 | 已接入统一头部；详情样式待截图核对 |
| `packageBuddy/pages/buddy-create/buddy-create` | 创建组局 | 分步表单私有样式 | 统一步骤、表单卡和 CTA | 否 | 已接入统一头部；表单样式待截图核对 |
| `packageBuddy/pages/heart-home/heart-home` | Heart 首页 / Discover / Fate / Matches | Heart 专用长样式 | Campus Box 表面 + 珊瑚红辅助色 | 否 | 已迁移：heart-card、match-card、fate-card |
| `packageBuddy/pages/heart-profile-edit/heart-profile-edit` | Heart 资料编辑 | Heart 表单私有样式 | 统一图片区、资料区和状态提示 | 否 | 已接入统一头部；表单样式待截图核对 |
| `packageBridge/pages/bridge-home/bridge-home` | 友桥首页 | UniBridge 独立品牌样式 | 校园语言互助卡片 | 否 | 已迁移：user-row、empty-state |
| `packageBridge/pages/partner-detail/partner-detail` | 语伴详情 | 能力矩阵私有样式 | 母语、目标语言、共同兴趣优先 | 否 | 已接入统一头部；详情样式待截图核对 |
| `packageBridge/pages/language-setup/language-setup` | 语言资料设置 | 连续表单卡 | 两步资料卡与统一标签 | 否 | 已接入统一头部；表单样式待截图核对 |
| `packageMutual/pages/mutual-list/mutual-list` | 互助 / 失物列表 | 互助与失物双套列表样式 | Campus Service Feed，类型和状态清晰 | 否 | 已迁移：content-card、empty-state |
| `packageMutual/pages/mutual-detail/mutual-detail` | 互助 / 失物详情 | 详情页私有卡片 | 地点、时间、状态统一展示 | 否 | 已接入统一头部；详情样式待截图核对 |
| `packageMutual/pages/mutual-create/mutual-create` | 发布互助 / 失物 | 表单私有样式 | 服务条目表单卡 | 否 | 已接入统一头部；表单样式待截图核对 |
| `packageEvents/pages/activity/activity` | 活动列表与详情 | 活动专区私有横幅与列表 | 封面、日期、地点、类型、报名状态 | 否 | 已迁移：content-card 单列活动流 |

## 视觉约束

- 参考 Campus Box 视觉稿：浅蓝灰背景、白色大圆角卡片、柔和阴影、蓝色主操作。
- Heart 使用珊瑚红局部强调，不出现“恋爱成功率 / 成功率 %”。
- 空状态使用具体业务文案，不使用单一“暂无数据”。
- 组件只负责展示和事件转发；成熟业务请求、授权、配额和内容安全逻辑保持原样。
- 首页帖子保留现有排序、分页、刷新、点赞、收藏、图片高度计算与视频渲染；左右列只是同一 `posts` 数据的展示分栏。
- 本文档的“已实现”不等于视觉验收通过：微信开发者工具服务端口尚未在本次代码修改后验证时，应保持 `NOT RUN`。

## 本轮验证边界

- `PASS`：`npm run ci` 与 `npm run test:integration:memory` 已在本轮 UI 修改后通过。
- `NOT RUN`：微信开发者工具 CLI 存在，但调用 `build-npm --project ... --port 9420` 返回“IDE service port disabled”。因此没有将代码静态检查误记为页面编译、截图或视觉验收通过。
- `NOT TOUCHED`：CloudBase 生产环境、数据库结构与云函数均未修改。
