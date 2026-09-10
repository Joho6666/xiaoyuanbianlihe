const createStaffModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/staff')
const createExpressModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/express')
const { STAFF_PERMISSIONS } = require('../../shared/domain/staff')
const { createExpressMock } = require('./express-mock')

function createExpressFixture() {
  process.env.TCB_ENV_ID = 'express-3-5-test'
  process.env.EXPRESS_TEST_PAYMENT_ENV_ID = 'express-3-5-test'
  process.env.EXPRESS_TEST_PAYMENT_ALLOWED = 'true'
  const users = [
    { _id: 'owner', _openid: 'oid-owner', internalUserId: 'owner-id', role: 'admin', status: 'active', campusId: 'guit-hangtian', nickName: 'Owner' },
    { _id: 'staff', _openid: 'oid-staff', internalUserId: 'staff-id', role: 'user', status: 'active', campusId: 'guit-hangtian', nickName: 'Staff' },
    { _id: 'student', _openid: 'oid-student', internalUserId: 'student-id', role: 'user', status: 'active', campusId: 'guit-hangtian', nickName: 'Student' }
  ]
  const mock = createExpressMock({ users })
  mock.store.staff_accounts = [{ _id: 'staff_staff-id', userId: 'staff-id', status: 'active', campusIds: ['guit-hangtian'], permissions: Object.values(STAFF_PERMISSIONS) }]
  mock.store.staff_audit_logs = []
  const getUserForAction = async (openid) => mock.store.users.find((user) => user._openid === openid)
  const staff = createStaffModule({ db: mock.db, _: mock._, helpers: { getUserForAction, checkAdmin: async (openid) => openid === 'oid-owner' } })
  const express = createExpressModule({ db: mock.db, _: mock._, cloud: mock.cloud, helpers: { staff, getUserForAction, resolveCampusIdForRead: (value) => value, makeDeterministicId: (scope, value) => `${scope}_${String(value).replace(/[^a-z0-9-]/gi, '')}` } })
  return { ...mock, express, staff }
}

module.exports = { createExpressFixture }
