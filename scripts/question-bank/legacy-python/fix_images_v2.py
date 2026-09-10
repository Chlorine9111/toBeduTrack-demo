"""
legacy 图片修复 v2 — 直接用 PyMuPDF 提取嵌入图片，无需外部 Vision API
修复两类问题：
  1. stimulus_dependent=true 但 stimulus_id=null 的题目
  2. stimuli 表有记录但 image_url=null

用法:
  python3 scripts/question-bank/legacy-python/fix_images_v2.py [COURSE] [--dry-run] [--limit N] [--mode stimuli|questions|both]

注意:
  - 仅适用于 legacy `questions` / `stimuli` schema
  - 不适用于当前正式仓的 `exercises` 题库模型
"""

import base64
import json
import os
import re
import ssl
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

try:
    import fitz
except ImportError:
    print("需要 PyMuPDF: pip install PyMuPDF")
    sys.exit(1)

_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE

SB_URL = os.environ.get("LEGACY_QB_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
SB_KEY = os.environ.get("LEGACY_QB_SERVICE_ROLE_KEY") or os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    "",
)
STORAGE_BUCKET = os.environ.get("LEGACY_QB_STORAGE_BUCKET", "question-assets")

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

CB_DIR = os.environ.get(
    "LEGACY_QB_CB_DIR",
    str(Path(__file__).resolve().parents[3] / "CB"),
)

COURSE_MAP = {
    "APES":              "01环境科学CB官方题库",
    "AP_CSA":            "03AP CSA",
    "AP_MICRO":          "04AP Micro微观 CB官方题库",
    "AP_CHEM":           "05AP 化学",
    "AP_CSP":            "06AP 计算机CSP",
    "AP_STATS":          "07AP 统计 CB官方题库",
    "AP_PHYSICS_C_EM":   "08AP 物理C电磁学",
    "AP_PHYSICS_1":      "09AP物理1   CB官方题库",
    "AP_PHYSICS_2":      "10AP  物理2 CB官方题库",
    "AP_CALC_AB":        "11AP微积分AB CB官方题库",
    "AP_CALC_BC":        "12AP微积分BC CB官方题库",
    "AP_MACRO":          "13宏观  题库",
    "AP_BIO":            "15生物",
    "AP_PRECALC":        "16微积分预备",
    "AP_PHYSICS_C_MECH": "17物理C力学2025CB题库",
}

# ============================================
# Supabase helpers
# ============================================

def sb_get(path):
    req = urllib.request.Request(f"{SB_URL}{path}", headers=SB_HEADERS)
    resp = urllib.request.urlopen(req, timeout=30, context=_CTX)
    return json.loads(resp.read())


def sb_post(table, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/{table}", data=body,
        headers={**SB_HEADERS, "Prefer": "return=representation"},
    )
    try:
        resp = urllib.request.urlopen(req, timeout=30, context=_CTX)
        result = json.loads(resp.read())
        return result[0] if isinstance(result, list) and result else None
    except urllib.error.HTTPError as e:
        print(f"  [POST {table} ERR {e.code}] {e.read()[:100]}")
        return None


def sb_patch(table, filter_str, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/{table}?{filter_str}", data=body, method="PATCH",
        headers={**SB_HEADERS, "Prefer": "return=minimal"},
    )
    urllib.request.urlopen(req, timeout=30, context=_CTX)


# ============================================
# PDF helpers
# ============================================

# PDF 索引缓存
_PDF_INDEX = {}

def _build_pdf_index():
    """构建课程→PDF列表的全局索引"""
    if _PDF_INDEX:
        return
    for course_code, folder in COURSE_MAP.items():
        base_dir = os.path.join(CB_DIR, folder)
        if not os.path.isdir(base_dir):
            continue
        pdfs = []
        for root, _, files in os.walk(base_dir):
            for f in files:
                if f.lower().endswith(".pdf"):
                    pdfs.append({"name": f, "path": os.path.join(root, f), "dir": root})
        _PDF_INDEX[course_code] = pdfs


