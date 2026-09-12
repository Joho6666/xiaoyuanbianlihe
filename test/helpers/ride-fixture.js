// test/helpers/ride-fixture.js - 拼车模块回归测试夹具（内存 CloudBase + 事务 + 联系授权）
const { memoryDb } = require('./heart-memory-db')
const { makeDeterministicId } = require('../../campus_treehole/cloudfunctions/dbOperations/shared/id')
const { resolveCampusIdForRead, campusWhereClause, DEFAULT_CAMPUS_ID } = require('../../campus_treehole/cloudfunctions/dbOperations/shared/campus')
const { escapeRegExp } = require('../../shared/domain/ride-places')
const createRide = require('../../campus_treehole/cloudfunctions/dbOperations/modules/ride')
const createContacts = require('../../campus_treehole/cloudfunctions/dbOperations/modules/contacts')
const createMessages = require('../../campus_treehole/cloudfunctions/dbOperations/modules/messages')
const { publicId } = require('../../campus_treehole/cloudfunctions/dbOperations/shared/public-data')

async function fixture() {
  const db = memoryDb()
  const users = {}
  const blocked = new Set()
  const notifications = []
  let clock = Date.UTC(2026, 8, 11, 10, 0, 0) // 桂林 2026-09-11 18:00

  db.serverDate = () => clock

  const baseHelpers = {
    getUserForAction: async (id) => {
      const user = users[id]
      if (!user) throw new Error('用户不存在')
      return user
    },
    checkRateLimit: async () => true,
    checkBannedWords: () => ({ pass: true }),
    wxTextCheck: async () => ({ pass: true }),
    wxImageBatchCheck: async () => ({ pass: true }),
    isCollectionNotExistError: () => false,
    ensureCollection: async () => {},
    resolveCampusIdForRead,
    campusWhereClause: (cid) => campusWhereClause(db.command, cid),
    DEFAULT_CAMPUS_ID,
    escapeRegExp,
    findAuthorsHiddenByBlockRelation: async (a, ids) => new Set(ids.filter(b => blocked.has([a, b].sort().join(':')))),
    viewerBlockedByAuthor: async (viewer, author) => blocked.has([author, viewer].sort().join(':')),
    conversationBlocked: async (a, b) => blocked.has([a, b].sort().join(':')),
    addNotification: async (notification) => {
      notifications.push({ ...notification, createTime: clock })
      return notification
    },
    triggerSubscribeNotify: async () => {},
    makeDeterministicId
  }

  const contacts = createContacts({
    db,
    _: db.command,
    helpers: {
      getUserForAction: baseHelpers.getUserForAction,
      conversationBlocked: baseHelpers.conversationBlocked
    }
  })
  const helpers = {
    ...baseHelpers,
    grantForOpenids: (a, b, type, sourceId) => contacts.grantForOpenids(a, b, type, sourceId)
  }
  const ride = createRide({ db, _: db.command, cloud: {}, helpers })

  async function addUser(id, overrides = {}) {
    users[id] = {
      _id: `doc_${id}`,
      _openid: id,
      internalUserId: publicId(id),
      status: 'active',
      nickName: `同学${id.toUpperCase()}`,
      avatarUrl: `/images/avatar_${id}.png`,
      campusId: 'guit-hangtian',
      ...overrides
    }
    await db.collection('users').doc(users[id]._id).set({ data: users[id] })
    return users[id]
  }

  async function publishRide(authorId, overrides = {}) {
    const result = await ride.publishRide(authorId, {
      departureMode: 'NOW',
      origin: { poiId: 'guat-south-gate', name: '桂林航天工业学院（南校门）', address: '桂林市七星区金鸡路2号', latitude: 25.3321, longitude: 110.3653 },
      destination: { poiId: 'guilin-north-station', name: '桂林北站', address: '桂林市叠彩区站前路2号', latitude: 25.3390, longitude: 110.3135 },
      maxPeople: 3,
      campusId: 'guit-hangtian',
      ...overrides
    })
    if (result.code !== 0) throw new Error(`publishRide failed: ${result.msg}`)
    return result.data.rideId
  }

  return {
    db,
    ride,
    contacts,
    users,
    blocked,
    notifications,
    addUser,
    publishRide,
    addTime: (minutes) => { clock += minutes * 60000 },
    setTime: (ms) => { clock = ms },
    time: () => clock
  }
}

module.exports = { fixture }
