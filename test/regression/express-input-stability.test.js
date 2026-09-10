const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')
const mini = path.join(root, 'campus_treehole')
const orderWxml = fs.readFileSync(path.join(mini, 'packageExpress/pages/order/order.wxml'), 'utf8')
const orderJs = fs.readFileSync(path.join(mini, 'packageExpress/pages/order/order.js'), 'utf8')

function run() {
  // 1. Precise path updates for pickupCode input (prevents cursor jump and keystroke loss)
  const pickupInputMatch = orderJs.match(/onPickupInput\(e\) \{([\s\S]*?)\n  \},\n  onItemCountChange/)
  assert.ok(pickupInputMatch, 'onPickupInput handler must exist')
  const pickupInputBody = pickupInputMatch[1]
  assert.ok(
    !pickupInputBody.includes('map((group)') && !pickupInputBody.includes('setData({ pickupGroups:'),
    'onPickupInput must NOT clone and setData the whole pickupGroups array'
  )
  assert.ok(
    pickupInputBody.includes('pickupGroups[${groupIndex}].items[${itemIndex}].pickupCode'),
    'onPickupInput must update exact pickupCode path'
  )

  // 2. Continuous typing simulation: in-memory state updated synchronously before async setData
  assert.ok(
    pickupInputBody.includes('item.pickupCode = e.detail.value'),
    'onPickupInput must update item.pickupCode synchronously in memory'
  )

  // 3. Stable wx:keys for groups and items (prevents DOM re-creation and input unmounting)
  assert.ok(
    orderWxml.includes('wx:key="groupKey"'),
    'pickup-group must use stable groupKey rather than pickupPointId'
  )
  assert.ok(
    orderWxml.includes('wx:key="id"'),
    'pickup-item must use stable item id'
  )

  // 4. Quote debounce & blur/confirm flush
  assert.ok(
    orderJs.includes('scheduleQuote(delay = 400)') || orderJs.includes('scheduleQuote(delay = 400) {'),
    'scheduleQuote must provide debounce delay'
  )
  assert.ok(
    orderJs.includes('onPickupBlur() { this.scheduleQuote(0) }') || orderJs.includes('this.scheduleQuote(0)'),
    'onPickupBlur or onPickupConfirm must force immediate quote evaluation'
  )

  // 5. Focus management without destroying input state
  const clearFocusMatch = orderJs.match(/clearPickupFocus\(\) \{([\s\S]*?)\n  \},/)
  if (clearFocusMatch) {
    const clearFocusBody = clearFocusMatch[1]
    assert.ok(
      !clearFocusBody.includes('setData({ pickupGroups:'),
      'clearPickupFocus must not re-serialize the entire pickupGroups array'
    )
  }

  // 6. OCR candidate input stability
  const importInputMatch = orderJs.match(/onImportCandidateInput\(e\) \{([\s\S]*?)\n  \},/)
  assert.ok(importInputMatch, 'onImportCandidateInput must exist')
  const importInputBody = importInputMatch[1]
  assert.ok(
    importInputBody.includes('importCandidates[${index}]'),
    'onImportCandidateInput must update candidate by path'
  )

  // 7. UI UX: Special parcel notice & verification notice & breakdown
  assert.ok(
    orderWxml.includes('specialParcelNotice'),
    'Order template must render special parcel notice'
  )
  assert.ok(
    orderWxml.includes('请按实际大小选择，工作人员取件时会核对'),
    'Order template must explicitly remind users about staff verification'
  )
  assert.ok(
    orderWxml.includes('quote-size-breakdown'),
    'Order submit bar must show quote size breakdown'
  )

  console.log('PASS Express input stability: path updates, stable keys, debounce, blur flush, and size notice')
}

run()