def find_pdf(course, source_assessment):
    """通过 source_assessment 找到 PDF 文件（多策略匹配）"""
    _build_pdf_index()
    pdfs = _PDF_INDEX.get(course, [])
    if not pdfs:
        return None

    sa = source_assessment or ""
    sa_lower = sa.lower()

    # 策略 1: 直接提取 .pdf 文件名
    match = re.search(r'([^\\/\s]+\.pdf)$', sa, re.IGNORECASE)
    if match:
        pdf_name = match.group(1).lower()
        # 精确匹配
        for p in pdfs:
            if p["name"].lower() == pdf_name:
                return p["path"]
        # 模糊匹配（文件名包含）
        core = pdf_name.replace(".pdf", "")
        for p in pdfs:
            if core in p["name"].lower():
                return p["path"]

    # 策略 2: TB_ 前缀匹配
    match2 = re.search(r'(TB_[^\s.]+)', sa, re.IGNORECASE)
    if match2:
        tb_name = match2.group(1).lower()
        for p in pdfs:
            if tb_name in p["name"].lower():
                return p["path"]
        # 更宽松: TB_ 后的核心部分
        core2 = tb_name.replace("tb_", "")
        if len(core2) >= 3:
            for p in pdfs:
                pn = p["name"].lower()
                if pn.startswith("tb_") and core2 in pn:
                    return p["path"]

    def _has_unit(pd, un):
        return f"u{un}" in pd or f"unit{un}" in pd or f"unit {un}" in pd or f"unit_{un}" in pd

    def _is_answer(pn):
        return "答案" in pn or "answer" in pn or pn.startswith("sg_") or "scoring" in pn

    # 策略 3: "AP [Subject] Unit N Question Bank MCQ" 格式
    match3 = re.search(r'unit\s*(\d+)\s*question\s*bank\s*mcq', sa_lower)
    if match3:
        unit_num = match3.group(1)
        # 找对应 unit 目录下的 TB_ PDF（排除答案）
        for p in pdfs:
            pn = p["name"].lower()
            pd = p["dir"].lower()
            if _has_unit(pd, unit_num) and pn.startswith("tb_") and not _is_answer(pn):
                return p["path"]
        # 宽松: 只要路径含 unit 号，排除答案
        for p in pdfs:
            pd = p["dir"].lower()
            pn = p["name"].lower()
            if _has_unit(pd, unit_num) and not _is_answer(pn):
                if "mcq" in pn or "题目" in pn or pn.startswith("tb_"):
                    return p["path"]

    # 策略 4: "Unit N [topic].pdf" 格式
    match4 = re.search(r'unit\s*(\d+)\s+(.+)', sa_lower)
    if match4:
        unit_num = match4.group(1)
        topic = match4.group(2).replace(".pdf", "").strip()
        # 优先找包含 topic 关键词的
        for p in pdfs:
            pn = p["name"].lower().replace(".pdf", "")
            pd = p["dir"].lower()
            has_unit = f"u{unit_num}" in pd or f"unit{unit_num}" in pd or f"unit {unit_num}" in pd
            # topic 中的第一个有效词
            topic_words = [w for w in re.split(r'[_\s&]+', topic) if len(w) >= 3 and w not in ('the', 'and', 'mcq')]
            if has_unit and topic_words and any(tw in pn for tw in topic_words[:2]):
                return p["path"]
        # 只要 unit 目录对就行
        for p in pdfs:
            pd = p["dir"].lower()
            pn = p["name"].lower()
            if (f"u{unit_num}" in pd or f"unit{unit_num}" in pd or f"unit {unit_num}" in pd):
                if "答案" not in pn and "answer" not in pn and "sg_" not in pn:
                    return p["path"]

    # 策略 4b: "[Subject] Unit N[-M[-O]] Question Bank MCQ" — test booklet / range 格式
    match3b = re.search(r'unit\s*([\d]+(?:\s*[-–]\s*\d+)*)\s*question\s*bank', sa_lower)
    if match3b:
        unit_range_str = match3b.group(1)
        unit_nums = re.findall(r'\d+', unit_range_str)
        first_unit = unit_nums[0]
        # APES 用 "test booklet-unit N.pdf"
        for p in pdfs:
            pn = p["name"].lower()
            if f"test booklet-unit {first_unit}" in pn or f"test booklet-unit{first_unit}" in pn:
                if "(1)" not in pn:
                    return p["path"]
        # AP_STATS 用 "TB_NMO_题目.pdf" (如 Unit 5-6 → TB_567, Unit 7-8-9 → TB_789)
        if len(unit_nums) > 1:
            combined = "".join(unit_nums)
            for p in pdfs:
                pn = p["name"].lower()
                if _is_answer(pn):
                    continue
                if combined in pn and ("题目" in pn or pn.startswith("tb_")):
                    return p["path"]
            # 也尝试用 range 方式（5-6 → 56, 7-9 → 789）
            range_combined = "".join(str(u) for u in range(int(unit_nums[0]), int(unit_nums[-1])+1))
            if range_combined != combined:
                for p in pdfs:
                    pn = p["name"].lower()
                    if _is_answer(pn):
                        continue
                    if range_combined in pn and ("题目" in pn or pn.startswith("tb_")):
                        return p["path"]

    # 策略 5: 关键词搜索
    # 提取 source_assessment 中有意义的词
    keywords = [w.lower() for w in re.split(r'[\s_./\\]+', sa) if len(w) >= 3 and w.lower() not in ('unit', 'the', 'and', 'mcq', 'pdf', 'question', 'bank')]
    if keywords:
        best_match = None
        best_score = 0
        for p in pdfs:
            pn = p["name"].lower()
            if "答案" in pn or "answer" in pn or pn.startswith("sg_"):
                continue
            score = sum(1 for kw in keywords if kw in pn)
            if score > best_score:
                best_score = score
                best_match = p["path"]
        if best_match and best_score >= 1:
            return best_match

    return None


