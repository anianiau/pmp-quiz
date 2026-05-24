#!/usr/bin/env python3
"""
PMP問題集 正解率分析スクリプト
Usage: python3 kaizen/analyze_accuracy.py
"""

import csv
import re
import json
import os
from pathlib import Path

# --- パス設定 ---
BASE_DIR = Path(__file__).parent.parent
CSV_FILE = Path(__file__).parent / "download_20260515-0523.csv"
HTML_FILE = BASE_DIR / "index.html"
OUTPUT_FILE = Path(__file__).parent / "accuracy_report_20260517-0523.txt"

PERIOD = "2026-05-17〜05-23"
LOW_THRESHOLD = 40.0   # 正解率(%)以下を「低正解率」とする
HIGH_THRESHOLD = 100.0 # 正解率(%)以上を「高正解率」とする
MIN_ANSWERS = 10       # 高正解率の最低回答数フィルタ


# --- 1. CSV 読み込み ---
def load_csv(path):
    """CSVを読み込み {id: int -> {true, false, total, domain}} を返す"""
    stats = {}
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()

    for line in lines:
        line = line.rstrip("\n")
        parts = line.split(",")
        if len(parts) < 6:
            continue
        domain = parts[0].strip()
        qid_str = parts[1].strip()
        true_str = parts[2].strip()
        false_str = parts[4].strip()
        total_str = parts[5].strip()

        # ヘッダー行・集計行・(not set) 行を除外
        if domain in ("", "#", "ドメイン", "(not set)"):
            continue
        if not qid_str.lstrip("-").isdigit():
            continue

        try:
            qid = int(qid_str)
            true_cnt = int(true_str) if true_str.lstrip("-").isdigit() else 0
            false_cnt = int(false_str) if false_str.lstrip("-").isdigit() else 0
            total_cnt = int(total_str) if total_str.lstrip("-").isdigit() else 0
        except ValueError:
            continue

        answered = true_cnt + false_cnt
        if answered == 0:
            continue

        correct_rate = true_cnt / answered * 100
        stats[qid] = {
            "domain": domain,
            "true": true_cnt,
            "false": false_cnt,
            "total": total_cnt,
            "answered": answered,
            "correct_rate": correct_rate,
        }

    return stats


# --- 2. index.html から日本語問題を抽出 ---
def load_questions(path):
    """index.html の日本語問題ブロックを解析し {id -> question_dict} を返す"""
    html = open(path, encoding="utf-8").read()

    # 日本語セクションのみを対象にする
    # 英語セクションの先頭は英語の第1問（"People","Conflict has arisen"）が目印
    eng_marker = re.search(r'\{id:1,domain:"People"', html)
    ja_html = html[:eng_marker.start()] if eng_marker else html

    # スペースあり形式: {id: N, domain: "..." (従来の日本語問題)
    # スペースなし形式: {id:N,domain:"..."  (新規追加の日本語問題)
    pattern = re.compile(
        r'\{id:\s*(\d+),\s*domain:\s*"([^"]+)",\s*question:\s*"((?:[^"\\]|\\.)*)",\s*'
        r'options:\s*\[([^\]]*)\],\s*correct:\s*(\d+),\s*explanation:\s*"((?:[^"\\]|\\.)*)"'
    )

    questions = {}
    for m in pattern.finditer(ja_html):
        qid = int(m.group(1))
        domain = m.group(2)
        question = m.group(3)
        options_raw = m.group(4)
        correct = int(m.group(5))
        explanation = m.group(6)

        # options をパース: "選択肢1", "選択肢2", ...
        opts = re.findall(r'"((?:[^"\\]|\\.)*)"', options_raw)

        questions[qid] = {
            "id": qid,
            "domain": domain,
            "question": question,
            "options": opts,
            "correct": correct,
            "explanation": explanation,
        }

    return questions


