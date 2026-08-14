#!/usr/bin/env python3
"""
assess_risk.py — оценивает риск изменений и предлагает, каких ревьюеров звать.

Зачем: раньше ты вручную решал, звать ли security/design-reviewer. Скрипт
смотрит, КАКИЕ пути затронуты в diff, считает уровень риска и рекомендует
набор субагентов. Прозрачно (чистая классификация по путям), без чёрного
ящика. Идея из ruflo-jujutsu (risk-scored diff → reviewers), адаптирована
под наш Слой 4.

Использование:
    python3 .claude/scripts/assess_risk.py            # незакоммиченное (HEAD)
    python3 .claude/scripts/assess_risk.py --base main # ветка vs main

Вывод: уровень риска + рекомендованные ревьюеры. Команда /review вызывает
это и сразу делегирует рекомендованным.

Exit: 0. (Только рекомендация, ничего не блокирует.)
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys

# Категории путей → (вес риска, какой ревьюер). Подгони регэкспы под свой проект.
RULES = [
    # security-чувствительное
    (r"(auth|login|session|token|password|crypto|secret|payment|billing|оплат|\.env)",
     5, "security-reviewer", "затронут security-периметр (auth/платежи/секреты)"),
    (r"(alembic/versions/|migration|schema\.)",
     4, "code-reviewer", "миграции БД — проверить обратимость"),
    (r"(NFR\.md|security|permission|право)",
     3, "security-reviewer", "правила доступа/безопасности"),
    # инфра
    (r"(docker|\.github/workflows|deploy|nginx|\.ya?ml$|Dockerfile)",
     3, "security-reviewer", "инфраструктура/CI — проверить конфиг и секреты"),
    # UI
    (r"\.(kt|kts|tsx|jsx|css|scss|swift)$",
     2, "design-reviewer", "затронут UI — проверить дизайн-систему и состояния"),
]

# Порог «большого диффа» → code-reviewer обязателен в любом случае
BIG_DIFF_FILES = 8
BIG_DIFF_LINES = 300


def changed_files(base: str | None) -> list[str]:
    rng = f"{base}...HEAD" if base else "HEAD"
    try:
        out = subprocess.run(["git", "diff", "--name-only", rng],
                             capture_output=True, text=True, check=True).stdout
    except subprocess.CalledProcessError:
        out = subprocess.run(["git", "diff", "--name-only"],
                             capture_output=True, text=True).stdout
    return [f for f in out.splitlines() if f.strip()]


def diff_stat(base: str | None) -> int:
    rng = f"{base}...HEAD" if base else "HEAD"
    out = subprocess.run(["git", "diff", "--shortstat", rng],
                         capture_output=True, text=True).stdout
    m = re.search(r"(\d+) insertion|(\d+) deletion", out)
    nums = [int(x) for x in re.findall(r"(\d+) (?:insertion|deletion)", out)]
    return sum(nums)


def main() -> int:
    ap = argparse.ArgumentParser(description="Оценка риска diff → ревьюеры")
    ap.add_argument("--base", default=None, help="база сравнения (напр. main)")
    args = ap.parse_args()

    files = changed_files(args.base)
    if not files:
        print("Изменений нет — ревью не требуется.")
        return 0

    score = 0
    reviewers: dict[str, str] = {}  # reviewer -> причина
    triggers: list[str] = []

    for f in files:
        for pattern, weight, reviewer, reason in RULES:
            if re.search(pattern, f, re.I):
                score += weight
                reviewers.setdefault(reviewer, reason)
                triggers.append(f"{f} → {reason}")
                break  # один файл — одна (самая весомая) категория

    n_files = len(files)
    n_lines = diff_stat(args.base)
    big = n_files >= BIG_DIFF_FILES or n_lines >= BIG_DIFF_LINES

    # code-reviewer — всегда для нетривиального; big-diff добавляет вес
    reviewers.setdefault("code-reviewer", "базовое ревью качества")
    if big:
        score += 2

    level = "🔴 высокий" if score >= 6 else ("🟠 средний" if score >= 3 else "🟢 низкий")

    print(f"## Оценка риска изменений\n")
    print(f"Файлов: {n_files}, строк: ~{n_lines}{'  (большой diff)' if big else ''}")
    print(f"Уровень риска: {level} (score {score})\n")

    print("Рекомендованные ревьюеры:")
    # порядок: security → code → design
    order = ["security-reviewer", "code-reviewer", "design-reviewer"]
    for r in order:
        if r in reviewers:
            print(f"  • {r} — {reviewers[r]}")

    if triggers:
        print("\nЧто сработало:")
        for t in triggers[:20]:
            print(f"  - {t}")

    print("\nДелегируй рекомендованным перед merge. Каждый вернёт вердикт с severity.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