def extract_page_images(pdf_path, page_num, min_size=2000):
    """从 PDF 页面提取嵌入图片，返回按大小排序的列表"""
    doc = fitz.open(pdf_path)
    if page_num >= len(doc):
        page_num = len(doc) - 1
    if page_num < 0:
        page_num = 0

    page = doc[page_num]
    images = []
    seen_xrefs = set()

    for img_info in page.get_images(full=True):
        xref = img_info[0]
        if xref in seen_xrefs:
            continue
        seen_xrefs.add(xref)

        try:
            base_image = doc.extract_image(xref)
            if not base_image:
                continue
            img_bytes = base_image["image"]
            if len(img_bytes) < min_size:
                continue
            images.append({
                "bytes": img_bytes,
                "width": base_image["width"],
                "height": base_image["height"],
                "ext": base_image["ext"],
                "size": len(img_bytes),
            })
        except Exception:
            continue

    doc.close()
    return sorted(images, key=lambda x: x["size"], reverse=True)


def extract_nearby_images(pdf_path, page_num, search_range=3, min_size=2000):
    """搜索附近几页找到最大的嵌入图片"""
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    doc.close()

    best_images = []
    for offset in range(search_range):
        for p in [page_num - offset, page_num + offset]:
            if p < 0 or p >= total_pages:
                continue
            imgs = extract_page_images(pdf_path, p, min_size)
            for img in imgs:
                img["page"] = p
            best_images.extend(imgs)

    # 去重（同一图片可能在多页出现）
    seen = set()
    unique = []
    for img in best_images:
        key = (img["width"], img["height"], img["size"])
        if key not in seen:
            seen.add(key)
            unique.append(img)

    return sorted(unique, key=lambda x: x["size"], reverse=True)


def render_page_region(pdf_path, page_num, dpi=150):
    """渲染整页为 PNG bytes（fallback 当无嵌入图片时）"""
    doc = fitz.open(pdf_path)
    if page_num >= len(doc):
        page_num = len(doc) - 1
    scale = dpi / 72
    pix = doc[page_num].get_pixmap(matrix=fitz.Matrix(scale, scale))
    doc.close()
    return pix.tobytes("png")


def upload_image(img_bytes, course, question_id, ext="png"):
    """上传图片到 Supabase Storage"""
    content_type = f"image/{ext}" if ext in ("png", "jpeg", "jpg") else "image/png"
    path = f"stimuli/{course}/{question_id}.{ext}"
    url = f"{SB_URL}/storage/v1/object/{STORAGE_BUCKET}/{path}"
    req = urllib.request.Request(
        url, data=img_bytes, method="POST",
        headers={
            "apikey": SB_KEY,
            "Authorization": f"Bearer {SB_KEY}",
            "Content-Type": content_type,
            "x-upsert": "true",
        },
    )
    try:
        urllib.request.urlopen(req, timeout=30, context=_CTX)
        return f"{SB_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{path}"
    except urllib.error.HTTPError as e:
        print(f"  [Storage ERR {e.code}] {e.read()[:80]}")
        return None


def estimate_page(question_number, total_pages):
    """估算题号所在页 — 根据 PDF 页数自适应"""
    if total_pages <= 0:
        return 0
    if question_number is None or question_number <= 0:
        return 0
    # 假设第一页和最后几页可能是说明/答案
    effective_pages = max(1, total_pages - 2)
    # 需要估算总题数：经验值 ~2 题/页（物理/化学），~3 题/页（经济/计算机）
    est_total_questions = effective_pages * 2.5
    if est_total_questions < question_number:
        # 题号超出估算，按比例缩放
        ratio = (question_number - 1) / max(question_number, 1)
        estimated = int(ratio * effective_pages)
    else:
        estimated = max(0, int((question_number - 1) / 2.5))
    return min(estimated, total_pages - 1)


