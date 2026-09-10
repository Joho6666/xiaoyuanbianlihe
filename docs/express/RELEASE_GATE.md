# Campus Box 3.0 Phase 3 Release Gate

| Gate | Status | Evidence |
| --- | --- | --- |
| Branch / HEAD | PASS | `refactor/campus-platform-foundation`，最终 HEAD `d968e09` |
| Local CI | PASS | `npm ci` 后 `npm run ci` 通过 |
| Staff Auth | PASS | `staff-permissions.test.js` |
| Normal User Hidden | PASS | UI 回归 + 服务端能力回归；真机仍未验证 |
| Server-side Permission | PASS | 伪造权限、停用、跨校和状态机回归 |
| Express Staff / Owner | PASS | 订单与权限内存回归；独立环境账号仍未提供 |
| Excel private storage | PASS | 两个 Sheet、私有路径和下载契约内存回归；真实 Storage 未核对 |
| Audit log / OpenID exposure | PASS | 审计脱敏与响应字段回归；真实 CloudBase 规则未核对 |
| CloudBase | NOT RUN | 未提供独立环境临时凭证 |
| DevTools | NOT RUN | 服务端口未开启时不得宣称编译成功 |
| Payment | NOT IMPLEMENTED | 仅独立环境测试支付适配器 |
| Production | NOT TOUCHED | 不部署、不写入、不执行自动化测试 |
