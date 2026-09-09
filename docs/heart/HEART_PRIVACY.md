# 心动隐私与部署要求

Heart public card 使用明确字段白名单，仅public userId、昵称、校区、年级、照片、简介、兴趣、意向、共同兴趣、评分与公开搭子摘要。性别与偏好只在本人编辑接口返回，ownerDocId和OpenID不返回。服务端写入取当前登录身份，不接受客户端会员、schoolId或owner身份。照片仅接受cloud://路径，并调用现有统一内容审核。

举报复用reports，targetType=heart_profile或heart_photo，目标为public userId；原因1–200字。Block复用user_blocks。heart_block_fences 是匹配与抽卡事务的共享阻断文档：先写阻断再建立既有Block，读取不通过即拒绝。为防解除拉黑后旧Like自动复活，Heart阻断保持保守，不因普通解除拉黑自动恢复；重新授权流程尚未提供。

## 部署清单（必须先准备独立开发环境）

集合：heart_profiles、heart_likes、heart_matches、fate_card_usage、fate_card_history、heart_events、heart_block_fences。全部客户端读写权限应为false，仅服务端云函数访问。user_blocks/reports/users/messages及buddy相关集合继续复用。

索引：heart_profiles(enabled,schoolId,userId)、heart_matches(userIds数组)、fate_card_history(userId,createdAt desc)，以及既有user_blocks双方查询索引。确定性_id用于其他查找。照片存储规则须核验仅本人可写，并验证对外可读策略符合用户授权；退出只停止新推荐，无法收回对方已保存照片。

在独立开发环境创建集合与索引，记录当前云函数版本并保存可回滚代码后部署。`scripts/cloudbase-smoke/run-real-smoke.js` 会对独立环境进行真实 Storage 与数据库写入，并在 `finally` 清理本次 runId 创建的文件和文档；无凭证只能标记为 `NOT RUN`，不能宣称 PASS。部署校验只验证 `dbOperations` 可被无副作用 health action 调用；Heart 业务链路仍由同版本模块连接真实 CloudBase 数据库执行。不要对生产写测试资料。

## Release blockers

- 新集合、索引、存储规则尚未在独立开发环境核验；本轮未部署Heart。
- CloudBase真实事务冲突重试、拉黑/退出与Like/抽卡竞争，需在提供独立环境凭证后执行并记录实际结果。
- 微信CLI服务端口关闭，页面编译/预览未完成。
- A/B微信实际“自愿开启→同校发现→喜欢→匹配→聊天→拉黑”未执行。
- 同校异校区、跨校、上传照片安全拒绝、退出后的推荐刷新需真机验证。

以上通过前不能认定Beta Ready。
