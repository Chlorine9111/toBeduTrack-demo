"""
清理 legacy stimuli 表
1. 删除孤儿 stimuli（无 question 引用）
2. 合并重复 stimuli（相同 image_url），更新 question 的 stimulus_id 指向保留的那条

用法:
  python3 scripts/question-bank/legacy-python/cleanup_stimuli.py [--dry-run] [--execute]

注意:
  - 仅适用于 legacy `questions` / `stimuli` schema
  - 不适用于当前正式仓的 `exercises` 题库模型
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from collections import Counter

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


def sb_get_all(path):
    rows = []
    offset = 0
    while True:
        url = f"{SB_URL}{path}&limit=1000&offset={offset}"
        req = urllib.request.Request(url, headers={**SB_HEADERS, "Prefer": "count=exact"})
        with urllib.request.urlopen(req) as resp:
            batch = json.loads(resp.read())
            rows.extend(batch)
            if len(batch) < 1000:
                break
            offset += 1000
    return rows


def sb_delete(table, id_val):
    url = f"{SB_URL}/rest/v1/{table}?id=eq.{id_val}"
    req = urllib.request.Request(url, method="DELETE", headers=SB_HEADERS)
    with urllib.request.urlopen(req) as resp:
        return resp.status


def sb_patch(table, id_val, data):
    url = f"{SB_URL}/rest/v1/{table}?id=eq.{id_val}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers=SB_HEADERS)
    with urllib.request.urlopen(req) as resp:
        return resp.status


def main():
    dry_run = "--dry-run" in sys.argv
    execute = "--execute" in sys.argv

    if not dry_run and not execute:
        print("用法: python3 scripts/cleanup_stimuli.py [--dry-run] [--execute]")
        sys.exit(1)

    print("正在获取数据...")
    stimuli = sb_get_all("/rest/v1/stimuli?select=id,image_url,content_type,description")
    qs_with_stim = sb_get_all("/rest/v1/questions?select=id,stimulus_id&stimulus_id=not.is.null")
    ref_counts = Counter(q["stimulus_id"] for q in qs_with_stim)

    print(f"stimuli: {len(stimuli)}, questions with stimulus: {len(qs_with_stim)}")

    # === Part 1: 孤儿 stimuli ===
    orphans = [s for s in stimuli if ref_counts.get(s["id"], 0) == 0]
    print(f"\n--- 孤儿 stimuli（无引用）: {len(orphans)} ---")

    # === Part 2: 重复 stimuli（相同 image_url）===
    by_url = {}
    for s in stimuli:
        u = s.get("image_url") or ""
        if u:
            by_url.setdefault(u, []).append(s)
    dup_groups = {k: v for k, v in by_url.items() if len(v) > 1}

    # 合并计划：每组保留引用最多的，其余的 question 改指向保留的
    merge_plan = []  # [(keep_id, [(remove_id, [question_ids_to_update])])]
    for url_key, items in dup_groups.items():
        sorted_items = sorted(items, key=lambda s: ref_counts.get(s["id"], 0), reverse=True)
        keeper = sorted_items[0]
        removals = []
        for dup in sorted_items[1:]:
            affected_qs = [q["id"] for q in qs_with_stim if q["stimulus_id"] == dup["id"]]
            removals.append((dup["id"], affected_qs))
        merge_plan.append((keeper["id"], url_key, removals))

    total_merge_deletes = sum(len(removals) for _, _, removals in merge_plan)
    total_q_updates = sum(len(qs) for _, _, removals in merge_plan for _, qs in removals)

    print(f"--- 重复 stimuli 组: {len(dup_groups)}, 将合并删除: {total_merge_deletes}, 需更新 question: {total_q_updates} ---")

    if dry_run:
        print(f"\n=== DRY RUN ===")
        print(f"\n将删除 {len(orphans)} 个孤儿 stimuli")
        for s in orphans[:10]:
            print(f"  {s['id'][:12]}  type={s.get('content_type')}  desc={str(s.get('description',''))[:50]}")
        if len(orphans) > 10:
            print(f"  ... 及其余 {len(orphans) - 10} 个")

        print(f"\n将合并 {len(merge_plan)} 组重复 stimuli:")
        for keep_id, url_key, removals in merge_plan:
            print(f"  保留: {keep_id[:12]}  url: {url_key[:60]}...")
            for rem_id, qs in removals:
                print(f"    删除: {rem_id[:12]}  (需更新 {len(qs)} 个 question)")

        # 备份
        backup_path = f"/tmp/stimuli_cleanup_backup_{int(time.time())}.json"
        backup = {
            "orphans": orphans,
            "merge_plan": [
                {"keep": k, "url": u, "remove": [(r, qs) for r, qs in rems]}
                for k, u, rems in merge_plan
            ],
        }
        with open(backup_path, "w") as f:
            json.dump(backup, f, ensure_ascii=False, indent=2)
        print(f"\n备份: {backup_path}")
        print(f"\n确认后运行: python3 scripts/cleanup_stimuli.py --execute")
        return

    if execute:
        # 备份
        backup_path = f"/tmp/stimuli_cleanup_backup_{int(time.time())}.json"
        backup = {
            "orphans": orphans,
            "merge_plan": [
                {"keep": k, "url": u, "remove": [(r, qs) for r, qs in rems]}
                for k, u, rems in merge_plan
            ],
        }
        with open(backup_path, "w") as f:
            json.dump(backup, f, ensure_ascii=False, indent=2)
        print(f"备份: {backup_path}")

        # Part 2 先执行：合并重复（先更新 question 指向，再删除多余 stimuli）
        print(f"\n--- 合并重复 stimuli ---")
        for keep_id, url_key, removals in merge_plan:
            for rem_id, q_ids in removals:
                for qid in q_ids:
                    sb_patch("questions", qid, {"stimulus_id": keep_id})
                    print(f"  question {qid[:12]} stimulus_id → {keep_id[:12]}")
                sb_delete("stimuli", rem_id)
                print(f"  删除 stimuli {rem_id[:12]}")
        print(f"合并完成")

        # Part 1: 删除孤儿
        print(f"\n--- 删除 {len(orphans)} 个孤儿 stimuli ---")
        success = 0
        failed = 0
        for i, s in enumerate(orphans):
            try:
                sb_delete("stimuli", s["id"])
                success += 1
            except Exception as e:
                # 可能有外键约束（虽然不应该）
                failed += 1
                print(f"  ❌ {s['id'][:12]}: {e}")
            if (i + 1) % 20 == 0:
                print(f"  [{i+1}/{len(orphans)}] 成功 {success}, 失败 {failed}")

        print(f"\n{'='*80}")
        print(f"孤儿删除: 成功 {success}, 失败 {failed}")

        # 验证
        print("\n验证...")
        remaining_stimuli = sb_get_all("/rest/v1/stimuli?select=id")
        remaining_qs = sb_get_all("/rest/v1/questions?select=id,stimulus_id&stimulus_id=not.is.null")
        ref_counts2 = Counter(q["stimulus_id"] for q in remaining_qs)
        orphans2 = [s for s in remaining_stimuli if ref_counts2.get(s["id"], 0) == 0]

        print(f"stimuli 剩余: {len(remaining_stimuli)} (原 {len(stimuli)})")
        print(f"剩余孤儿: {len(orphans2)}")
        if len(orphans2) == 0:
            print("✅ 清理完成，无孤儿")
        else:
            print(f"⚠️  仍有 {len(orphans2)} 个孤儿")


if __name__ == "__main__":
    main()
