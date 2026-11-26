# ProjectPilot 数据库备份（Windows）
# 用法：.\scripts\backup.ps1 [-OutDir 目录] [-Keep 保留份数]
# 建议配合任务计划程序每日执行
param(
  [string]$OutDir = (Join-Path $PSScriptRoot '..\backups'),
  [int]$Keep = 14
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$file = Join-Path $OutDir "projectpilot-$stamp.sql"
docker exec projectpilot-postgres pg_dump -U projectpilot projectpilot | Set-Content -LiteralPath $file -Encoding utf8
if (-not (Get-Item $file).Length) { throw '备份文件为空，请检查容器状态' }
# 只保留最近 N 份
Get-ChildItem $OutDir -Filter 'projectpilot-*.sql' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Keep |
  Remove-Item -Force
Write-Output "备份完成: $file"
