#!/bin/sh
# ProjectPilot 数据库备份（Linux，配合 crontab 每日执行）
# 用法：./scripts/backup.sh [目录] [保留份数]
set -eu
OUT_DIR="${1:-$(dirname "$0")/../backups}"
KEEP="${2:-14}"
mkdir -p "$OUT_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
FILE="$OUT_DIR/projectpilot-$STAMP.sql"
docker exec projectpilot-postgres pg_dump -U projectpilot projectpilot > "$FILE"
[ -s "$FILE" ] || { echo "备份文件为空，请检查容器状态" >&2; exit 1; }
# 只保留最近 N 份
ls -1t "$OUT_DIR"/projectpilot-*.sql | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "备份完成: $FILE"
