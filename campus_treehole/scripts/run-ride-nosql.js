/**
 * Provision ride collections + indexes via tcb CLI.
 * 输出幂等命令清单；集合创建与权限（仅云函数访问）仍需在 CloudBase 控制台人工核对。
 *
 * 用法：
 *   CLOUDBASE_ENV_ID=<envId> node scripts/run-ride-nosql.js
 *   可选 TCB_BIN 指定 tcb 可执行文件（默认 node_modules/.bin/tcb）。
 * CLI 不可用时仅打印等价命令清单，交由控制台人工执行。
 */
const { spawnSync } = require('child_process')
const path = require('path')
const { getEnvId } = require('./env')

const ENV_ID = getEnvId()
const root = path.resolve(__dirname, '..')

const commands = [
  {
    TableName: 'ride_posts',
    CommandType: 'COMMAND',
    Command: JSON.stringify({
      createIndexes: 'ride_posts',
      indexes: [
        { key: { campusId: 1, status: 1, departureTime: 1 }, name: 'campus_status_departure' },
        { key: { _openid: 1, createdAt: -1 }, name: 'author_created' },
        { key: { status: 1, expiresAt: 1 }, name: 'status_expires' }
      ]
    })
  },
  {
    TableName: 'ride_join_requests',
    CommandType: 'COMMAND',
    Command: JSON.stringify({
      createIndexes: 'ride_join_requests',
      indexes: [
        { key: { rideId: 1, status: 1, createdAt: -1 }, name: 'ride_status_created' },
        { key: { _openid: 1, createdAt: -1 }, name: 'requester_created' }
      ]
    })
  },
  {
    TableName: 'ride_members',
    CommandType: 'COMMAND',
    Command: JSON.stringify({
      createIndexes: 'ride_members',
      indexes: [
        { key: { rideId: 1, joinedAt: 1 }, name: 'ride_joined' },
        { key: { _openid: 1, joinedAt: -1 }, name: 'member_joined' }
      ]
    })
  }
]

const cmdArg = JSON.stringify(JSON.stringify(commands))

function printManual() {
  console.log('未检测到 CLOUDBASE_ENV_ID 或 tcb CLI，请在 CloudBase 控制台人工执行以下数据库命令：\n')
  for (const command of commands) {
    console.log(`// ${command.TableName}`)
    console.log(command.Command, '\n')
  }
  console.log('等价 CLI：tcb db nosql execute -e <envId> --json --command ' + cmdArg)
}

if (!ENV_ID) {
  printManual()
  process.exit(0)
}

const bin = process.env.TCB_BIN || path.join(root, 'node_modules', '.bin', 'tcb')
const args = ['db', 'nosql', 'execute', '-e', ENV_ID, '--json', '--command', cmdArg]
const result = spawnSync(bin, args, { stdio: 'inherit', windowsHide: true })
if (!result || result.error || result.status !== 0) {
  console.error('\ntcb 执行失败（CLI 可能未安装），转人工清单：\n')
  printManual()
  process.exit(result && result.status ? result.status : 0)
}
