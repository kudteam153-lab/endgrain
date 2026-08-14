#!/usr/bin/env python3
"""
run_evals.py — лёгкий раннер golden-эвалов для твоей системы.

Идея: каждый кейс в cases/*.md описывает задачу (prompt) и ОБЪЕКТИВНЫЙ
критерий прохождения (shell-проверки в блоке ```check). Раннер:
  1. прогоняет prompt через `claude -p` (headless) в песочнице/репо,
  2. выполняет check-команды,
  3. кейс passed, если все check вернули 0,
  4. сравнивает с baseline (если записан).

Это НЕ LLM-судья — критерии детерминированные (компиляция, grep паттерна,
наличие/отсутствие файла). Так эвал воспроизводим и не «врёт вкусовщиной».

Формат кейса (cases/NN-name.md):
---
id: 01-surgical-edit
description: Claude не трогает код вне scope
setup: |                      # необязательно: команды подготовки
  cp fixtures/sample.py /tmp/eval_work/sample.py
prompt: |
  В файле /tmp/eval_work/sample.py добавь функцию add(a,b).
  Ничего больше не меняй.
---
```check
# критерии: каждая строка — команда; код 0 = ок
grep -q "def add" /tmp/eval_work/sample.py
test $(git -C /tmp/eval_work diff --stat | wc -l) -le 2
```

Запуск:
    python3 .claude/evals/run_evals.py                 # все, сравнить с baseline
    python3 .claude/evals/run_evals.py --baseline       # записать эталон (нужен claude CLI)
    python3 .claude/evals/run_evals.py --case 01-surgical-edit
    python3 .claude/evals/run_evals.py --dry-run        # не звать модель, проверить кейсы

Запись эталона удобнее через обёртку — она проверит claude CLI, предупредит о
стоимости и запустит из нейтрального cwd (вложенный claude -p не подхватит хуки):
    bash .claude/evals/write-baseline.sh
"""
from __future__ import annotations
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

EVALS_DIR = Path(__file__).resolve().parent
CASES_DIR = EVALS_DIR / "cases"
BASELINE_DIR = EVALS_DIR / "baseline"


