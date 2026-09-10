# Express 3.8：截图智能导入规格

## 范围

截图智能导入只是现有 Express 3.7 下单页的输入辅助：用户选择 1–9 张快递通知截图，服务端临时下载并识别取件码与快递点，用户确认后回填现有 `pickupGroups`。它不会创建新订单类型、自动支付或自动提交订单。

明确不包含 OCR 全文存储、截图永久保存、LLM 主链路、短信/聊天读取、地图、骑手、Jobs、Ride、批量订单和真实微信支付。

## OCR 适配层

服务端提供统一接口：

```js
OCRAdapter.recognize({ buffer, mimeType, sourceImageIndex })
parsePickupCandidates(text, context)
matchPickupPoint(candidate, pickupPoints, context)
deduplicatePickupCandidates(candidates)
sanitizeOcrResult(result)
```

默认由环境变量显式选择 `mock` 或 `tencent`。Mock 仅用于测试/非生产开发；腾讯云 OCR 只允许独立测试环境使用，并要求 `TCB_ENV_ID` 与 `EXPRESS_OCR_TEST_ENV_ID` 一致。客户端永远不接触 OCR 密钥。

## 临时文件生命周期

客户端使用随机 `requestId` 上传到：

```text
tmp/express-import/<internalUserId>/<requestId>/<uuid>.jpg
```

`recognizeExpressScreenshots` 服务端从当前 OpenID 解析 `internalUserId`，拒绝公网 URL、其他用户目录和不属于当前 requestId 的 fileID。图片只存在于本次请求期间；识别结束、部分失败或异常时均在 `finally` 清理。清理失败返回失败，不返回可导入候选，且日志只记录数量和错误类别。

## 识别与确认

请求：

```js
{
  requestId,
  imageFileIds: [],
  deliveryCampus
}
```

响应只返回候选摘要、失败图片索引和统计：

```js
{
  requestId,
  candidates: [{
    id,
    pickupCode,
    pickupPointId,
    pickupPointName,
    packageCount,
    confidence,
    matchStatus,
    warnings,
    sourceImageIndex
  }],
  failedImages,
  summary
}
```

`sourceImageIndex` 对用户展示为从 1 开始的截图序号；服务端不返回原始 OCR 行文本。

不返回 OCR 全文、fileID、公网 URL、手机号、姓名、房间、OpenID、Secret 或 Provider 堆栈。

取件码支持字母数字、短横线和纯数字格式。件数尽量从“X件/共X个包裹/包裹数”解析；无法确定时默认 1 并提示用户核对。最终件数仍由 Express 3.7 服务端限制校验。

快递点匹配使用 `name`、`shortName`、`aliases` 和配送校区上下文。唯一启用点才自动匹配；无匹配、多匹配、禁用点或校区冲突必须人工选择或删除。

同一快递点与取件码（不区分大小写）重复时保留置信度更高的候选，不累加件数。与当前页面已有手工 Item 重复时跳过且提示，不覆盖手工输入。

## 下单页交互

1. 选择截图并逐张上传。
2. 显示识别进度和部分失败状态。
3. 在确认 Sheet 编辑快递点、取件码和件数。
4. 所有保留候选必须匹配快递点。
5. 点击“全部导入到下单页”后合并到现有 `pickupGroups`。
6. 用户仍可手工修改、重新报价并按原流程支付/提交。

取消只丢弃本次候选，不改变表单。失败图片可重新选择后再次识别；不复用已清理的 fileID。

## 配置与验收

`express_settings.pickupPoints` 可选保存最多 10 个 `aliases`，旧设置缺失时按空数组处理。Provisioning 不新增 OCR 集合或订单 Item 集合，只需人工核对临时 Storage 路径权限。

本地验收执行解析器、匹配器、导入权限、清理失败、去重和页面静态回归。真实腾讯云 OCR Smoke 只有在独立环境凭证、测试图片和非生产目标均明确时执行；没有条件时记录 `NOT RUN`，不得用 Mock 或静态检查替代真实 PASS。