# --- 3. レポート生成 ---
def format_question(stat, q):
    qid = q["id"]
    domain = q["domain"]
    rate = stat["correct_rate"]
    true_cnt = stat["true"]
    answered = stat["answered"]

    lines = []
    lines.append("=" * 60)
    lines.append(f"Q{qid} [{domain}]  正解率: {rate:.1f}%（正解 {true_cnt} / 回答 {answered}）")
    lines.append(f"問題: {q['question']}")
    for i, opt in enumerate(q["options"]):
        marker = "★" if i == q["correct"] else " "
        lines.append(f"  {marker} {i}: {opt}")
    lines.append(f"解説: {q['explanation']}")
    lines.append("")
    return "\n".join(lines)


def generate_report(stats, questions):
    # 低正解率 (correct_rate <= LOW_THRESHOLD), 正解率昇順
    low = sorted(
        [s for s in stats.values() if s["correct_rate"] <= LOW_THRESHOLD],
        key=lambda x: x["correct_rate"]
    )

    # 高正解率 (correct_rate >= HIGH_THRESHOLD かつ answered >= MIN_ANSWERS), 回答数降順
    high = sorted(
        [s for s in stats.values() if s["correct_rate"] >= HIGH_THRESHOLD and s["answered"] >= MIN_ANSWERS],
        key=lambda x: -x["answered"]
    )

    total_answered = sum(s["answered"] for s in stats.values())
    total_correct = sum(s["true"] for s in stats.values())
    overall_rate = total_correct / total_answered * 100 if total_answered > 0 else 0

    lines = []
    lines.append(f"# PMP問題集 正解率分析レポート")
    lines.append(f"# 期間: {PERIOD}")
    lines.append(f"# 全体正解率: {overall_rate:.1f}%（正解 {total_correct:,} / 回答 {total_answered:,}）")
    lines.append(f"# 低正解率（≤{LOW_THRESHOLD:.0f}%）: {len(low)}問  /  高正解率（{HIGH_THRESHOLD:.0f}%・回答{MIN_ANSWERS}件以上）: {len(high)}問")
    lines.append("")

    lines.append(f"===== 低正解率（≤{LOW_THRESHOLD:.0f}%）{len(low)}問 =====")
    lines.append("")
    for s in low:
        qid = s.get("_id") or next((k for k, v in stats.items() if v is s), None)
        q = questions.get(qid)
        if q:
            lines.append(format_question(s, q))
        else:
            lines.append(f"Q{qid} - 問題データ未取得（domain: {s['domain']}, 正解率: {s['correct_rate']:.1f}%）\n")

    lines.append("")
    lines.append(f"===== 高正解率（{HIGH_THRESHOLD:.0f}%・回答{MIN_ANSWERS}件以上）{len(high)}問 =====")
    lines.append("")
    for s in high:
        qid = next((k for k, v in stats.items() if v is s), None)
        q = questions.get(qid)
        if q:
            lines.append(format_question(s, q))
        else:
            lines.append(f"Q{qid} - 問題データ未取得（domain: {s['domain']}, 正解率: {s['correct_rate']:.1f}%）\n")

    return "\n".join(lines)


# --- メイン ---
def main():
    print(f"CSV 読み込み中: {CSV_FILE}")
    stats = load_csv(CSV_FILE)

    # stats のキーを id として付与
    for qid, s in stats.items():
        s["_id"] = qid

    print(f"  {len(stats)} 問のデータを取得")

    print(f"index.html から問題データ抽出中: {HTML_FILE}")
    questions = load_questions(HTML_FILE)
    print(f"  {len(questions)} 問の日本語問題を抽出")

    report = generate_report(stats, questions)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"\nレポート出力: {OUTPUT_FILE}")

    # サマリー表示
    total_answered = sum(s["answered"] for s in stats.values())
    total_correct = sum(s["true"] for s in stats.values())
    low_count = sum(1 for s in stats.values() if s["correct_rate"] <= LOW_THRESHOLD)
    high_count = sum(1 for s in stats.values() if s["correct_rate"] >= HIGH_THRESHOLD and s["answered"] >= MIN_ANSWERS)
    print(f"全体正解率: {total_correct/total_answered*100:.1f}% ({total_correct:,}/{total_answered:,})")
    print(f"低正解率（≤{LOW_THRESHOLD:.0f}%）: {low_count}問")
    print(f"高正解率（{HIGH_THRESHOLD:.0f}%・{MIN_ANSWERS}件以上）: {high_count}問")


if __name__ == "__main__":
    main()
