# Express 3.5 生产化缺口审计

审计基线：`70c7c18`，分支 `refactor/campus-platform-foundation`。本表先于代码修改建立，运行态项目仍需独立 CloudBase 与真机验证。

| Current | Target | Severity | Implementation | Test | Runtime Verification |
| --- | --- | --- | --- | --- | --- |
| 新单为 `UNPAID + WAIT_PICKUP` | 新单为 `UNPAID + WAIT_PAYMENT`，支付后进入 `WAIT_PICKUP` | P0 | 待实施 | 待新增 | NOT RUN |
| `campusId` 同时表示社区和配送校区 | 保留 `campusId`，新增 `deliveryCampus` 及名称快照 | P0 | 待实施 | 待新增 | NOT RUN |
| 宿舍楼自由输入 | 配送校区、园区、楼栋来自 Owner 配置 | P0 | 待实施 | 待新增 | NOT RUN |
| 价格由创建动作直接计算，缺少 quote 动作 | 服务端 `getExpressQuote`，创建时重新计算 | P0 | 待实施 | 待新增 | NOT RUN |
| 网络重试可能产生重复订单 | `userId + clientRequestId` 幂等 | P0 | 待实施 | 待新增 | NOT RUN |
| Staff 查询已过滤未支付订单，但状态语义不完整 | 履约列表仅展示已支付且可履约订单 | P0 | 部分已有 | 待新增 | NOT RUN |
| 快递点只有名称快照，宿舍无快照 | 快递点、配送校区、园区、楼栋保存名称快照 | P0 | 待实施 | 待新增 | NOT RUN |
| Owner 设置没有配送园区/楼栋配置 | `deliveryCampuses`、`pickupPoints` 可配置和停用 | P0 | 待实施 | 待新增 | NOT RUN |
| Excel 配送 Sheet 暴露内部 `campusId` | 显示配送校区人类名称并冻结、筛选、打印友好 | P1 | 部分已有 | 待新增 | NOT RUN |
| 测试支付适配器存在，真实微信支付未接入 | 统一 Adapter 契约，明确 Real Payment 边界 | P1 | 待实施 | 待新增 | NOT RUN |
| Staff 工作台能看订单，但取件码/地址密度不足 | 取件码优先、取件模式临时勾选 | P1 | 待实施 | 待新增 | NOT RUN |
| CloudBase 安全规则、Storage 私有访问未实测 | 独立环境核验，生产拒绝 | P0 | 文档已有边界 | 待新增 | NOT RUN |
| 旧订单可能使用 `UNPAID + WAIT_PICKUP` | 幂等 migration 转为 `WAIT_PAYMENT` | P0 | 待实施 | 待新增 | NOT RUN |
| DevTools 服务端口之前关闭 | 开启后编译并截图核心 Express 页面 | P1 | CLI 可用 | N/A | NOT RUN |

## 本轮代码收口结果

- `PASS`：订单状态拆分、历史兼容规范化函数、服务端报价、金额重算、`clientRequestId` 幂等、结构化配送校验、地址名称快照、未支付 Staff 过滤、Owner 设置字段、Excel 打印友好设置。
- `NOT RUN`：独立 CloudBase 集合权限、Storage 私有访问、真实支付回调、DevTools 编译截图和真机键盘/安全区验证。

## 运行边界

- 首期服务校区仍为 `guat` / Campus Box `guit-hangtian`，实际配送通过 `deliveryCampus` 表达 `south` / `north`。
- 没有独立 CloudBase 凭证时，CloudBase、Storage 和真实支付均保持 `NOT RUN`，不得以内存测试替代。
- 本轮不触碰生产环境，不增加骑手、地图、会员、优惠券、Jobs 或 Ride。
