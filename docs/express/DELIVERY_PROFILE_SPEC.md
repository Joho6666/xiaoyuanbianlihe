# Express 3.6 Stage 1：常用配送信息规格

## 目标

Delivery Profile 是跟随校园便利盒账号保存的结构化配送资料。它只描述“把快递送给谁、送到哪里”，不代表好友关系，也不是通用地址簿。当前服务范围由 `campusId` 约束，南/北校区、园区、楼栋和房间由 `express_settings` 校验。

## 身份定义

- **Owner User**：当前登录并发起操作的账号，由服务端 OpenID 解析为 `internalUserId`。客户端不能指定 owner。
- **Recipient**：配送资料中的收件人，可是账号本人，也可是没有校园便利盒账号的朋友或室友。
- **付款人/订单 Owner**：始终是当前登录账号；帮别人下单不会创建另一种订单。
- `isSelf=true` 仅用于“给自己 / 帮别人”筛选；`label` 是用户自由命名的显示备注，不存关系敏感枚举。

## 数据与规则

集合名为 `express_delivery_profiles`，核心字段包括：

`ownerUserId`、`label`、`isSelf`、`recipientName`、`contactPhone`、`schoolId`、`campusId`、`deliveryCampus`、`deliveryCampusName`、`dormArea`、`dormAreaName`、`dormBuildingId`、`dormBuildingName`、`roomNumber`、`isDefault`、`status`、`createdAt`、`updatedAt`。

- 每个账号最多 10 条 `ACTIVE` 资料；归档使用 `status=ARCHIVED`，不物理删除。
- 第一条 Active 资料自动成为默认；设置其他资料为默认时，服务端事务内清除旧默认。
- 归档默认资料且仍有其他 Active 资料时，服务端自动提升最早创建的剩余资料；没有剩余资料时允许无默认。
- 创建和更新必须重新验证当前 `express_settings` 中的校区、园区和楼栋；配置停用只阻止新订单，不删除历史资料。
- 普通学生只能读取、修改、归档自己的资料；他人 Profile 不返回敏感字段，归属失败统一按 404 处理。

## 下单与 Snapshot

新版下单只提交 `deliveryProfileId`、取件信息、备注和 `clientRequestId`。服务端读取并验证归属、状态、所属 `campusId` 与地址配置，忽略客户端伪造的姓名、电话和地址字段。

订单保留 `deliveryProfileId` 作为来源追溯，同时写入不可变字段：

- `recipientNameSnapshot`
- `recipientPhoneSnapshot`
- `deliveryCampusNameSnapshot`
- `dormAreaNameSnapshot`
- `dormBuildingNameSnapshot`
- `roomNumberSnapshot`

为兼容历史客户端和旧订单，新订单仍写入 `phone`、`roomNumber`；读取时对旧订单使用 `recipientNameSnapshot || '未填写'` 与 `recipientPhoneSnapshot || phone` 回退。Profile 后续修改或归档不得影响已创建订单、Staff 页面或 Excel。

## 本地缓存迁移

`express_delivery_address` 继续作为快速 UI 缓存，但不再是数据源。登录后优先读取账号 Profile；网络暂时不可用时，缓存只能用于界面回显，创建订单仍由服务端校验。

当云端没有 Profile 而本地缓存存在时，页面只显示“检测到之前填写的配送信息”，跳转到编辑页预填内容。用户补充收件人姓名并明确点击“保存为我的宿舍”后才上传，禁止静默迁移手机号或宿舍信息。

## 隐私边界

Profile 集合禁止小程序客户端直接读写，只能经 `dbOperations` 访问。本人页面可显示完整手机号；Staff 只在已授权的订单履约响应中看到订单 Snapshot；普通其他学生、首页摘要、日志和公开响应不得返回手机号、房间、取件码或 Profile 详情。

本阶段不包含 OCR、截图识别、通讯录搜索、快递单预留手机号或真实微信支付。
