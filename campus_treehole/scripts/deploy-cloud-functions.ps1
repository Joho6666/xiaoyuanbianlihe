# 逐个部署 cloudbaserc.json 中的云函数（CLI 一次只接受一个函数名）
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot + '\..'

$envId = $env:CLOUD_ENV_ID
if (-not $envId -and (Test-Path (Join-Path (Get-Location) 'cloudbaserc.json'))) {
  $envId = (Get-Content -Raw (Join-Path (Get-Location) 'cloudbaserc.json') | ConvertFrom-Json).envId
}
if (-not $envId -or $envId -match '^(YOUR_CLOUD_ENV_ID|你的云环境ID)$') {
  throw '请先设置 CLOUD_ENV_ID，或在 campus_treehole/cloudbaserc.json 配置 envId'
}
$names = @(
  'userReferral',
  'bindInviteEmployee',
  'adminPanel',
  'dbOperations'
)

foreach ($name in $names) {
  Write-Host "`n=== Deploying $name ===" -ForegroundColor Cyan
  $extra = @()
  if ($name -eq 'dbOperations') {
    $extra += '--deployMode', 'zip'
  }
  & npx -p @cloudbase/cli@latest tcb fn deploy $name -e $envId --force @extra
  if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED: $name (exit $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
  }
  Write-Host "OK: $name" -ForegroundColor Green
}

Write-Host "`nAll functions deployed." -ForegroundColor Green
