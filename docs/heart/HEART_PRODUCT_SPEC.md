# 同频 · 心动 MVP

2026-09-09。本轮基线 0303c8c，开发分支 refactor/campus-platform-foundation。

同频保留找搭子，新增主动开启的心动模式。首页不展示未授权的心动个人资料。发现页入口文案为“找搭子 · 遇见心动的人”。页面在 packageBuddy 内，heart-home 集中承载发现、今日缘分、匹配列表及匹配提示，heart-profile-edit 承载编辑、18+ 声明和独立的缘分授权。

资料默认不启用。必须主动确认18周岁、开启，并通过文本及1–3张云存储照片审核。不采集生日、身份证、电话或微信号。普通发现按候选窗口分页（15条候选窗口），不设每日浏览上限。暂未启用每日Like上限。

双方喜欢才建立确定性 Match。匹配跳转复用现有私信，服务端检查匹配；既有会话及已接受的搭子申请保留联系权限。双方均建立过心动资料时的新陌生私信受匹配门槛保护。其他既有业务的精细聊天权限兼容仍需真机核验。

发现支持共同兴趣、年级、校区、最近想做什么、公开搭子链接。根据共同摄影/运动兴趣可跳转搭子分类。没有候选显示真实空态，不生成假用户。

## 原项目与审计

已读取 PR #1/#2 审计说明，未合并。已读取 Tongpin api/src/lib/match.ts，复用可解释兴趣交集理念；不迁移其 Prisma 或年龄字段。一次 GitHub API 请求连接超时，重试成功。旧 recovery 文档中的不做恋爱模式限制由本轮明确需求替代，搭子系统继续保留。

## 运行与验收

npm run ci
npm run test:integration:memory

自动测试验证内存事务和模块行为，不能证明 CloudBase SDK 的实际事务隔离或微信页面运行正确。真实云端和双账号真机未运行。本次微信 CLI 返回 IDE service port disabled，未完成编译。先在开发者工具安全设置开启服务端口，再运行 preview。

## 轻量指标

heart_events 保存 name、public userId、createdAt，无性别推断。已有事件：heart_mode_opened、heart_profile_completed、heart_card_viewed、heart_like、heart_pass、heart_match、fate_card_drawn、fate_card_empty、fate_card_limit_reached、heart_chat_started。日志失败不让已提交业务重试。

开启率 = 去重开启用户 / 同期活跃用户；资料完成率 = 完成用户 / 开启用户；Like率 = 喜欢事件 / 卡片展示；匹配率 = 去重Match / 去重Like；抽卡率 = 抽卡用户 / 心动活跃用户；聊天转化 = 开始聊天的匹配 / 匹配；7日留存需跨7日真实事件。重复Like可能生成重复事件，分析必须按用户与业务记录去重。当前无真实指标值。男女结构只统计本人填写且授权的数据。
