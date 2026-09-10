#!/bin/bash
# 独立监控脚本 — 不依赖 Gemini API 或 Claude Code 会话
#
# 功能：
# 1. 每 CHECK_INTERVAL 秒检查审查脚本是否存活
# 2. 如果死了且还有 pending batch，自动重启
# 3. 写状态到 watchdog-status.txt（可随时 cat 查看）
# 4. 到 STOP_HOUR 自动停止自己和审查脚本
#
# 用法：
#   nohup bash scripts/question-bank/audit-watchdog.sh > output/audit-2026-04-01/watchdog.log 2>&1 &

set -euo pipefail

# 配置
PROJECT_DIR="/Users/mac/Documents/运维/toBeduTrack"
AUDIT_DIR="$PROJECT_DIR/output/audit-2026-04-01"
CHECK_INTERVAL=300  # 5 分钟检查一次
STOP_HOUR=21        # 21:00 停止
LOG="$AUDIT_DIR/review-runner-v3.log"
STATUS_FILE="$AUDIT_DIR/watchdog-status.txt"
REVIEW_CMD="pnpm tsx scripts/question-bank/audit-sonnet-review.ts --concurrency 5 --delay 500 --model gemini-3.1-flash-lite-preview --stop-hour $STOP_HOUR"

cd "$PROJECT_DIR"

log() {
  echo "[watchdog $(date '+%H:%M:%S')] $*"
}

write_status() {
  local now
  now=$(date '+%Y-%m-%d %H:%M:%S')

  # 统计 batch 完成数
  local done_batches
  done_batches=$(jq '[.batches[] | select(.status == "done")] | length' "$AUDIT_DIR/progress.json" 2>/dev/null || echo "?")
  local total_batches
  total_batches=$(jq '.batches | length' "$AUDIT_DIR/progress.json" 2>/dev/null || echo "?")
  local pending_batches
  pending_batches=$(jq '[.batches[] | select(.status == "pending")] | length' "$AUDIT_DIR/progress.json" 2>/dev/null || echo "?")

  # 审查脚本进程状态
  local proc_status
  if pgrep -f "audit-sonnet-review" > /dev/null 2>&1; then
    proc_status="RUNNING"
  else
    proc_status="STOPPED"
  fi

  # 最新日志行
  local last_progress
  last_progress=$(grep "\[review\] 进度:" "$LOG" 2>/dev/null | tail -1 || echo "无")

  # 最新 batch 进度
  local last_batch
  last_batch=$(grep "\[batch-" "$LOG" 2>/dev/null | tail -1 || echo "无")

  # 写状态文件
  cat > "$STATUS_FILE" << EOF
===== 题库审查监控状态 =====
更新时间: $now
审查脚本: $proc_status
Batch 进度: $done_batches / $total_batches 完成 ($pending_batches 待处理)
最新进度: $last_progress
最新 batch: $last_batch
停止时间: ${STOP_HOUR}:00
日志文件: $LOG
=============================
EOF

  cat "$STATUS_FILE"
}

should_stop() {
  local hour
  hour=$(date '+%H')
  # 在 STOP_HOUR 到 21 之间停止（白天）
  if [ "$hour" -ge "$STOP_HOUR" ] && [ "$hour" -lt 23 ]; then
    return 0
  fi
  return 1
}

restart_review() {
  log "重启审查脚本..."
  nohup $REVIEW_CMD >> "$LOG" 2>&1 &
  local new_pid=$!
  log "审查脚本已启动 PID=$new_pid"
}

# ============ 主循环 ============

log "启动监控 (CHECK_INTERVAL=${CHECK_INTERVAL}s, STOP_HOUR=${STOP_HOUR})"
write_status

while true; do
  sleep "$CHECK_INTERVAL"

  # 时间检查
  if should_stop; then
    log "已过 ${STOP_HOUR}:00，停止监控"
    # 停掉审查脚本
    if pgrep -f "audit-sonnet-review" > /dev/null 2>&1; then
      log "停止审查脚本..."
      pkill -f "audit-sonnet-review" 2>/dev/null || true
    fi
    write_status
    log "监控结束"
    exit 0
  fi

  # 检查审查脚本是否存活
  if pgrep -f "audit-sonnet-review" > /dev/null 2>&1; then
    log "审查脚本运行中"
  else
    # 脚本不在了，检查是否还有 pending batch
    pending=$(jq '[.batches[] | select(.status == "pending")] | length' "$AUDIT_DIR/progress.json" 2>/dev/null || echo "0")
    if [ "$pending" -gt 0 ]; then
      log "审查脚本已停止，还有 $pending 个 pending batch，自动重启"
      restart_review
    else
      log "所有 batch 已完成，无需重启。监控结束。"
      write_status
      exit 0
    fi
  fi

  write_status
done
