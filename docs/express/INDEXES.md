# Express 索引清单

索引来自当前服务端查询，创建与权限仍需在 CloudBase 控制台人工核对。

| 集合 | 查询模式 | 建议索引 |
| --- | --- | --- |
| `express_orders` | 学生订单，按用户倒序 | `userId ASC, createdAt DESC` |
| `express_orders` | Staff 按社区校区和时间读取 | `campusId ASC, createdAt DESC` |
| `express_orders` | Staff 按履约状态和时间读取 | `deliveryCampus ASC, orderStatus ASC, createdAt DESC` |
| `express_orders` | 支付与履约过滤 | `paymentStatus ASC, orderStatus ASC` |
| `express_settings` | 校区设置文档 | `campusId ASC` |
| `staff_accounts` | 操作者与状态 | `userId ASC, status ASC` |
| `staff_audit_logs` | 操作者/时间与资源 | `actorUserId ASC, createdAt DESC`；`resourceType ASC, resourceId ASC, createdAt DESC` |
| `express_exports` | 过期清理与操作者历史 | `expiresAt ASC`；`actorUserId ASC, createdAt DESC` |

CLI 无法证明索引创建成功时只能输出本清单，不记录为 READY。敏感集合全部设置为仅云函数访问。
