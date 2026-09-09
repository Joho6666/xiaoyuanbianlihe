# 缘分卡规则

额度唯一配置：dbOperations/shared/entitlements.js 的 FATE_CARD_LIMITS，free=1、premium=3。服务器Asia/Shanghai自然日；客户端时间和会员字段不可信。APP_ENV=development 且 HEART_PREMIUM_TEST_USER_IDS 中明确列出的public userId才获得测试Premium，生产默认全部free。

先筛双方开启、18+声明、目标允许缘分卡、active账号、同校、双向性别偏好、非自己、无拉黑、无Match。允许同校不同校区。校区从用户当前校区与唯一目录核验。评分同校区30、兴趣交集最多30、双向偏好25、最近资料活跃度最多15，Top20带权选择。最多扫描20个100条候选窗口，适用于本轮30–100人试点；扩容前需游标与召回性能专项验证。

30天历史优先不重复；池耗尽时允许往日重复，当天不重复。候选不再有效、空池或事务失败不扣额度。draw成功即扣一次，揭开或Pass不退次数。事务保存usage与history，确定性每日候选历史ID防并发重复。页面先展示共同兴趣和分数，点击揭开后展示照片；这只是展示交互，不是加密隐藏接口内容。

内存测试覆盖free并发1次、Premium3次及第四次拒绝、上海零点、失败回滚、空池和重复候选。真实CloudBase并发仍需独立环境验证。
