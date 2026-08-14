#!/usr/bin/env python3
"""
check_design_tokens.py — ловит отклонения от дизайн-системы в UI-коде.

Зачем: цель Антона — «Claude никогда не теряется в дизайне и делает ровно то,
что заложено в дизайн-системе». Скрипт превращает это из «надо помнить» в
проверяемый инвариант: флагует захардкоженные цвета (#rrggbb) и «магические»
размеры там, где должны стоять токены.

Использование:
    python3 .claude/scripts/check_design_tokens.py --tokens .claude/design-tokens.json file.tsx
    python3 .claude/scripts/check_design_tokens.py --tokens .claude/design-tokens.json src/  (рекурсивно)

Конфиг (.claude/design-tokens.json), все поля необязательны:
{
  "allowed_hex": ["#000000", "#ffffff", "transparent"],   // цвета, которые ок везде
  "token_files": ["**/Theme.kt", "**/tokens.css", "**/theme.ts"], // где хардкод РАЗРЕШЁН (определения токенов)
  "ignore_globs": ["**/build/**", "**/node_modules/**"],
  "check_magic_px": true,        // флагать px-литералы (кроме 0/1px)
  "allowed_px": [0, 1, 2, 4, 8, 12, 16, 24, 32]  // «сетка» — эти px не считаются магическими
}

Exit: 0 — чисто/файл не UI; 1 — найдены отклонения (печатает их).
design-check.sh использует это, чтобы отдать Claude фидбэк (exit 2 в PostToolUse).
"""
from __future__ import annotations
import argparse
import fnmatch
import json
import re
import sys
from pathlib import Path

UI_EXT = {".kt", ".kts", ".tsx", ".jsx", ".ts", ".css", ".scss"}
HEX_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b")
# px-литералы: в css "16px", в kt/ts ".dp"/"px" редки — берём общий "<num>px"
PX_RE = re.compile(r"\b(\d{1,4})px\b")


def load_cfg(path: str | None) -> dict:
    if path and Path(path).exists():
        return json.loads(Path(path).read_text(encoding="utf-8"))
    return {}


def matches_any(rel: str, globs: list[str]) -> bool:
    return any(fnmatch.fnmatch(rel, g) or fnmatch.fnmatch(Path(rel).name, g) for g in globs)


def iter_targets(target: Path, ignore: list[str]):
    if target.is_file():
        yield target
        return
    for p in target.rglob("*"):
        if p.is_file() and p.suffix in UI_EXT and not matches_any(str(p), ignore):
            yield p


def check_file(path: Path, cfg: dict) -> list[str]:
    allowed_hex = {h.lower() for h in cfg.get("allowed_hex", ["#000", "#000000", "#fff", "#ffffff", "transparent"])}
    allowed_px = set(cfg.get("allowed_px", [0, 1, 2, 4, 8, 12, 16, 24, 32]))
    check_px = cfg.get("check_magic_px", True)

    issues: list[str] = []
    for i, line in enumerate(path.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
        if line.lstrip().startswith(("//", "*", "/*", "#")):
            continue
        for m in HEX_RE.finditer(line):
            if m.group(0).lower() not in allowed_hex:
                issues.append(f"{path}:{i}: хардкод цвета {m.group(0)} — замени токеном дизайн-системы")
        if check_px:
            for m in PX_RE.finditer(line):
                if int(m.group(1)) not in allowed_px:
                    issues.append(f"{path}:{i}: магический размер {m.group(0)} — используй токен/шаг сетки")
    return issues


def main() -> int:
    ap = argparse.ArgumentParser(description="Проверка дизайн-токенов")
    ap.add_argument("paths", nargs="+", help="файлы или папки")
    ap.add_argument("--tokens", default=None, help="путь к design-tokens.json")
    args = ap.parse_args()

    cfg = load_cfg(args.tokens)
    token_files = cfg.get("token_files", [])
    ignore = cfg.get("ignore_globs", ["**/build/**", "**/dist/**", "**/node_modules/**", "**/.venv/**"])

    all_issues: list[str] = []
    for raw in args.paths:
        target = Path(raw)
        if not target.exists():
            continue
        for f in iter_targets(target, ignore):
            if matches_any(str(f), token_files):   # файл определения токенов — хардкод ок
                continue
            all_issues.extend(check_file(f, cfg))

    if all_issues:
        for line in all_issues[:80]:
            print(line)
        if len(all_issues) > 80:
            print(f"... и ещё {len(all_issues) - 80}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
