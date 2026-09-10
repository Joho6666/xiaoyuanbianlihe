# CloudBase 云函数部署与 Action 契约核对清单

## 1. 故障现象与根因诊断（P0-1）

### 1.1 现象
在真机或微信开发者工具中点击「截图一键导入」，上传截图后提示：
```text
未知操作: recognizeExpressScreenshots
```

### 1.2 完整调用链路审计
```text
packageExpress/pages/order/order.js (客户端调用 app.callDB('recognizeExpressScreenshots', ...))
        ↓
app.callDB() (包装 wx.cloud.callFunction({ name: 'dbOperations', data: { action: 'recognizeExpressScreenshots', ... } }))
        ↓
cloudfunctions/dbOperations/index.js (云函数入口分发器)
        ↓
EXPRESS_ACTIONS.has(action) (基于 createExpressModule.ACTION_NAMES 校验)
        ↓
getExpressModule()[action] (从 express.js 获取对应的处理函数)
        ↓
express-import.js (expressImport.recognizeExpressScreenshots)
```

### 1.3 根因判定
1. **代码层面**：本地代码库已在 `modules/express.js` 中将 `recognizeExpressScreenshots` 引入并放入 `ACTION_NAMES`，`index.js` 中的 `EXPRESS_ACTIONS` 也包含该 Action。
2. **部署层面**：线上 CloudBase 环境（当前为 `xyblh-5gb26qrnf9d30feb`）当前运行的 `dbOperations` 为历史版本，尚未包含 `express-import.js`、`express-ocr.js` 等模块及最新的 Action 注册表。
3. **分发器行为**：当线上旧版本 `dbOperations` 收到 `recognizeExpressScreenshots` 时，由于未在 `EXPRESS_ACTIONS` 与 `switch` 分支中匹配，进入分发器末尾的 `default:` 分支，直接返回 `{ code: -1, msg: "未知操作: recognizeExpressScreenshots" }`。

---

## 2. 云函数部署操作指南

### 2.1 目标云函数与目录
- **云函数名称**：`dbOperations`
- **本地源码绝对目录**：`campus_treehole/cloudfunctions/dbOperations`
- **目标环境 ID**：`xyblh-5gb26qrnf9d30feb`（必须与 `campus_treehole/config/cloud-env.js` 一致，禁止误部署到生产环境）

### 2.2 云端依赖（package.json）
部署时必须保证云端已安装以下 npm 依赖（使用微信开发者工具「上传并运行：云端安装依赖」或本地 `npm install` 后整包上传）：
```json
{
  "dependencies": {
    "exceljs": "^4.4.0",
    "tencentcloud-sdk-nodejs-ocr": "^4.1.310",
    "wx-server-sdk": "~2.6.3"
  }
}
```

### 2.3 必须包含的文件清单
部署包中必须完整包含以下文件，不得遗漏：
```text
cloudfunctions/dbOperations/
├── index.js
├── package.json
├── modules/
│   ├── express.js
│   ├── express-import.js
│   ├── express-ocr.js
│   ├── express-pickup-parser.js
│   ├── express-pickup-matcher.js
│   └── staff.js
├── shared/
│   ├── campus.js
│   ├── public-data.js
│   └── user-identity.js
└── domain/
    └── express.js
```

### 2.4 云函数环境变量配置
若需使用腾讯云 OCR 真实服务识别快递截图，需在 CloudBase 控制台为 `dbOperations` 函数配置以下环境变量：
- `EXPRESS_OCR_SECRET_ID`: 腾讯云 API 密钥 SecretId
- `EXPRESS_OCR_SECRET_KEY`: 腾讯云 API 密钥 SecretKey
- `EXPRESS_OCR_REGION`: 地域（默认 `ap-guangzhou`）

若未配置上述环境变量，系统会安全降级返回 `OCR_NOT_CONFIGURED` 错误码，而不是崩溃或返回未知操作。

---

## 3. Action 契约自动化验证

