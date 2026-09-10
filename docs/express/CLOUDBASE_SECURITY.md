# Express CloudBase 安全与运维清单

## 数据边界

Express 的敏感数据只能通过 `dbOperations` 访问。`express_orders`、`staff_accounts`、`staff_audit_logs`、`express_exports` 和 `express_settings` 必须在 CloudBase 控制台设置为禁止小程序客户端直接读写。客户端永远不能传入 OpenID、权限或操作者身份来替代服务端身份。

当前首期服务校区是学校 `guat` 的校区 `guit-hangtian`。未配置 `express_settings/guit-hangtian` 或 `acceptingOrders` 不是 `true` 时，学生端保持“暂未开放”。

## 权限矩阵

| 身份 | 订单读取 | 履约更新 | Excel 导出 | 工作人员管理 | 服务设置 |
| --- | --- | --- | --- | --- | --- |
| 普通用户 | 仅本人 | 无 | 无 | 无 | 无 |
| active Express Staff | 所属校区 | `WAIT_PICKUP → DELIVERING → COMPLETED` | 所属校区 | 无 | 无 |
| active 全局 Admin / Owner | 所属校区（按请求范围） | 全部 | 全部 | 全部 | 全部 |
| disabled / banned | 无 | 无 | 无 | 无 | 无 |

全局管理员身份由服务端现有 `users.role=admin && status=active` 判断；工作人员身份由 `staff_accounts` 判断。停用仅保留审计记录，不物理删除。

## 测试支付与生产隔离

测试支付只有在独立环境同时设置 `EXPRESS_TEST_PAYMENT_ALLOWED=true`、`EXPRESS_TEST_PAYMENT_ENV_ID` 和匹配的 `TCB_ENV_ID` 时可用。仓库没有真实商户号、证书或微信支付回调；生产环境不会将未支付订单伪造为已支付，也不调用 `wx.requestPayment`。

## Excel 文件

导出路径为 `exports/express/<date>/<runId>.xlsx`，仅写入私有 Storage，响应只返回 `fileId`。`express_exports` 保存 7 天过期时间；每次导出会清理到期文件，运维人员至少每周按本清单核对并清理无后续导出的过期文件。

## Provisioning 与人工核对

```powershell
node scripts/provision-express.js --env <独立环境ID>
node scripts/provision-express.js --env <独立环境ID> --apply
```

脚本默认 dry-run，只创建缺失集合，不删除任何数据。索引与客户端权限由控制台人工完成后，才可将 CloudBase 安全状态记录为 `PASS`；CLI 无法证明的操作不得写成成功。
