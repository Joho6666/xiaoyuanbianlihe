function normalizeCloudFileList(fileList, limit = 50) {
  if (!Array.isArray(fileList)) return []
  return Array.from(new Set(fileList.filter((fileId) => (
    typeof fileId === 'string' && fileId.startsWith('cloud://')
  )))).slice(0, limit)
}

function filterAccessibleFileList(fileList, accessible) {
  const allowed = accessible instanceof Set ? accessible : new Set()
  return normalizeCloudFileList(fileList).filter((fileId) => allowed.has(fileId))
}

function collectFileIds(rows, into) {
  const target = into instanceof Set ? into : new Set()
  for (const row of rows || []) {
    for (const key of ['images', 'videos', 'thumbImages']) {
      if (!Array.isArray(row[key])) continue
      row[key].forEach((fileId) => {
        if (typeof fileId === 'string' && fileId.startsWith('cloud://') === true) target.add(fileId)
      })
    }
    for (const key of ['image', 'imageUrl', 'avatar', 'avatarUrl', 'coverImage', 'fileId', 'audioUrl']) {
      if (typeof row[key] === 'string' && row[key].startsWith('cloud://')) target.add(row[key])
    }
  }
  return target
}

module.exports = { normalizeCloudFileList, filterAccessibleFileList, collectFileIds }