# ============================================
# Mode 1: 修复 stimulus_dependent 但无 stimulus_id 的题目
# ============================================

def fetch_questions_missing_stimulus(course, limit=500):
    """拉取 stimulus_dependent=true 但无 stimulus_id 的题目"""
    questions = []
    offset = 0
    batch = 100
    course_filter = f"&course=eq.{course}" if course != "ALL" else ""

    while len(questions) < limit:
        url = (
            f"{SB_URL}/rest/v1/questions"
            f"?select=id,course,stem,question_number,source_assessment"
            f"&stimulus_id=is.null&stimulus_dependent=eq.true"
            f"{course_filter}"
            f"&order=id&limit={batch}&offset={offset}"
        )
        try:
            req = urllib.request.Request(url, headers=SB_HEADERS)
            resp = urllib.request.urlopen(req, timeout=30, context=_CTX)
            data = json.loads(resp.read())
        except Exception as e:
            print(f"  [fetch ERR] {e}")
            break

        questions.extend(data)
        if len(data) < batch:
            break
        offset += batch
        time.sleep(0.2)

    return questions[:limit]


def process_question(q, dry_run=False):
    """处理单题：提取图片 → 上传 → 创建 stimulus → 关联"""
    qid = q["id"]
    course = q["course"]
    qnum = q.get("question_number", 1)
    source = q.get("source_assessment", "")

    pdf_path = find_pdf(course, source)
    if not pdf_path:
        print(f"  [{qid[:8]}] 找不到 PDF: {source}")
        return False

    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    doc.close()

    page_num = estimate_page(qnum, total_pages)

    # 提取嵌入图片
    images = extract_nearby_images(pdf_path, page_num, search_range=3)
    if not images:
        # fallback：渲染整页
        try:
            page_bytes = render_page_region(pdf_path, page_num)
            images = [{"bytes": page_bytes, "width": 0, "height": 0, "ext": "png", "size": len(page_bytes), "page": page_num}]
        except Exception:
            pass

    if not images:
        print(f"  [{qid[:8]}] Q{qnum} 无可用图片")
        return False

    best_img = images[0]
    print(f"  [{qid[:8]}] Q{qnum} 找到图片 {best_img['width']}x{best_img['height']} ({best_img['size']} bytes) from page {best_img.get('page', '?')}")

    if dry_run:
        return True

    # 上传
    img_url = upload_image(best_img["bytes"], course, qid, best_img.get("ext", "png"))
    if not img_url:
        return False

    # 推断 content_type
    content_type = "diagram"
    stem_lower = (q.get("stem") or "").lower()
    if any(kw in stem_lower for kw in ["graph", "plot", "chart"]):
        content_type = "graph"
    elif any(kw in stem_lower for kw in ["table", "data"]):
        content_type = "data_table"
    elif any(kw in stem_lower for kw in ["circuit", "resistor"]):
        content_type = "diagram"

    # 创建 stimulus
    stim = sb_post("stimuli", {
        "content_type": content_type,
        "image_url": img_url,
        "description": f"Extracted from {os.path.basename(pdf_path or '')} page {best_img.get('page', '?')+1}",
    })
    if not stim:
        return False

    # 关联到 question
    try:
        sb_patch("questions", f"id=eq.{qid}", {
            "stimulus_id": stim["id"],
        })
        print(f"  [{qid[:8]}] Q{qnum} → stimulus {stim['id'][:8]}")
        return True
    except Exception as e:
        print(f"  [{qid[:8]}] 更新失败: {e}")
        return False


# ============================================
# Mode 2: 修复 stimuli 表缺 image_url
# ============================================

def fetch_stimuli_missing_image(limit=500):
    """拉取有 description 但无 image_url 的 stimuli"""
    url = (
        f"{SB_URL}/rest/v1/stimuli"
        f"?select=id,content_type,description"
        f"&image_url=is.null"
        f"&order=id&limit={limit}"
    )
    req = urllib.request.Request(url, headers=SB_HEADERS)
    resp = urllib.request.urlopen(req, timeout=30, context=_CTX)
    return json.loads(resp.read())


