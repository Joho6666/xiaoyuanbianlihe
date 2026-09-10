const crypto = require('crypto')

function clone(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => item instanceof Date ? { __date: item.toISOString() } : item), (key, item) => item && item.__date ? new Date(item.__date) : item)
}

function matches(row, query) {
  return Object.entries(query || {}).every(([key, expected]) => {
    if (expected && expected.operator === 'in') return expected.value.includes(row[key])
    if (expected && expected.operator === 'gte') return new Date(row[key]).getTime() >= new Date(expected.value).getTime()
    if (expected && expected.operator === 'lt') return new Date(row[key]).getTime() < new Date(expected.value).getTime()
    if (expected && expected.operator === 'exists') return (row[key] !== undefined) === expected.value
    if (expected && expected.operator === 'neq') return row[key] !== expected.value
    return row[key] === expected
  })
}

function createExpressMock(initial = {}) {
  const store = {}
  Object.entries(initial).forEach(([key, rows]) => { store[key] = rows.map(clone) })
  const collection = (name) => {
    if (!store[name]) store[name] = []
    const rows = store[name]
    const queryApi = (query = {}) => {
      const getRows = () => rows.filter((row) => matches(row, query)).map(clone)
      const api = {
        get: async () => ({ data: getRows() }),
        count: async () => ({ total: getRows().length }),
        update: async ({ data }) => {
          let updated = 0
          rows.forEach((row) => { if (matches(row, query)) { Object.assign(row, clone(data)); updated++ } })
          return { stats: { updated } }
        },
        remove: async () => {
          let removed = 0
          for (let index = rows.length - 1; index >= 0; index--) if (matches(rows[index], query)) { rows.splice(index, 1); removed++ }
          return { stats: { removed } }
        },
        limit: () => api,
        skip: () => api,
        orderBy: () => api
      }
      return api
    }
    return {
      where: queryApi,
      get: async () => ({ data: rows.map(clone) }),
      add: async ({ data }) => {
        const _id = data._id || `row_${crypto.randomBytes(4).toString('hex')}`
        rows.push({ _id, ...clone(data) })
        return { _id }
      },
      doc: (id) => ({
        get: async () => ({ data: rows.find((row) => row._id === id) ? clone(rows.find((row) => row._id === id)) : null }),
        set: async ({ data }) => {
          const index = rows.findIndex((row) => row._id === id)
          const value = { _id: id, ...clone(data) }
          if (index >= 0) rows[index] = value
          else rows.push(value)
          return { _id: id }
        },
        update: async ({ data }) => {
          const row = rows.find((item) => item._id === id)
          if (row) Object.assign(row, clone(data))
          return { stats: { updated: row ? 1 : 0 } }
        },
        remove: async () => {
          const index = rows.findIndex((row) => row._id === id)
          if (index >= 0) rows.splice(index, 1)
          return { stats: { removed: index >= 0 ? 1 : 0 } }
        }
      })
    }
  }
  const db = {
    serverDate: () => new Date('2026-09-10T08:00:00.000Z'),
    collection,
    command: {
      in: (value) => ({ operator: 'in', value }),
      gte: (value) => ({ operator: 'gte', value }),
      lt: (value) => ({ operator: 'lt', value }),
      neq: (value) => ({ operator: 'neq', value }),
      exists: (value = true) => ({ operator: 'exists', value })
    }
  }
  const cloud = {
    uploads: [],
    deleted: [],
    uploadFile: async (payload) => { cloud.uploads.push(payload); return { fileID: `cloud://${payload.cloudPath}` } },
    deleteFile: async ({ fileList }) => { cloud.deleted.push(...fileList); return { fileList } }
  }
  const _ = db.command
  return { store, db, _, cloud }
}

module.exports = { createExpressMock }
