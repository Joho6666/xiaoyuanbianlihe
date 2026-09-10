# Express 3.6 Stage 1：配送资料索引清单

索引依据当前 `express.js` 查询模式整理。索引创建与数据库权限必须在独立 CloudBase 环境控制台人工核对；CLI 无法证明的创建不得记录为 READY。

| 集合 | 查询模式 | 建议索引 |
| --- | --- | --- |
| `express_delivery_profiles` | 读取当前账号的 Active 资料并按更新时间展示 | `ownerUserId ASC, status ASC, updatedAt DESC` |
| `express_delivery_profiles` | 清除旧默认、核对默认资料 | `ownerUserId ASC, status ASC, isDefault ASC` |
| `express_orders` | 订单通过 `deliveryProfileId` 追溯来源 | `deliveryProfileId ASC, createdAt DESC`（数据量增长后评估） |

## 权限核对

- `express_delivery_profiles` 禁止小程序客户端直接读写，只允许 `dbOperations` 云函数。
- Profile API 永远使用服务端解析的 `ownerUserId`；请求中的 owner 字段必须忽略。
- Staff、首页和公开接口不查询 Profile 集合，不返回 Profile 的手机号、房间或姓名。