def fetch_questions_for_stimulus(stim_id):
    """找到引用此 stimulus 的题目"""
    url = (
        f"{SB_URL}/rest/v1/questions"
        f"?select=id,course,question_number,source_assessment"
        f"&stimulus_id=eq.{stim_id}"
        f"&limit=5"
    )
    req = urllib.request.Request(url, headers=SB_HEADERS)
    resp = urllib.request.urlopen(req, timeout=30, context=_CTX)
    return json.loads(resp.read())


def process_stimulus(stim, dry_run=False):
    """通过关联的题目找到 PDF，提取图片并更新 stimulus"""
    stim_id = stim["id"]
    questions = fetch_questions_for_stimulus(stim_id)
    if not questions:
        print(f"  [{stim_id[:8]}] 无关联题目")
        return False

    q = questions[0]
    course = q["course"]
    source = q.get("source_assessment", "")
    qnum = q.get("question_number", 1)

    pdf_path = find_pdf(course, source)
    if not pdf_path:
        print(f"  [{stim_id[:8]}] 找不到 PDF: {source}")
        return False

    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    doc.close()

    page_num = estimate_page(qnum, total_pages)
    images = extract_nearby_images(pdf_path, page_num, search_range=3)

    if not images:
        try:
            page_bytes = render_page_region(pdf_path, page_num)
            images = [{"bytes": page_bytes, "ext": "png", "size": len(page_bytes), "width": 0, "height": 0, "page": page_num}]
        except Exception:
            pass

    if not images:
        print(f"  [{stim_id[:8]}] 无可用图片")
        return False

    best_img = images[0]
    print(f"  [{stim_id[:8]}] 找到 {best_img['width']}x{best_img['height']} from {os.path.basename(pdf_path)} p{best_img.get('page', '?')+1}")

    if dry_run:
        return True

    img_url = upload_image(best_img["bytes"], course, stim_id, best_img.get("ext", "png"))
    if not img_url:
        return False

    try:
        sb_patch("stimuli", f"id=eq.{stim_id}", {"image_url": img_url})
        print(f"  [{stim_id[:8]}] image_url 已更新")
        return True
    except Exception as e:
        print(f"  [{stim_id[:8]}] 更新失败: {e}")
        return False


# ============================================
# Main
# ============================================

def main():
    args = sys.argv[1:]
    course = "ALL"
    dry_run = False
    limit = 200
    mode = "both"

    i = 0
    while i < len(args):
        a = args[i]
        if a == "--dry-run":
            dry_run = True
        elif a == "--limit" and i + 1 < len(args):
            limit = int(args[i + 1])
            i += 1
        elif a == "--mode" and i + 1 < len(args):
            mode = args[i + 1]
            i += 1
        elif not a.startswith("--"):
            course = a.upper()
        i += 1

    print(f"[图片修复 v2] 课程={course}, mode={mode}, dry_run={dry_run}, limit={limit}")

    ok = 0
    fail = 0

    # Mode: questions — 修复 stimulus_dependent 但无 stimulus_id
    if mode in ("questions", "both"):
        print(f"\n{'='*50}")
        print("Phase A: 修复缺 stimulus_id 的题目")
        print(f"{'='*50}")
        questions = fetch_questions_missing_stimulus(course, limit)
        print(f"找到 {len(questions)} 题需要修复")

        for i_q, q in enumerate(questions):
            print(f"\n[{i_q+1}/{len(questions)}] {q['course']} Q{q.get('question_number')} — {q.get('source_assessment','')[:40]}")
            if process_question(q, dry_run=dry_run):
                ok += 1
            else:
                fail += 1
            time.sleep(0.1)

    # Mode: stimuli — 修复 stimuli 缺 image_url
    if mode in ("stimuli", "both"):
        print(f"\n{'='*50}")
        print("Phase B: 修复 stimuli 缺 image_url")
        print(f"{'='*50}")
        stimuli = fetch_stimuli_missing_image(limit)
        print(f"找到 {len(stimuli)} 个 stimulus 需要修复")

        for i_s, stim in enumerate(stimuli):
            print(f"\n[{i_s+1}/{len(stimuli)}] {stim.get('content_type','')} — {(stim.get('description','') or '')[:40]}")
            if process_stimulus(stim, dry_run=dry_run):
                ok += 1
            else:
                fail += 1
            time.sleep(0.1)

    print(f"\n完成: 成功={ok}, 失败={fail}")


if __name__ == "__main__":
    main()