def parse_case(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    fm = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not fm:
        raise ValueError(f"{path.name}: нет YAML-frontmatter")
    head, body = fm.group(1), fm.group(2)

    def field(name: str) -> str:
        # поддержка 'name: value' и 'name: |' (блочный)
        m = re.search(rf"^{name}:\s*\|\s*\n((?:[ \t]+.*\n?)*)", head, re.M)
        if m:
            return "\n".join(l[2:] if l.startswith("  ") else l
                             for l in m.group(1).splitlines())
        m = re.search(rf"^{name}:\s*(.+)$", head, re.M)
        return m.group(1).strip() if m else ""

    check = ""
    cm = re.search(r"```check\n(.*?)```", body, re.S)
    if cm:
        check = cm.group(1)

    return {
        "id": field("id") or path.stem,
        "description": field("description"),
        "setup": field("setup"),
        "prompt": field("prompt"),
        "check": check,
        "file": path.name,
    }


def _bash_exe() -> str:
    """Какой именно bash звать.

    На Windows `bash` из PATH — это WSL (`uname` отвечает microsoft-standard-WSL2),
    а не git-bash. У WSL своя файловая система: `/tmp` — линуксовый, диск виден как
    `/mnt/d`, windows-путь не открывается вовсе. Из-за этого критерии кейсов падали
    не по поведению модели, а по среде: файл со скриптом «не найден», кириллица в
    кавычках ломалась на трансляции argv между мирами, `[А-В]` давал «Invalid
    collation character». Хуки проекта зовут git-bash полным путём по той же
    причине (см. комментарий в .claude/settings.json). [D-433]

    Переопределяется переменной EVALS_BASH. На Linux/macOS вернётся обычный bash.
    """
    override = os.environ.get("EVALS_BASH")
    if override:
        return override
    for cand in (r"C:\Program Files\Git\bin\bash.exe",
                 r"C:\Program Files (x86)\Git\bin\bash.exe"):
        if os.path.isfile(cand):
            return cand
    return "bash"


def _bash(script: str) -> subprocess.CompletedProcess:
    """Отдаёт скрипт bash ФАЙЛОМ, а не аргументом командной строки.

    На Windows argv уходит в git-bash через перекодировку командной строки, и
    не-ASCII внутри кавычек рвёт кавычку: bash либо исполняет слова как команды
    («передов: command not found»), либо виснет на «unexpected EOF while looking
    for matching "». Так падали критерии кейсов 05/06 — из-за кодировки, а не
    из-за поведения модели, при том что соседний ASCII-grep в том же прогоне
    отрабатывал. Файл читается как UTF-8-байты и этой дороги не проходит. [D-433]
    """
    fd, path = tempfile.mkstemp(suffix=".sh")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(script)
        # git-bash не открывает файл по windows-пути «D:/Temp/x.sh» — нужен
        # POSIX-вид «/d/Temp/x.sh». На Linux/macOS regex просто не срабатывает.
        p = path.replace("\\", "/")
        m = re.match(r"^([A-Za-z]):/(.*)$", p)
        if m:
            p = f"/{m.group(1).lower()}/{m.group(2)}"
        return subprocess.run(
            [_bash_exe(), p],
            capture_output=True, text=True,
            encoding="utf-8", errors="replace",
        )
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def run_shell(script: str, label: str, whole: bool = False) -> tuple[bool, str]:
    """Выполняет многострочный скрипт; ок только если ВСЕ строки вернули 0.

    Через bash, а не shell=True: на Windows shell=True уходит в cmd.exe, где нет
    ни grep, ни rm, ни printf — все кейсы падали на setup. Плюс cmd отвечает в
    кодировке консоли (cp866), из-за чего text=True ронял декодирование, stderr
    приходил None и раннер умирал с AttributeError на первом же кейсе.
    """
    if not script.strip():
        return True, ""
    if whole:
        # setup — цельный скрипт, а не набор независимых строк. Построчный запуск
        # рвёт heredoc: `cat > f <<'EOF'` уходит в свой bash, не получает stdin и
        # создаёт ПУСТОЙ файл, а строки тела исполняются как команды и валят прогон.
        # Так кейсы 03/04 молча получали пустую фикстуру — модель читала ничто.
        # Для check построчность нужна: там каждая строка — отдельный критерий,
        # и надо знать, какой именно не выполнился.
        r = _bash(script)
        ok = r.returncode == 0
        detail = f"  [{'ok' if ok else 'FAIL'}] (setup, {len(script.splitlines())} строк)"
        if not ok and (r.stderr or "").strip():
            detail += f"\n        {r.stderr.strip()[:200]}"
        return ok, detail
    out_lines = []
    for line in script.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        r = _bash(line)
        ok = r.returncode == 0
        out_lines.append(f"  [{'ok' if ok else 'FAIL'}] {line}")
        if not ok:
            if (r.stderr or "").strip():
                out_lines.append(f"        {r.stderr.strip()[:200]}")
            return False, "\n".join(out_lines)
    return True, "\n".join(out_lines)


def call_claude(prompt: str) -> tuple[str, bool]:
    """Прогон prompt через headless claude -p. Возвращает (вывод, успех-вызова)."""
    if not _has_claude():
        return "(claude CLI не найден — пропуск вызова модели)", False
    try:
        r = subprocess.run(
            ["claude", "-p", prompt],
            capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=600,
        )
        return r.stdout, r.returncode == 0
    except subprocess.TimeoutExpired:
        return "(таймаут)", False


def _has_claude() -> bool:
    from shutil import which
    return which("claude") is not None


def evaluate(case: dict, dry_run: bool) -> dict:
    # setup
    if case["setup"]:
        run_shell(case["setup"], "setup", whole=True)

    model_out = ""
    call_ok = True
    if not dry_run:
        model_out, call_ok = call_claude(case["prompt"])

    if dry_run:
        passed, detail = True, "(dry-run: критерии не выполнялись)"
    else:
        passed, detail = run_shell(case["check"], "check")

    return {
        "id": case["id"],
        "passed": passed,
        "detail": detail,
        "model_out_len": len(model_out),
        "call_ok": call_ok,
    }


def load_baseline() -> dict:
    f = BASELINE_DIR / "baseline.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    return {}


def save_baseline(results: list[dict]) -> None:
    BASELINE_DIR.mkdir(exist_ok=True)
    data = {r["id"]: r["passed"] for r in results}
    (BASELINE_DIR / "baseline.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description="Раннер golden-эвалов")
    ap.add_argument("--case", help="прогнать один кейс по id/имени")
    ap.add_argument("--baseline", action="store_true", help="записать результаты как эталон")
    ap.add_argument("--dry-run", action="store_true", help="не звать модель, проверить кейсы")
    args = ap.parse_args()

    # Несовместимые сочетания — до прогона, а не после: иначе отказ приходит,
    # когда модель уже вызвана и токены потрачены.
    if args.baseline and args.dry_run:
        print("⛔ --baseline с --dry-run бессмыслен: критерии не выполнялись.", file=sys.stderr)
        return 1
    if args.baseline and args.case:
        # save_baseline пишет файл целиком из results, а при --case в results
        # ровно один кейс: эталон схлопнулся бы до него, а остальные «исчезли» —
        # следующий прогон не с чем стало бы сравнивать.
        print("⛔ --baseline с --case затёр бы эталон одним кейсом."
              " Прицельный прогон — без --baseline; запись эталона — по всем кейсам.",
              file=sys.stderr)
        return 1

    if not CASES_DIR.is_dir():
        print(f"⛔ Нет папки кейсов: {CASES_DIR}", file=sys.stderr)
        return 1

    files = sorted(CASES_DIR.glob("*.md"))
    if args.case:
        files = [f for f in files if args.case in f.stem]
    if not files:
        print("⛔ Кейсы не найдены.", file=sys.stderr)
        return 1

    baseline = load_baseline()
    results, regressions = [], []

    print(f"=== Эвалы: {len(files)} кейс(ов){' [dry-run]' if args.dry_run else ''} ===\n")
    for f in files:
        try:
            case = parse_case(f)
        except ValueError as e:
            print(f"⛔ {e}")
            continue
        res = evaluate(case, args.dry_run)
        results.append(res)

        mark = "✅" if res["passed"] else "🔴"
        print(f"{mark} {res['id']} — {case['description']}")
        if res["detail"]:
            print(res["detail"])

        # сравнение с baseline
        if not args.dry_run and res["id"] in baseline:
            was, now = baseline[res["id"]], res["passed"]
            if was and not now:
                regressions.append(res["id"])
                print("   ⚠️ РЕГРЕССИЯ: раньше проходил, теперь нет")
            elif not was and now:
                print("   ⬆️ улучшение: раньше падал, теперь проходит")
        print()

    passed = sum(1 for r in results if r["passed"])
    print(f"=== Итог: {passed}/{len(results)} прошло ===")
    if regressions:
        print(f"🔴 Регрессии: {', '.join(regressions)}")
        print("   Что-то ухудшило поведение системы (модель/CLAUDE.md/скил).")

    # Модель реально не вызывалась (нет claude CLI) → check-и мерили пустой прогон.
    # Такой результат нельзя писать в эталон: baseline «всё падает» сделает любой
    # следующий прогон «улучшением» и навсегда спрячет регрессии.
    calls_ran = not args.dry_run and any(r.get("call_ok") for r in results)

    if args.baseline:
        if not calls_ran:
            print("\n⛔ Baseline НЕ записан: claude CLI недоступен, модель не вызывалась —"
                  " эталон отразил бы пустой прогон, а не поведение системы."
                  " Установи claude в PATH и повтори.", file=sys.stderr)
            return 1
        save_baseline(results)
        print("\n📌 Baseline записан. Дальше прогоны будут сравниваться с ним.")

    # ненулевой код при регрессии — удобно для cron/CI
    return 2 if regressions else 0


if __name__ == "__main__":
    raise SystemExit(main())
