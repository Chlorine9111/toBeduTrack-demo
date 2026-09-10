"""
legacy 题库去重脚本
用法: python3 scripts/question-bank/legacy-python/dedup_target.py [--dry-run] [--execute]

策略:
- 按 normalized stem (去除注入图片前缀) + correct_answer + course 分组
- 每组保留"数据最全"的一条，删除其余
- 评分: stimulus_id +10, topic_code +10, explanation +5, key_concepts +3,
        embedding +2, choices 选项数, created_at 越早 tiebreak

注意:
  - 仅适用于 legacy `questions` / `stimuli` schema
  - 不适用于当前正式仓的 `exercises` 题库模型
"""

import json
import os
import re
import ssl
import sys
import time
import urllib.request
import urllib.error
from collections import defaultdict
from datetime import datetime
from pathlib import Path

_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE

SB_URL = os.environ.get("LEGACY_QB_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
SB_KEY = os.environ.get("LEGACY_QB_SERVICE_ROLE_KEY") or os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    "",
)

if not SB_URL or not SB_KEY:
    print(
        "需要设置 LEGACY_QB_SUPABASE_URL 和 LEGACY_QB_SERVICE_ROLE_KEY "
        "(或兼容的 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)。"
    )
    sys.exit(1)

SB_HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
}

LOG_PATH = Path(
    os.environ.get("LEGACY_QB_LOG_PATH", "/tmp/dedup_target_dryrun.log")
)
_log_lines = []


def log(msg):
    """同时输出到控制台和日志缓冲"""
    print(msg)
    _log_lines.append(msg)


def flush_log():
    """将日志写入文件"""
    with LOG_PATH.open("w", encoding="utf-8") as f:
        f.write("\n".join(_log_lines) + "\n")
    print(f"\n日志已保存到: {LOG_PATH}")


