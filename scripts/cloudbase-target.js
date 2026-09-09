// CloudBase target guard shared by provisioning, smoke, and test deployment.
// Runtime production configuration remains the single source of truth.
const { CLOUD_ENV_ID: PRODUCTION_ENV_ID } = require('../campus_treehole/config/cloud-env')

function normalizeEnvId(value) {
  return String(value || '').trim()
}

function isProductionEnv(value) {
  return normalizeEnvId(value).toLowerCase() === normalizeEnvId(PRODUCTION_ENV_ID).toLowerCase()
}

module.exports = { PRODUCTION_ENV_ID, normalizeEnvId, isProductionEnv }
