#!/usr/bin/env python3
"""
validate_checkpoint.py — проверка, что CHECKPOINT_CURRENT.md в порядке.

Зачем: CHECKPOINT §8 (next task) — keystone непрерывности. Если он пустой,
устаревший или забит плейсхолдерами-заглушками, следующая сессия стартует
вслепую. Скрипт ловит это до того, как сломается непрерывность.

Использование:
    python3 .claude/scripts/validate_checkpoint.py
    python3 .claude/scripts/validate_checkpoint.py --file docs/CHECKPOINT_CURRENT.md
    python3 .claude/scripts/validate_checkpoint.py --max-age-days 14

Проверяет:
- файл существует;
- §1 «Дата обновления» заполнена и не старше N дней (по умолчанию 21);
- §8 «Следующая микро-задача» присутствует и непустая;
- §8 не состоит из одних плейсхолдеров (<...>, `<...>`, TODO-заглушек шаблона).

Инварианты раскладки — ротации чек-пойнта на четыре файла (приём из playbook
`dev-protocol.md`; включается, когда файл перестаёт влезать в один `Read`).
Проверяются, ТОЛЬКО если соседние файлы существуют: проект с одним чек-пойнтом
проходит валидатор как раньше.
- соседи на месте: CHECKPOINT_DEBT.md / CHECKPOINT_API.md / CHECKPOINT_ARCHIVE.md;
- нумерация «## 1.» … «## 10.» непрерывна. Это несущая конструкция: и хук
  (session-start-context.sh: extract_section), и section() ниже читают раздел как
  «от `## N.` до `## N+1.`». Пропал заголовок — экстрактор не падает, а МОЛЧА
  отдаёт всё до конца файла;
- §4/§5/§7 содержат строку-указатель на файл, куда уехал payload; в §7 указатель
  идёт первым содержательным пунктом (клип хука режет §7 на 3000 символов);
- ID долга `[DBT-NNN]` уникальны в DEBT ∪ ARCHIVE и идут без дыр;
- ARCHIVE не подошёл к лимиту pre-commit `check-added-large-files --maxkb=2000`.

Размер самого CURRENT проверяется всегда, раскладка на это не влияет: порог —
сигнал «пора разгружать закрытое», и нужен он раньше всего как раз проекту,
который ещё живёт одним файлом.

Exit: 0 — ок; 1 — есть проблемы (печатает их). Можно вешать на SessionEnd-хук
как мягкое напоминание или в pre-commit.
"""
from __future__ import annotations
import argparse
import re
import sys
from datetime import datetime, date
from pathlib import Path


def find_checkpoint(explicit: str | None) -> Path | None:
    if explicit:
        p = Path(explicit)
        return p if p.exists() else None
    for cand in ("CHECKPOINT_CURRENT.md", "docs/CHECKPOINT_CURRENT.md"):
        if Path(cand).exists():
            return Path(cand)
    hits = list(Path(".").rglob("CHECKPOINT_CURRENT.md"))
    return hits[0] if hits else None


def section(text: str, n: int) -> str:
    """Содержимое раздела '## n. ...' до следующего '## (n+1). ...'."""
    pat = re.compile(rf"^##\s*{n}\.\s.*?(?=^##\s*{n+1}\.\s|\Z)", re.S | re.M)
    m = pat.search(text)
    return m.group(0) if m else ""


PLACEHOLDER_RE = re.compile(r"<[^>\n]{1,60}>|`<[^>\n]{1,60}>`")


def is_effectively_empty(body: str) -> bool:
    """True, если в разделе нет содержимого помимо заголовка/плейсхолдеров."""
    lines = body.splitlines()[1:]  # убрать строку заголовка
    meaningful = []
    for ln in lines:
        s = ln.strip()
        if not s or s.startswith(("<!--", ">", "###", "####", "|")):
            continue
        s = PLACEHOLDER_RE.sub("", s)               # вырезать <...>
        s = s.lstrip("-*[ ]").replace("`", "").strip()
        if s and "TODO" not in s.upper():
            meaningful.append(s)
    return len(meaningful) == 0


SIBLINGS = {
    "DEBT": "CHECKPOINT_DEBT.md",
    "API": "CHECKPOINT_API.md",
    "ARCHIVE": "CHECKPOINT_ARCHIVE.md",
}
POINTERS = {4: "CHECKPOINT_API.md", 5: "CHECKPOINT_API.md", 7: "CHECKPOINT_DEBT.md"}
# ID берём ТОЛЬКО из позиции определения — начала пункта. Внутри текста
# `[DBT-NNN]` встречается как перекрёстная ссылка («тот же класс, что [DBT-097]»),
# и считать её вторым определением значит запрещать ссылки между пунктами.
DBT_RE = re.compile(r"^- \[DBT-(\d{3,})\]", re.M)