def sb_get(path):
    """分页拉取 Supabase REST 数据，带重试和自动降速"""
    all_rows = []
    offset = 0
    limit = 100
    while True:
        retries = 0
        cur_limit = limit
        while retries < 6:
            try:
                sep = "&" if "?" in path else "?"
                retry_url = f"{SB_URL}{path}{sep}limit={cur_limit}&offset={offset}"
                retry_req = urllib.request.Request(retry_url, headers=SB_HEADERS)
                with urllib.request.urlopen(retry_req, context=_CTX) as resp:
                    rows = json.loads(resp.read())
                    all_rows.extend(rows)
                    if (offset // cur_limit) % 20 == 0 or len(rows) < cur_limit:
                        log(f"  GET offset={offset} limit={cur_limit} -> {len(rows)} rows (total: {len(all_rows)})")
                    if len(rows) < cur_limit:
                        return all_rows
                    offset += cur_limit
                    time.sleep(0.3)
                    break
            except urllib.error.HTTPError as e:
                if e.code == 500 and cur_limit > 10:
                    cur_limit = max(cur_limit // 2, 10)
                    retries += 1
                    wait = retries * 2
                    log(f"  500 at offset={offset}, retry {retries}/6 with limit={cur_limit}, wait {wait}s...")
                    time.sleep(wait)
                elif e.code == 500:
                    retries += 1
                    wait = retries * 3
                    log(f"  500 at offset={offset}, limit={cur_limit}, retry {retries}/6, wait {wait}s...")
                    time.sleep(wait)
                else:
                    raise
        else:
            raise RuntimeError(f"Supabase 持续返回 500 at offset={offset}, limit={cur_limit}")
    return all_rows


def sb_delete(table, id_val):
    """删除单条记录"""
    url = f"{SB_URL}/rest/v1/{table}?id=eq.{id_val}"
    req = urllib.request.Request(url, method="DELETE", headers=SB_HEADERS)
    with urllib.request.urlopen(req, context=_CTX) as resp:
        return resp.status


def strip_injected_image(stem):
    """去除注入的图片前缀"""
    return re.sub(r'^!\[[^\]]*\]\([^)]+\)\n\n', '', stem or '')


def score_question(q):
    """评分函数：分数越高越应该保留"""
    score = 0
    # stimulus_id 有值 +10
    if q.get("stimulus_id"):
        score += 10
    # topic_code 非空 +10
    if q.get("topic_code"):
        score += 10
    # explanation 非空 +5
    if q.get("explanation"):
        score += 5
    # key_concepts 非空 +3
    kc = q.get("key_concepts")
    if kc and (isinstance(kc, list) and len(kc) > 0 or isinstance(kc, str) and kc.strip()):
        score += 3
    # embedding 有 +2
    if q.get("has_embedding"):
        score += 2
    # choices 选项数
    choices = q.get("choices") or {}
    if isinstance(choices, dict):
        score += len(choices)
    elif isinstance(choices, list):
        score += len(choices)
    # created_at 越早 tiebreak（越早越好）
    try:
        created = q.get("created_at", "")
        if created:
            dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            # 越早的 timestamp 越小，取反后越大
            score += 1.0 / (1 + (dt.timestamp() / 1e12))
    except Exception:
        pass
    return score


def main():
    dry_run = "--dry-run" in sys.argv
    execute = "--execute" in sys.argv

    if not dry_run and not execute:
        print("用法: python3 scripts/dedup_target.py [--dry-run] [--execute]")
        print("  --dry-run  预览将要删除的题目")
        print("  --execute  实际执行删除")
        sys.exit(1)

    log(f"目标库: {SB_URL}")
    log(f"模式: {'DRY-RUN (预览)' if dry_run else 'EXECUTE (实际删除)'}")
    log(f"时间: {datetime.now().isoformat()}")
    log("=" * 80)

    # 1. 拉取所有题目
    log("\n正在获取所有题目...")
    questions = sb_get(
        "/rest/v1/questions?select=id,stem,course,correct_answer,choices,"
        "topic_code,explanation,key_concepts,stimulus_id,"
        "created_at,source_assessment&order=id"
    )
    log(f"共获取 {len(questions)} 道题目")

    # 2. 单独查 embedding_content 非空的 id（避免拉大文本）
    log("\n正在查询 embedding 状态...")
    ids_with_embedding = set()
    try:
        embedding_rows = sb_get(
            "/rest/v1/questions?select=id&embedding_content=not.is.null&order=id"
        )
        ids_with_embedding = {r["id"] for r in embedding_rows}
        log(f"有 embedding 的题目: {len(ids_with_embedding)} 道")
    except Exception as e:
        log(f"查询 embedding 状态失败: {e}，跳过 embedding 评分")

    for q in questions:
        q["has_embedding"] = q["id"] in ids_with_embedding

    # 3. 按 (normalized_stem, course, correct_answer) 三元组分组
    groups = defaultdict(list)
    empty_stem_count = 0
    unique_stems = set()
    for q in questions:
        normalized = strip_injected_image(q.get("stem", ""))
        if normalized.strip():
            unique_stems.add(normalized)
            key = (normalized, q.get("course", ""), q.get("correct_answer", ""))
            groups[key].append(q)
        else:
            empty_stem_count += 1

    log(f"\n唯一 stem 数量: {len(unique_stems)}")
    log(f"唯一 (stem, course, answer) 三元组: {len(groups)}")
    log(f"空 stem 题目: {empty_stem_count}")

    # 只保留有重复的组（stem + course + answer 完全一致且数量 > 1）
    safe_groups = {k: v for k, v in groups.items() if len(v) > 1}
    log(f"完全重复组 (stem + course + answer 相同, 数量>1): {len(safe_groups)}")

    # 4. 计算要删除的题目
    to_delete_ids = []
    to_keep_ids = []

    for group_key, items in safe_groups.items():
        scored = sorted(items, key=lambda q: score_question(q), reverse=True)
        keeper = scored[0]
        to_keep_ids.append(keeper["id"])
        for dup in scored[1:]:
            to_delete_ids.append({
                "id": dup["id"],
                "course": dup.get("course"),
                "stem_preview": strip_injected_image(dup.get("stem", ""))[:80],
                "source": dup.get("source_assessment", "")[:50] if dup.get("source_assessment") else "",
                "kept_id": keeper["id"],
                "score_kept": score_question(keeper),
                "score_dup": score_question(dup),
            })

    log(f"\n{'=' * 80}")
    log(f"完全重复组: {len(safe_groups)} 组")
    log(f"将保留: {len(to_keep_ids)} 道 (每组最优)")
    log(f"将删除: {len(to_delete_ids)} 道")
    log(f"删除后预计总题数: {len(questions) - len(to_delete_ids)}")
    log(f"{'=' * 80}")

    # 按课程统计
    course_counts = defaultdict(int)
    for d in to_delete_ids:
        course_counts[d["course"] or "(无课程)"] += 1
    log("\n按课程统计将删除数量:")
    for course, count in sorted(course_counts.items(), key=lambda x: -x[1]):
        log(f"  {course}: {count}")

    # 重复组大小分布
    group_sizes = defaultdict(int)
    for items in safe_groups.values():
        group_sizes[len(items)] += 1
    log("\n重复组大小分布 (同组内题目数):")
    for size, count in sorted(group_sizes.items()):
        log(f"  {size} 条重复: {count} 组 (每组删 {size - 1} 条)")

    if dry_run:
        log(f"\n预览前 30 条将删除的题目:")
        for i, d in enumerate(to_delete_ids[:30]):
            log(f"  [{i+1}] {d['course']} id={d['id'][:12]}... "
                f"(score={d['score_dup']:.1f}) -> 保留 {d['kept_id'][:12]}... "
                f"(score={d['score_kept']:.1f})")
            log(f"       stem: {d['stem_preview']}...")
            if d['source']:
                log(f"       source: {d['source']}")

        # 保存备份
        backup_path = f"/tmp/dedup_target_backup_{int(time.time())}.json"
        delete_id_set = {d["id"] for d in to_delete_ids}
        backup_data = [q for q in questions if q["id"] in delete_id_set]
        with open(backup_path, "w", encoding="utf-8") as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2)
        log(f"\n备份已保存到: {backup_path}")
        log(f"备份包含 {len(backup_data)} 道将被删除的题目完整数据")
        log(f"\n确认无误后运行: python3 scripts/dedup_target.py --execute")

        flush_log()
        return

    if execute:
        # 先备份
        backup_path = f"/tmp/dedup_target_backup_{int(time.time())}.json"
        delete_id_set = {d["id"] for d in to_delete_ids}
        backup_data = [q for q in questions if q["id"] in delete_id_set]
        with open(backup_path, "w", encoding="utf-8") as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2)
        log(f"\n备份已保存到: {backup_path}")

        if len(to_delete_ids) == 0:
            log("\n没有需要删除的重复题目。")
            flush_log()
            return

        log(f"\n开始删除 {len(to_delete_ids)} 道重复题目...\n")
        success = 0
        failed = 0
        for i, d in enumerate(to_delete_ids):
            try:
                status = sb_delete("questions", d["id"])
                success += 1
                if (i + 1) % 50 == 0 or i == len(to_delete_ids) - 1:
                    log(f"  [{i+1}/{len(to_delete_ids)}] 已删除 {success} 条，失败 {failed} 条")
            except Exception as e:
                failed += 1
                log(f"  删除失败 id={d['id']}: {e}")
            # 限流
            if (i + 1) % 100 == 0:
                time.sleep(0.5)

        log(f"\n{'=' * 80}")
        log(f"完成! 删除 {success} 条，失败 {failed} 条")
        log(f"备份位置: {backup_path}")

        # 验证
        log("\n正在验证...")
        remaining = sb_get("/rest/v1/questions?select=id&order=id")
        log(f"数据库剩余题目: {len(remaining)}")
        log(f"预期: {len(questions) - success}")
        if len(remaining) == len(questions) - success:
            log("验证通过")
        else:
            log("数量不匹配，请检查")

        flush_log()


if __name__ == "__main__":
    main()
