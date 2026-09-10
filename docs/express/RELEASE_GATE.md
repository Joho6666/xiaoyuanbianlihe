# Campus Box 3.0 Express 3.6 Stage 1 Release Gate

| Gate | Status | Evidence |
| --- | --- | --- |
| Branch / HEAD | PASS | `refactor/campus-platform-foundation`，Stage 1 implementation through `abd2e45` |
| Local CI | PASS | `npm ci` 后 `npm run ci` 通过 |
| GitHub CI | PASS | [Actions run 34465745056](https://github.com/Joho6666/xiaoyuanbianlihe/actions/runs/34465745056)，对应 `abd2e45` 的 Node 18.x / 20.x 均 success |
| Staff Auth | PASS | `staff-permissions.test.js` |
| Normal User Hidden | PASS | UI 回归 + 服务端能力回归；真机仍未验证 |
| Server-side Permission | PASS | 伪造权限、停用、跨校和状态机回归 |
| Order State | PASS | `express-order-state.test.js`：WAIT_PAYMENT → PAID/WAIT_PICKUP，履约状态机和幂等 |
| Structured Delivery Campus | PASS | `express-address.test.js`：南/北校区、园区、楼栋校验与快照 |
| Dorm Config / Pickup Point Config | PASS | Owner 设置动作支持 deliveryCampuses、停用楼栋与快递点 |
| Pricing | PASS | `express-pricing.test.js`：quote 与服务端重算 |
| Order Idempotency | PASS | 同一 userId + clientRequestId 返回原订单 |
| Express Staff / Owner | PASS | `express-staff-permissions.test.js` 与既有权限回归 |
| Excel private storage | PASS | 两个 Sheet、名称快照、冻结首行、筛选、私有路径内存回归；真实 Storage 未核对 |
| Audit log / OpenID exposure | PASS | 审计脱敏与响应字段回归；真实 CloudBase 规则未核对 |
| CloudBase Security | NOT RUN | 未完成独立环境规则和敏感集合访问核验 |
| Storage | NOT RUN | 未完成持有 fileID 的真实访问威胁模型验证 |
| DevTools | NOT RUN | 服务端口未开启时不得宣称编译成功 |
| Payment Mock | PASS | 独立环境测试支付开关与 WAIT_PAYMENT 边界 |
| Delivery Profiles | PASS | 账号归属、10 条上限、默认切换、归档提升默认与结构化地址校验 |
| Order For Self / Others | PASS | `isSelf` 筛选；订单 Owner/付款人为当前账号，收件人可为未注册用户 |
| Order Snapshot | PASS | 姓名、电话、房间与地址名称写入不可变 Snapshot |
| Legacy Orders / Cache | PASS | 旧订单字段回退；本地缓存仅在用户确认后迁移 |
| Staff / Excel Recipient | PASS | Staff 读取收件人 Snapshot；配送清单增加收件人列 |
| CloudBase Stage 1 Smoke | NOT RUN | 缺少独立环境临时凭证；普通 Smoke 为 `NOT RUN`，required 退出码为 1 |
| DevTools | NOT RUN | 微信开发者工具服务端口当前关闭 |
| Real Device | NOT RUN | 尚未完成三类账号和双账号验证 |
| Express 3.6 Stage 2 OCR | OUT OF SCOPE | 本阶段明确不开发 OCR/截图识别 |
| Wechat Pay Real | NOT IMPLEMENTED | 本轮没有商户号、证书和回调配置 |
| Production | NOT TOUCHED | 不部署、不写入、不执行自动化测试 |
