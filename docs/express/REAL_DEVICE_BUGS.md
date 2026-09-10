# 桂航快递代拿真机问题排查与修复记录 (Real Device Bugs)

本文档如实记录在微信真机及开发者工具测试中发现的高优先级（P0）体验与链路问题、根本原因分析、修复方案与对应的代码提交。

---

## 1. 截图一键导入出现「未知操作: recognizeExpressScreenshots」

### 1.1 故障现象
在真机上进入「快递代拿」下单页，点击「截图一键导入」，选择真实快递通知截图后，客户端弹出报错提示：
```text
未知操作: recognizeExpressScreenshots
```
操作中断，无法进入取件码确认浮层。

### 1.2 完整调用链审计
```text
packageExpress/pages/order/order.js
        ↓
app.callDB('recognizeExpressScreenshots', { requestId, imageFileIds, deliveryCampus })
        ↓
campus_treehole/cloudfunctions/dbOperations/index.js
        ↓
EXPRESS_ACTIONS.has(action)
        ↓
getExpressModule().recognizeExpressScreenshots
        ↓
modules/express-import.js
```

### 1.3 根本原因分析 (Root Cause)
1. **本地代码已实现**：本地 Git 仓库已在 `modules/express.js` 中引入 `express-import.js` 并将 `recognizeExpressScreenshots` 加入 `ACTION_NAMES`。
2. **线上云函数未同步**：线上 CloudBase 环境（`xyblh-5gb26qrnf9d30feb`）当前运行的 `dbOperations` 部署包为历史版本，尚未包含 `express-import.js`、`express-ocr.js` 及最新的 Action 注册表。
3. **分发器降级**：当线上旧版本 `dbOperations` 收到未识别的 action 时，执行到末尾 `default: return { code: -1, msg: `未知操作: ${action}` }`。
4. **防御机制缺失**：此前 CI 中缺乏自动对比“前端页面调用的所有 callDB action”与“云函数已暴露 action 集合”的静态契约检查，导致云端与客户端版本漂移时无法提前阻断。

### 1.4 修复方案
1. 建立自动化端到端 Action 契约测试（`test/regression/express-dispatch.test.js`），动态扫描 `packageExpress` 下所有 `.js` 文件中的 `app.callDB` 调用，并强制要求与 `dbOperations` 分发器 100% 对齐。未暴露的 action 将导致 CI 构建直接失败。
2. 编写标准化重新部署核对清单：`docs/express/CLOUDFUNCTION_DEPLOY_CHECKLIST.md`，明确指引 `dbOperations` 上传部署规范与依赖安装项。

### 1.5 关联 Commit
- `5d54725`: fix(express): repair screenshot import action contract

### 1.6 验证状态
- **本地单元与契约测试**：`LOCAL PASS`
- **CI 自动化门禁**：`CI PASS`
- **开发者工具验证**：`DEVTOOLS PASS`
- **真实 CloudBase 生产部署**：`PENDING_DEPLOY`（需在微信开发者工具中按清单右键上传云函数并安装依赖）
- **真机端到端 OCR 验证**：`NOT RUN`（依赖云函数部署与腾讯云 API 密钥配置）

---

## 2. 取件码 Input 无法连续输入 / 光标跳动异常

### 2.1 故障现象
在真机上点击「请输入取件码」输入框，尝试连续输入 `123456789` 时：
- 输入过程极度卡顿，字符丢失；
- 中文拼音输入法下频繁被打断、丢拼音字母；
- 光标频繁跳回输入框末尾或开头，无法正常退格或在中间插入字符；
- 偶发输入框失焦或软键盘自动收起。

### 2.2 根本原因分析 (Root Cause)
1. **全量对象深拷贝与全量 setData**：
   原有 `onPickupInput(e)` 实现为：
   ```javascript
   const groups = this.data.pickupGroups.map((group) => ({ ...group, items: group.items.slice() }))
   groups[groupIndex].items[itemIndex] = { ...groups[groupIndex].items[itemIndex], pickupCode: e.detail.value }
   this.setData({ pickupGroups: groups }, () => this.scheduleQuote())
   ```
   用户每敲击一个字符，都会触发跨语言桥梁序列化整个 `pickupGroups` 嵌套数组对象。
2. **受控 Input 在全量重渲染下重置焦点与光标**：
   在小程序架构中，如果 `<input value="{{val}}" focus="{{focus}}">` 的父级组件被全量 `setData` 替换，原生输入组件会接收到新的组件实例或强制重新同步 `value`，导致移动端输入法的光标位置被重置到末尾或丢弃正在组合中的 IME 拼音字符。
3. **延迟 Focus 逻辑干扰用户**：
   原逻辑在添加取件码 600ms 后执行 `setTimeout(() => this.clearPickupFocus(), 600)`，该定时器内再次触发了全量 `setData({ pickupGroups: ... })`，恰好撞上用户刚开始输入的黄金时间窗口，造成强行打断。
4. **不稳定 wx:key**：
   外层 `pickup-group` 此前使用 `wx:key="pickupPointId"`，当多个分组尚未选定快递点时 key 均为 `""`，发生 DOM Key 碰撞，导致视图重排错乱。

### 2.3 修复方案
1. **改用精确数据路径更新 (Path-based setData)**：
   不再深拷贝或序列化整个 `pickupGroups` 数组，而是仅更新变化的单一叶子节点字段：
   ```javascript
   const pickupCodePath = `pickupGroups[${groupIndex}].items[${itemIndex}].pickupCode`
   this.setData({ [pickupCodePath]: e.detail.value })
   ```
   同时同步更新内存中的 `item.pickupCode`，确保瞬时计算与下一次按键无竞态。
2. **赋予稳定自增 ID 作为 wx:key**：
   分组引入唯一且不可变的 `groupKey`（`wx:key="groupKey"`），取件码项保持唯一 `id`（`wx:key="id"`），消除 DOM 重绘闪烁。
3. **消除全量 Focus 清除**：
   `clearPickupFocus` 改为针对持有 `focus: true` 的条目进行微量路径重置，不在用户输入中途发起全量重置；输入框绑定 `bindfocus`，获焦后立刻解除 `focus` 属性。
4. **防抖实时报价**：
   输入时保持 400ms 防抖请求，在 `bindblur`（失焦）与 `bindconfirm`（键盘完成）时立即刷新报价，兼顾低网络负载与实时计价准确性。
5. **顶部导航视觉去重**：
   将页面内小英雄卡片标题优化为「桂航专人配送」，消除与微信原生顶栏标题「快递代拿」的重复叠影。

### 2.4 关联 Commit
- `3506452`: fix(express): stabilize pickup code input on device

### 2.5 验证状态
- **本地回归测试**：`LOCAL PASS`（`test/regression/express-input-stability.test.js`）
- **CI 自动化流水线**：`CI PASS`
- **真机手动验证**：`LOCAL PASS`（连续字符输入流畅，无闪烁、不丢字符）
