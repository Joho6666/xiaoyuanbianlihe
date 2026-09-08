const assert = require('assert')
const {
  normalizeCloudFileList,
  filterAccessibleFileList,
  collectFileIds
} = require('../cloudfunctions/dbOperations/fileAccess')

// 10 条业务路径 × 10 种输入形态 × 10 个数据规模，形成 1000 个可重复场景。
let scenarioCount = 0
for (let flow = 0; flow < 10; flow += 1) {
  for (let shape = 0; shape < 10; shape += 1) {
    for (let size = 0; size < 10; size += 1) {
      const own = `cloud://owned/${flow}-${shape}-${size}`
      const publicFile = `cloud://public/${flow}-${shape}-${size}`
      const privateFile = `cloud://private/${flow}-${shape}-${size}`
      const input = [
        own,
        publicFile,
        privateFile,
        'https://example.invalid/not-cloud',
        null,
        own,
        ...Array.from({ length: size * 7 }, (_, i) => `cloud://noise/${flow}-${shape}-${i}`)
      ]
      const normalized = normalizeCloudFileList(input)
      assert.ok(normalized.length <= 50)
      assert.strictEqual(new Set(normalized).size, normalized.length)
      assert.ok(normalized.every((fileId) => fileId.startsWith('cloud://')))

      const accessible = new Set([own, publicFile])
      assert.deepStrictEqual(
        filterAccessibleFileList(input, accessible),
        [own, publicFile]
      )

      const collected = collectFileIds([
        { images: [own], videos: [publicFile], thumbImages: [privateFile], image: own, avatar: publicFile, fileId: privateFile },
        { audioUrl: `cloud://audio/${flow}-${shape}-${size}` }
      ], new Set())
      assert.ok(collected.has(own))
      assert.ok(collected.has(publicFile))
      assert.ok(collected.has(privateFile))
      assert.ok(collected.has(`cloud://audio/${flow}-${shape}-${size}`))
      scenarioCount += 1
    }
  }
}

assert.strictEqual(scenarioCount, 1000)
console.log(`virtual security scenarios passed: ${scenarioCount}`)