为防止客户端新增 Action 但服务端未暴露导致上线故障，CI 建立了自动化测试门禁：
- 测试文件：`test/regression/express-dispatch.test.js`
- 运行命令：`node test/regression/express-dispatch.test.js`

### 3.1 客户端 Express 页面全部 Action 覆盖清单
以下为 `packageExpress` 前端所使用的全部服务端 Action，部署后必须 100% 可达：

| Action 名称 | 归属模块 | 访问控制 | 功能描述 |
|---|---|---|---|
| `getExpressServiceConfig` | Express | 公开读取 | 获取校区快递配置与接单状态 |
| `getExpressQuote` | Express | 公开读取 | 获取根据包裹规格与数量的服务端报价 |
| `createExpressOrder` | Express | 登录用户 | 创建快递代拿订单 |
| `getMyExpressOrders` | Express | 登录用户 | 获取当前用户的订单列表 |
| `getMyExpressOrder` | Express | 登录用户 | 获取单条订单详情 |
| `cancelMyExpressOrder` | Express | 订单所属人 | 取消待支付或符合条件的订单 |
| `createExpressTestPayment` | Express | 登录用户 (受控) | 模拟测试支付流 |
| `getMyExpressDeliveryProfiles` | Express | 登录用户 | 获取常用宿舍配送地址 |
| `createExpressDeliveryProfile` | Express | 登录用户 | 创建常用配送信息 |
| `updateExpressDeliveryProfile` | Express | 配送信息所属人 | 更新配送信息 |
| `archiveExpressDeliveryProfile` | Express | 配送信息所属人 | 归档（删除）配送信息 |
| `setDefaultExpressDeliveryProfile`| Express | 配送信息所属人 | 设置默认配送地址 |
| `recognizeExpressScreenshots` | Express | 登录用户 | 识别截图并解析取件码 |
| `ownerUpdateExpressSettings` | Express | Owner 专有 | 更新接单配置与小/中/大件定价 |
| `staffGetExpressDashboard` | Express | Staff / Owner | 工作人员订单聚合统计面板 |
| `staffGetExpressOrders` | Express | Staff / Owner | 工作人员分页拉取待取/配送中订单 |
| `staffGetExpressOrderDetail` | Express | Staff / Owner | 订单履约详情与核验信息 |
| `staffUpdateExpressOrderStatus` | Express | Staff / Owner | 更新单个订单履约状态 |
| `staffBatchUpdateExpressOrderStatus` | Express | Staff / Owner | 批量更新订单状态（如批量开始配送）|
| `staffExportExpressOrders` | Express | Staff / Owner | 导出取件与配送双表格 Excel |
| `getMyStaffCapabilities` | Staff | 登录用户 | 查询当前用户员工/Owner权限矩阵 |
| `ownerResolveExpressStaffCandidate` | Staff | Owner 专有 | 检索待添加员工用户 |
| `ownerAddExpressStaff` | Staff | Owner 专有 | 添加跑腿员工 |
| `ownerDisableExpressStaff` | Staff | Owner 专有 | 禁用跑腿员工 |
| `ownerGetExpressStaff` | Staff | Owner 专有 | 获取跑腿员工列表 |

---

## 4. 部署后验证步骤（Verification Gate）

1. **测试用例运行**：
   ```bash
   npm test
   ```
   确认 `express-dispatch.test.js` 输出 `PASS Express dispatch: action routing, public read actions, and anonymous service config safety`。
2. **云端调用联调验证**：
   在微信开发者工具控制台直接执行：
   ```javascript
   wx.cloud.callFunction({
     name: 'dbOperations',
     data: {
       action: 'recognizeExpressScreenshots',
       data: { requestId: 'smoke_test', imageFileIds: [] }
     }
   }).then(res => console.log('Contract check:', res.result))
   ```
   **合格标准**：`res.result.code` 返回 `-1` 且错误信息为缺少图片或参数无效，**绝对不能返回 `未知操作: recognizeExpressScreenshots`**。
