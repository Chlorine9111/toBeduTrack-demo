"""
legacy 题干图片引用修复脚本
用法: python3 scripts/question-bank/legacy-python/fix_stem_image_refs.py [--dry-run] [--course COURSE] [--limit N] [--verify]

问题描述:
  514 道题目的 stimulus 有 image_url，但 stem 中没有包含该图片的 Markdown 引用。
  图片只在材料(stimuli)中显示，题干(stem)中缺少。

修复逻辑:
  在 stem 开头插入 ![alt](image_url)，使题干自包含图片。
  幂等: 如果 stem 已包含该 image_url 则跳过。

注意:
  - 仅适用于 legacy `questions` / `stimuli` schema
  - 不适用于当前正式仓的 `exercises` 题库模型
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

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


# ── Supabase helpers ──────────────────────────────────────────────

def sb_get(path: str) -> list:
    resp = urllib.request.urlopen(
        urllib.request.Request(f"{SB_URL}{path}", headers=SB_HEADERS), timeout=30
    )
    return json.loads(resp.read())


def sb_patch(table: str, filter_str: str, data: dict):
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/{table}?{filter_str}",
        data=body,
        method="PATCH",
        headers={**SB_HEADERS, "Prefer": "return=minimal"},
    )
    urllib.request.urlopen(req, timeout=30)


def fetch_all(path: str, batch_size: int = 1000) -> list:
    """分页获取所有记录"""
    all_data = []
    offset = 0
    sep = "&" if "?" in path else "?"
    while True:
        batch = sb_get(f"{path}{sep}limit={batch_size}&offset={offset}")
        if not batch:
            break
        all_data.extend(batch)
        if len(batch) < batch_size:
            break
        offset += batch_size
    return all_data


# ── 核心逻辑 ──────────────────────────────────────────────────────

def build_alt_text(content_type: str | None, description: str | None) -> str:
    ct_label = content_type.replace("_", " ").title() if content_type else "Figure"
    desc_short = (description or "").strip()[:60]
    if desc_short:
        return f"{ct_label}: {desc_short}"
    return ct_label


def build_new_stem(original_stem: str, image_url: str, content_type: str | None, description: str | None) -> str:
    alt = build_alt_text(content_type, description)
    return f"![{alt}]({image_url})\n\n{original_stem}"


def discover_affected(course_filter: str | None = None) -> list[dict]:
    """找出所有需要修复的题目"""
    print("正在获取有 stimulus_id 的题目...")
    q_filter = "/rest/v1/questions?select=id,stem,stimulus_id,course&stimulus_id=not.is.null&order=id"
    if course_filter:
        q_filter += f"&course=eq.{course_filter}"
    questions = fetch_all(q_filter)
    print(f"  有 stimulus_id 的题目: {len(questions)}")

    print("正在获取有 image_url 的 stimuli...")
    stimuli = fetch_all(
        "/rest/v1/stimuli?select=id,content_type,description,image_url&image_url=not.is.null&order=id"
    )
    stimuli_map = {s["id"]: s for s in stimuli}
    print(f"  有 image_url 的 stimuli: {len(stimuli)}")

    affected = []
    skipped_no_url = 0
    skipped_already = 0

    for q in questions:
        sid = q["stimulus_id"]
        if sid not in stimuli_map:
            skipped_no_url += 1
            continue
        s = stimuli_map[sid]
        image_url = s.get("image_url", "")
        if not image_url:
            skipped_no_url += 1
            continue
        if image_url in q.get("stem", ""):
            skipped_already += 1
            continue
        affected.append({
            "question_id": q["id"],
            "course": q.get("course", ""),
            "stem": q["stem"],
            "stimulus_id": sid,
            "image_url": image_url,
            "content_type": s.get("content_type"),
            "description": s.get("description"),
        })

    print(f"\n=== 筛选结果 ===")
    print(f"  stimulus 无 image_url: {skipped_no_url}")
    print(f"  stem 已包含 image_url: {skipped_already}")
    print(f"  需要修复: {len(affected)}")
    return affected


def dry_run(affected: list[dict], limit: int | None = None):
    """预览模式: 打印变更但不写数据库"""
    items = affected[:limit] if limit else affected
    print(f"\n=== DRY RUN: 预览 {len(items)} / {len(affected)} 条变更 ===\n")
    for i, item in enumerate(items):
        alt = build_alt_text(item["content_type"], item["description"])
        print(f"[{i + 1}/{len(items)}] {item['course']} {item['question_id']}")
        print(f"  image_url: {item['image_url']}")
        print(f"  alt: {alt}")
        print(f"  stem 前80字: {item['stem'][:80]}")
        print()
    print(f"共 {len(affected)} 条需要修复。使用不带 --dry-run 的命令执行修复。")


def execute(affected: list[dict], limit: int | None = None):
    """执行修复: 更新数据库中的 stem"""
    items = affected[:limit] if limit else affected
    total = len(items)
    print(f"\n=== 执行修复: {total} 条 ===\n")

    # 备份
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"/tmp/stem_fix_backup_{timestamp}.json"
    backup = [{"question_id": it["question_id"], "original_stem": it["stem"]} for it in items]
    with open(backup_path, "w") as f:
        json.dump(backup, f, ensure_ascii=False)
    print(f"备份已保存: {backup_path}\n")

    success = 0
    errors = 0

    for i, item in enumerate(items):
        new_stem = build_new_stem(
            item["stem"], item["image_url"], item["content_type"], item["description"]
        )
        try:
            sb_patch("questions", f"id=eq.{item['question_id']}", {"stem": new_stem})
            success += 1
            print(f"[{i + 1}/{total}] {item['course']} {item['question_id']} → OK")
        except (urllib.error.HTTPError, urllib.error.URLError) as e:
            errors += 1
            err_msg = str(e)
            if hasattr(e, "read"):
                err_msg = e.read()[:200].decode(errors="replace")
            print(f"[{i + 1}/{total}] {item['course']} {item['question_id']} → ERROR: {err_msg}")

        if i < total - 1:
            time.sleep(0.1)

    print(f"\n=== 完成 ===")
    print(f"  成功: {success}")
    print(f"  失败: {errors}")
    print(f"  备份: {backup_path}")


def verify(affected: list[dict]):
    """验证模式: 重新查询并确认 stem 包含 image_url"""
    print(f"\n=== 验证 {len(affected)} 条修复结果 ===\n")

    # 分批查询（URL 长度限制，每批 50 个 ID）
    all_ids = [it["question_id"] for it in affected]
    id_to_url = {it["question_id"]: it["image_url"] for it in affected}
    passed = 0
    failed = 0

    for batch_start in range(0, len(all_ids), 50):
        batch_ids = all_ids[batch_start:batch_start + 50]
        ids_str = ",".join(f'"{qid}"' for qid in batch_ids)
        rows = sb_get(f"/rest/v1/questions?select=id,stem&id=in.({ids_str})")
        for row in rows:
            expected_url = id_to_url.get(row["id"], "")
            if expected_url and expected_url in row.get("stem", ""):
                passed += 1
            else:
                failed += 1
                print(f"  FAIL: {row['id']} — stem 不包含 {expected_url[:60]}...")

    print(f"\n=== 验证结果 ===")
    print(f"  通过: {passed}")
    print(f"  失败: {failed}")
    return failed == 0


# ── CLI ───────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    is_dry_run = "--dry-run" in args
    is_verify = "--verify" in args
    course = None
    limit = None

    for i, arg in enumerate(args):
        if arg == "--course" and i + 1 < len(args):
            course = args[i + 1]
        if arg == "--limit" and i + 1 < len(args):
            limit = int(args[i + 1])

    affected = discover_affected(course_filter=course)

    if not affected:
        print("\n没有需要修复的题目。")
        return

    if is_verify and not is_dry_run:
        verify(affected)
    elif is_dry_run:
        dry_run(affected, limit=limit)
    else:
        execute(affected, limit=limit)


if __name__ == "__main__":
    main()
