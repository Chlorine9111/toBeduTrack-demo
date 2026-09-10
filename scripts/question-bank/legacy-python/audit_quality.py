"""
legacy 题库质量审计脚本
用法: python3 scripts/question-bank/legacy-python/audit_quality.py [COURSE] [--fix-choices]

输出:
  - 各类质量问题统计
  - 分类 ID 列表（保存到 /tmp/audit_<course>.json）

问题分类:
  A: 元数据缺失（topic_code / explanation 空）
  B: choices 结构混乱（含纯字符串而非 {text,misconception}）
  C: 图片缺失（题干含图片关键词但无 stimulus_id）
  D: 残缺题目（stem < 30 字符 或 choices < 4 个）
  E: embedding 缺失（无法被向量搜索）

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

# 图片指示语关键词（题干含这些词说明题目依赖图片）
IMAGE_KEYWORDS = [
    "the following", "the figure", "the graph", "the table", "the diagram",
    "the chart", "shown below", "shown above", "figure above", "figure below",
    "graph above", "graph below", "table above", "table below",
    "the data", "the image", "the model", "the map",
    "以下", "如图", "图中", "表格", "上图", "下图",
]


def fetch_no_embedding_ids(course: str) -> set:
    """单独查无 embedding 的题目 ID（轻量查询）"""
    ids = set()
    offset = 0
    course_filter = f"&course=eq.{course}" if course != "ALL" else ""
    while True:
        url = (
            f"{SB_URL}/rest/v1/questions?select=id"
            f"{course_filter}&embedding_content=is.null"
            f"&limit=1000&offset={offset}"
        )
        try:
            resp = urllib.request.urlopen(
                urllib.request.Request(url, headers=SB_HEADERS), timeout=30, context=_CTX
            )
            batch = json.loads(resp.read())
        except Exception:
            break
        if not batch:
            break
        ids.update(r["id"] for r in batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return ids


def fetch_batch(course: str, offset: int, limit: int = 200) -> list:
    """拉取一批题目（不含 embedding 向量，避免超时）"""
    course_filter = f"&course=eq.{course}" if course != "ALL" else ""
    url = (
        f"{SB_URL}/rest/v1/questions"
        f"?select=id,course,stem,choices,correct_answer,topic_code,explanation,"
        f"stimulus_id,stimulus_dependent"
        f"{course_filter}"
        f"&order=id"
        f"&limit={limit}&offset={offset}"
    )
    for attempt in range(3):
        try:
            resp = urllib.request.urlopen(
                urllib.request.Request(url, headers=SB_HEADERS), timeout=30, context=_CTX
            )
            return json.loads(resp.read())
        except Exception as e:
            print(f"  [retry {attempt+1}] {e}")
            time.sleep(5 * (attempt + 1))
    return []


IMAGE_PLACEHOLDER_PATTERNS = [
    r'^\[图形\]$', r'^\[图表\]$', r'^\[图像\]$',
    r'^\[Graph\]$', r'^\[Figure\]$', r'^\[Diagram\]$',
    r'^\[Chart\]$', r'^\[Map\]$', r'^\[Table\]$',
    r'^graph$', r'^figure$', r'^diagram$',
]

VISUAL_CONTENT_TYPES = {'diagram', 'image', 'graph', 'chart', 'map',
                        'bar_chart', 'bar_and_line_graph', 'figure'}


def choices_has_missing_image(choices) -> bool:
    if not isinstance(choices, dict):
        return False
    for v in choices.values():
        if not isinstance(v, dict):
            continue
        text = (v.get("text") or "").strip()
        has_placeholder = any(re.match(p, text, re.I) for p in IMAGE_PLACEHOLDER_PATTERNS)
        if has_placeholder and not v.get("image_url"):
            return True
    return False


def fetch_stimuli_map() -> dict:
    """一次性拉取所有 stimuli，返回 {id: {image_url, content_type}}"""
    smap = {}
    offset = 0
    while True:
        url = f"{SB_URL}/rest/v1/stimuli?select=id,image_url,content_type&limit=1000&offset={offset}"
        try:
            resp = urllib.request.urlopen(
                urllib.request.Request(url, headers=SB_HEADERS), timeout=30, context=_CTX
            )
            rows = json.loads(resp.read())
        except Exception:
            break
        if not rows:
            break
        for r in rows:
            smap[r["id"]] = {"image_url": r.get("image_url"), "content_type": r.get("content_type")}
        if len(rows) < 1000:
            break
        offset += 1000
    return smap


def choices_has_text_issue(choices) -> bool:
    """检查 choices 是否包含纯字符串（非标准结构）"""
    if not isinstance(choices, dict):
        return True
    for v in choices.values():
        if isinstance(v, str):
            return True
        if isinstance(v, dict) and "text" not in v:
            return True
    return False


def stem_has_image_keyword(stem: str) -> bool:
    """检查题干是否含图片指示语"""
    s = stem.lower()
    return any(kw.lower() in s for kw in IMAGE_KEYWORDS)


def audit_course(course: str, stimuli_map: dict = None) -> dict:
    results = {
        "A_missing_metadata": [],   # topic_code 或 explanation 为空
        "B_choices_structure": [],  # choices 结构不统一
        "C_missing_image": [],      # 含图片关键词但无 stimulus_id
        "D_truncated": [],          # 残缺题目
        "E_no_embedding": [],       # 无 embedding
        "F_choice_placeholder_no_url": [],  # 选项有图片占位符但无 image_url
        "G_stimulus_no_image": [],  # 关联 visual stimulus 但无图片
        "total": 0,
    }
    if stimuli_map is None:
        stimuli_map = {}

    # 预拉取无 embedding 的 ID 集合（轻量查询）
    print(f"  [预查] 拉取无 embedding 的 ID...")
    no_embed_ids = fetch_no_embedding_ids(course)
    print(f"  [预查] 无 embedding: {len(no_embed_ids)} 道")

    offset = 0
    batch_size = 200
    while True:
        batch = fetch_batch(course, offset, batch_size)
        if not batch:
            break

        for q in batch:
            qid = q["id"]
            results["total"] += 1
            stem = q.get("stem") or ""
            choices = q.get("choices") or {}
            tc = q.get("topic_code") or ""
            exp = q.get("explanation") or ""

            # A: 元数据缺失
            needs_topic = not tc or not re.match(r'^[A-Z]{2,}', tc)
            needs_exp = not exp.strip()
            if needs_topic or needs_exp:
                results["A_missing_metadata"].append(qid)

            # B: choices 结构问题
            if choices_has_text_issue(choices):
                results["B_choices_structure"].append(qid)

            # C: 图片缺失（含关键词但无 stimulus_id）
            if stem_has_image_keyword(stem) and not q.get("stimulus_id"):
                results["C_missing_image"].append(qid)

            # D: 残缺题目
            stem_too_short = len(stem.strip()) < 30
            choices_too_few = len(choices) < 4 if isinstance(choices, dict) else True
            if stem_too_short or choices_too_few:
                results["D_truncated"].append(qid)

            # E: 无 embedding（基于预查结果）
            if qid in no_embed_ids:
                results["E_no_embedding"].append(qid)

            # F: 选项有图片占位符但无 image_url
            if choices_has_missing_image(choices):
                results["F_choice_placeholder_no_url"].append(qid)

            # G: 关联 visual stimulus 但 stimulus 无图片
            sid = q.get("stimulus_id")
            if sid and stimuli_map:
                s = stimuli_map.get(sid)
                if s and s.get("content_type") in VISUAL_CONTENT_TYPES and not s.get("image_url"):
                    results["G_stimulus_no_image"].append(qid)

        print(f"  已审计: {results['total']} 题 (offset={offset})")
        if len(batch) < batch_size:
            break
        offset += batch_size
        time.sleep(0.3)

    return results


def print_report(course: str, r: dict):
    total = r["total"]
    print(f"\n{'='*60}")
    print(f"课程: {course}  总题数: {total}")
    print(f"{'='*60}")
    cats = [
        ("A 元数据缺失  ", "A_missing_metadata"),
        ("B choices结构  ", "B_choices_structure"),
        ("C 图片缺失    ", "C_missing_image"),
        ("D 残缺题目    ", "D_truncated"),
        ("E 无embedding  ", "E_no_embedding"),
        ("F 占位符无图片", "F_choice_placeholder_no_url"),
        ("G stimulus无图", "G_stimulus_no_image"),
    ]
    for label, key in cats:
        n = len(r[key])
        pct = f"{n/total*100:.1f}%" if total else "0%"
        bar = "█" * min(int(n / max(total, 1) * 40), 40)
        print(f"  {label}: {n:4d} ({pct:5s}) {bar}")
    print()

    # 问题最严重的前 5 题
    for label, key in cats:
        ids = r[key][:5]
        if ids:
            print(f"  {label} 示例 ID: {', '.join(ids)}")


def main():
    args = sys.argv[1:]
    course = "ALL"
    fix_choices = False

    for a in args:
        if a == "--fix-choices":
            fix_choices = True
        elif not a.startswith("--"):
            course = a.upper()

    # 支持 --courses APES,AP_BIO 逗号分隔
    specified_courses = None
    for i, a in enumerate(args):
        if a == "--courses" and i + 1 < len(args):
            specified_courses = [c.strip().upper() for c in args[i + 1].split(",")]

    print(f"[质检] 课程={course}")

    if specified_courses:
        courses = specified_courses
    elif course == "ALL":
        courses = ["AP_CSP", "AP_CALC_AB", "AP_CALC_BC", "AP_MACRO",
                   "AP_BIO", "AP_PRECALC", "AP_CHEM", "AP_STATS",
                   "APES", "AP_CSA", "AP_MICRO",
                   "AP_PHYSICS_1", "AP_PHYSICS_2", "AP_PHYSICS_C_MECH", "AP_PHYSICS_C_EM"]
    else:
        courses = [course]

    # 预加载 stimuli 映射
    print("[加载 stimuli 表...]")
    stimuli_map = fetch_stimuli_map()
    print(f"  stimuli 加载完毕: {len(stimuli_map)} 条")

    all_results = {}
    for c in courses:
        print(f"\n[{c}] 开始审计...")
        r = audit_course(c, stimuli_map)
        all_results[c] = r
        print_report(c, r)

    # 保存 JSON 报告（非默认库时加 target_ 前缀）
    prefix = "target_" if os.environ.get("SB_URL") else ""
    out_path = f"/tmp/audit_{prefix}{course.lower()}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"\n详细报告已保存至: {out_path}")

    # 汇总
    if len(courses) > 1:
        print(f"\n{'='*60}")
        print("汇总（跨课程）")
        print(f"{'='*60}")
        total_qs = sum(r["total"] for r in all_results.values())
        for key, label in [
            ("A_missing_metadata", "A 元数据缺失"),
            ("B_choices_structure", "B choices结构"),
            ("C_missing_image", "C 图片缺失"),
            ("D_truncated", "D 残缺题目"),
            ("E_no_embedding", "E 无embedding"),
            ("F_choice_placeholder_no_url", "F 占位符无图片"),
            ("G_stimulus_no_image", "G stimulus无图"),
        ]:
            n = sum(len(r[key]) for r in all_results.values())
            pct = f"{n/total_qs*100:.1f}%" if total_qs else "0%"
            print(f"  {label}: {n} ({pct})")
        print(f"  总题数: {total_qs}")


if __name__ == "__main__":
    main()