def check_layout(cp: Path, text: str, max_archive_kb: int) -> list[str]:
    """Инварианты раскладки. Молчит, если раскладка ещё не введена."""
    root = cp.parent
    present = {k: root / v for k, v in SIBLINGS.items() if (root / v).exists()}
    if not present:
        return []                      # раскладки нет — один файл, проверять нечего
    problems: list[str] = []

    for key, name in SIBLINGS.items():
        if key not in present:
            problems.append(f"раскладка неполна: {name} отсутствует, а соседи есть.")

    nums = [int(m) for m in re.findall(r"^##\s*(\d+)\.", text, re.M)]
    expected = list(range(1, max(nums) + 1)) if nums else []
    if nums != expected:
        problems.append(
            f"нумерация разделов не непрерывна: {nums}. Хук и section() читают раздел "
            "как «от ## N. до ## N+1.» и при пропуске молча отдают файл до конца."
        )

    for n, target in POINTERS.items():
        body = section(text, n)
        if not body:
            problems.append(f"§{n}: раздел отсутствует.")
            continue
        if target not in body:
            problems.append(f"§{n}: нет строки-указателя на {target} — payload уехал, адрес не оставлен.")
        elif n == 7:
            first = next((s for ln in body.splitlines()[1:] if (s := ln.strip())), "")
            if target not in first:
                problems.append(
                    f"§7: указатель на {target} не первым пунктом — клип хука (3000 симв.) может его срезать."
                )

    ids: list[int] = []
    for key in ("DEBT", "ARCHIVE"):
        if key in present:
            ids += [int(m) for m in DBT_RE.findall(present[key].read_text(encoding="utf-8", errors="ignore"))]
    if ids:
        dup = {i for i in ids if ids.count(i) > 1}
        if dup:
            problems.append(f"ID долга не уникальны в DEBT ∪ ARCHIVE: {sorted(dup)[:5]}.")
        holes = sorted(set(range(1, max(ids) + 1)) - set(ids))
        if holes:
            problems.append(f"дыры в нумерации DBT: {holes[:8]}{' …' if len(holes) > 8 else ''}.")

    if "ARCHIVE" in present:
        arch_kb = present["ARCHIVE"].stat().st_size / 1024
        if arch_kb > max_archive_kb:
            problems.append(
                f"ARCHIVE {arch_kb:.0f} КБ (> {max_archive_kb}) — подходит к лимиту pre-commit "
                "check-added-large-files (2000 КБ). Разрезать по годам."
            )
    return problems


def check_size(cp: Path, max_current_kb: int) -> list[str]:
    """Разбухание рабочего файла. Проверяется ВСЕГДА, независимо от раскладки.

    Раньше эта проверка жила внутри check_layout и потому молчала ровно там, где
    нужна: проект с одним файлом никакого предупреждения не получал и рос дальше,
    пока чек-пойнт не переставал читаться за один вызов. Порог — сигнал «пора
    разгружать», а не «раскладка сломана».
    """
    kb = cp.stat().st_size / 1024
    if kb <= max_current_kb:
        return []
    laid_out = (cp.parent / "CHECKPOINT_ARCHIVE.md").exists()
    if laid_out:
        return [f"CURRENT разбух до {kb:.0f} КБ (> {max_current_kb}) — закрытое не уезжает "
                "в архив. Прогнать ротацию: python .claude/scripts/rotate_checkpoint.py"]
    return [f"CURRENT разбух до {kb:.0f} КБ (> {max_current_kb}) — он читается в начале "
            "каждой сессии. Убрать закрытое в архив (см. playbook dev-protocol «Завершение "
            "задачи»); если разбор вручную объёмен — python .claude/scripts/rotate_checkpoint.py"]


def main() -> int:
    # Вывод: под Windows консоль отдаёт cp1251, и один ✅ роняет скрипт с
    # UnicodeEncodeError — то есть исправный чек-пойнт выглядит как отказ (rc=1).
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    ap = argparse.ArgumentParser(description="Валидатор CHECKPOINT_CURRENT.md")
    ap.add_argument("--file", default=None)
    ap.add_argument("--max-age-days", type=int, default=21)
    ap.add_argument("--max-current-kb", type=int, default=120)
    ap.add_argument("--max-archive-kb", type=int, default=1800)
    args = ap.parse_args()

    cp = find_checkpoint(args.file)
    if cp is None:
        print("⛔ CHECKPOINT_CURRENT.md не найден.", file=sys.stderr)
        return 1

    text = cp.read_text(encoding="utf-8", errors="ignore")
    problems: list[str] = []

    # §1 — дата обновления
    s1 = section(text, 1)
    dm = re.search(r"Дата обновления[^\d]*(\d{4}-\d{2}-\d{2})", s1)
    if not dm:
        problems.append("§1: не найдена заполненная «Дата обновления» (формат YYYY-MM-DD).")
    else:
        try:
            d = datetime.strptime(dm.group(1), "%Y-%m-%d").date()
            age = (date.today() - d).days
            if age > args.max_age_days:
                problems.append(f"§1: дата обновления {d} устарела ({age} дн. > {args.max_age_days}).")
        except ValueError:
            problems.append("§1: дата обновления нераспознаваема.")

    # §8 — следующая микро-задача
    s8 = section(text, 8)
    if not s8:
        problems.append("§8: раздел «Следующая микро-задача» отсутствует.")
    elif is_effectively_empty(s8):
        problems.append("§8: пустой или только плейсхолдеры — следующая сессия стартует вслепую.")

    problems += check_size(cp, args.max_current_kb)
    problems += check_layout(cp, text, args.max_archive_kb)

    if problems:
        print(f"🔶 CHECKPOINT требует внимания ({cp}):", file=sys.stderr)
        for p in problems:
            print(f"   - {p}", file=sys.stderr)
        print("   Обнови чек-пойнт (команда /checkpoint).", file=sys.stderr)
        return 1

    print(f"✅ CHECKPOINT в порядке: {cp}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
