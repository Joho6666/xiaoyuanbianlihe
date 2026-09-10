# Express 3.7：单页结算与一单多快递

## 目标

Express Order 表示一次送到宿舍的配送订单，而不是单个快递。一次订单最多包含 10 个 `pickupItems`，每个 Item 是一个快递点和取件码组合；同一快递点可以有多个取件码。配送资料继续复用 3.6 的 `express_delivery_profiles`。

## 数据模型

`express_orders.pickupItems` 内嵌保存 `id`、`pickupPointId`、服务端生成的 `pickupPointNameSnapshot`、`pickupCode`、`packageCount`。订单级保存 `totalPackageCount`、`pickupItemCount`、`pickupPointCount`，并保留旧 `pickupPointId`、`pickupCode`、`packageCount` 兼容字段。

不新增 `express_order_items`：当前桂航 MVP 每单 Item 数量很小，订单读取与 Staff/Excel 聚合天然需要全部 Item，内嵌可以避免 join-style 查询和跨集合一致性问题。

服务端限制为：最多 10 个 Item；每个 Item 1–20 件；一单最多 30 件；同一 `pickupPointId + pickupCode`（不区分大小写）不得重复。

## 单页首次结算与回头客

- 有默认 Profile 时，订单页只展示资料摘要和底部“更换”弹层，用户只需填写快递点和取件码。
- 没有默认 Profile 时，同页填写“我自己/其他人”、姓名、手机号、南北校区、园区、楼栋和房间。
- “我自己”首次下单在同一 CloudBase transaction 内自动创建默认 Profile 和订单；任一写入失败则整体回滚。
- “其他人”默认只保存订单 Snapshot；勾选“保存为常用配送信息”后才创建 Profile。
- `express_delivery_address` 仅作为 UI fallback，不静默上传；订单创建前始终由服务端重新校验。

## API 与计价

`getExpressQuote` 与 `createExpressOrder` 接收 `pickupItems`。旧客户端仍可传 `pickupPointId`、`pickupCode`、`packageCount`，由 `normalizeExpressPickupInput` 转换为单 Item。

客户端不能提交可信的快递点名称、地址 Snapshot 或金额。服务端根据 `express_settings` 重新解析快递点、配送地址和价格。

默认 `PER_PACKAGE` 公式：

`baseOrderPriceCents + perPackagePriceCents × totalPackageCount + extraPickupPointPriceCents × max(0, pickupPointCount - 1)`。

旧设置没有新计价字段时，`perPackagePriceCents` 回退到 `basePriceCents`，额外快递点费用为 0。

## Staff 与 Excel

- 取件模式按快递点聚合所有订单 Item；勾选只存在当前页面 Session。一个订单的所有 Item 未勾齐时，不能进入 `DELIVERING`，不新增持久化 Partial Pickup 状态。
- 配送模式按校区、园区、楼栋、房间聚合 `DELIVERING` 订单，显示收件人、电话、总件数和快递点摘要。
- Dashboard 区分订单数、包裹数、取件码数、快递点数、待取件、配送中、已完成和已支付金额。
- Excel“取件清单”一行一个 Item，按快递点/取件码排序；“配送清单”一行一个 Order，包含总件数、收件人、手机号、快递点摘要，右侧附统计。

## 兼容、迁移与异常

读取旧订单时 `normalizeLegacyExpressOrder` 自动补齐 Item 和汇总字段，不删除旧字段。`migrate-express-pickup-items.js` 默认 dry-run，显式 `--apply` 才在独立环境补写缺失字段，幂等且拒绝生产环境。

空 Item、重复组合、禁用快递点、配送校区不匹配、非法件数、超过上限和失效配送资料均由服务端拒绝；前端对应区域显示 inline error。Quote 失败不创建订单，重试继续使用同一 `clientRequestId`。

## 范围边界

本阶段不包含 OCR、短信/截图识别、真实微信支付、地图、骑手、抢单、路线、优惠券、积分、通讯录或复杂 Partial Pickup 状态机。独立 CloudBase、DevTools 和真机结果必须分别记录真实 `PASS` / `FAIL` / `NOT RUN`。
