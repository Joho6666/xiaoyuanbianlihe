// shared/domain/index.js - 校园便利盒全域统一模型聚合出口
const user = require('./user')
const identity = require('./identity')
const conversation = require('./conversation')
const buddy = require('./buddy')
const language = require('./language')
const mutual = require('./mutual')
const ride = require('./ride')
const ridePlaces = require('./ride-places')
const rideMatching = require('./ride-matching')

module.exports = {
  ...user,
  ...identity,
  ...conversation,
  ...buddy,
  ...language,
  ...mutual,
  ...ride,
  ...ridePlaces,
  ...rideMatching
}
