# Campus Box 3.0 Express Release Gate (桂航快递代拿发布门禁)

本文档严格记录快递代拿各功能模块在各个测试维度的真实就绪状态。严禁虚报测试结果，严格区分环境与验证级别：
- `IMPLEMENTED`：代码已编写就绪，尚未执行端到端验证
- `LOCAL PASS`：在本地 Node.js / 单元测试环境中测试通过
- `CI PASS`：已纳入自动化 CI 测试流水线且持续构建通过
- `DEVTOOLS PASS`：在微信开发者工具模拟器中手工或脚本验证通过
- `REAL DEVICE PASS`：已在真机微信客户端完成端到端人工验证
- `CLOUDBASE SMOKE PASS`：在腾讯云真实环境执行端到端自动化冒烟测试通过
- `NOT RUN`：当前环境条件不具备（如缺少真实硬件、无外网服务端口、未配置第三方 Secret 等），未执行

---

## 1. 门禁状态全景表

| 门禁项 (Gate Item) | 状态 (Status) | 凭证 / 说明 (Evidence & Notes) |
|---|---|---|
| **Git 分支与 HEAD** | CI PASS | `refactor/campus-platform-foundation`，严格禁止修改或自动合并 main |
| **本地 CI 流水线** | CI PASS | `npm run ci`（含 check:schools, check:domain, validate, lint, run-tests）持续全部通过 |
| **GitHub Actions CI** | CI PASS | 统一底座与多校区隔离自动化测试在 Node 18.x / 20.x 矩阵全部通过 |
| **Staff 权限矩阵** | CI PASS | `staff-permissions.test.js`：涵盖 Owner 专有、跑腿员工及普通用户边界 |
| **订单状态机与幂等** | CI PASS | `express-order-state.test.js`：WAIT_PAYMENT → WAIT_PICKUP → DELIVERING → COMPLETED |
| **校区结构化地址** | CI PASS | `express-address.test.js`：南校区/北校区、园区、楼栋树形验证与不可变快照 |
| **包裹规格计价引擎 (1/3/6)** | CI PASS | `express-parcel-size.test.js`：SMALL ¥1、MEDIUM ¥3、LARGE ¥6 服务端强算，前端伪造一律忽略 |
| **规格校验与禁用防护** | CI PASS | `express-parcel-size.test.js`：非法或已被 Owner 禁用的规格在服务端直接拦截 |
| **历史订单向下兼容** | CI PASS | `express-parcel-size.test.js`：历史未分类订单展示为“旧订单/未分类”，绝不重新按新价格算价 |
| **取件码输入稳定性 (P0-2)** | CI PASS | `express-input-stability.test.js`：精准路径更新，杜绝全量深拷贝与重置，连续输入稳定不跳光标 |
| **输入防抖与报价冲刷** | CI PASS | `express-input-stability.test.js`：输入保持 400ms 防抖，blur/confirm 时立即强制刷新报价 |
| **截图导入契约拦截 (P0-1)** | CI PASS | `express-dispatch.test.js`：动态扫描前端所有 action，与服务端分发器 100% 对齐 |
| **云函数部署规范与清单** | LOCAL PASS | `docs/express/CLOUDFUNCTION_DEPLOY_CHECKLIST.md` 已就绪 |
| **线上云函数真实部署** | NOT RUN | 当前开发环境网络限制，需开发者在微信开发者工具中右键重新上传部署 `dbOperations` |
| **真实腾讯云 OCR 识别** | NOT RUN | 云端未配置真实 `EXPRESS_OCR_SECRET_ID`/`SECRET_KEY`，目前运行于 Mock 或安全降级模式 |
| **截图 OCR 规格零臆测** | CI PASS | `express-parcel-size.test.js`：OCR 解析器绝不臆测包裹尺寸，强制由用户在确认浮层勾选 |
| **特殊件与超大件运营声明** | LOCAL PASS | 下单页已渲染 `specialParcelNotice` 运营提示与规格核对指引 |
| **工作人员规格不符核验** | CI PASS | `express-parcel-size.test.js`：支持工作人员记录规格差异，写入安全审计日志，学生端展示核对告警 |
| **配置读取异常透传 (P0-5)** | CI PASS | `express-settings-errors.test.js`：仅集合/文档不存在返回 null，数据库及网络异常严格 throw |
| **双表格私有化 Excel 导出** | CI PASS | `express-export.test.js`：取件 Sheet 与配送 Sheet 独立排版，支持排序与统计，7 天自动销毁 |
| **微信真实支付** | NOT RUN | 个人开发者与现阶段未配置商户号，当前使用受控测试支付适配器（`testPayment`） |
| **微信开发者工具端口调试** | NOT RUN | 开发者工具命令行 CLI / HTTP 端口当前未开启，测试采用 Node 模拟器全量契约与断言验证 |
| **桂航真实设备小规模运营** | NOT RUN | 云函数部署、真实 OCR 和真机端到端尚未完成；代码与本地回归不能替代真实运营验收 |
