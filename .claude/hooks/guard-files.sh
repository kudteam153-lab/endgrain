#!/usr/bin/env bash
# =============================================================================
# guard-files.sh
# Событие: PreToolUse, matcher Edit|Write|MultiEdit
# Назначение: физически запретить правку файлов, перечисленных в
#   .claude/protected-paths.txt. Материализует раздел CHECKPOINT §10
#   («что НЕ менять без явного запроса») и принцип «хирургические правки».
# Exit: 2 — заблокировать инструмент (ВАЖНО: именно 2, не 1);
#        0 — разрешить.
# Зависимости: python3 (разбор JSON со stdin).
# =============================================================================

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
PROTECTED="$PROJECT_DIR/.claude/protected-paths.txt"

# Нет списка — нечего защищать.
[ -f "$PROTECTED" ] || exit 0

# Выбираем РЕАЛЬНЫЙ python, пропуская execution-alias из WindowsApps (в
# подпроцессе хука он резолвится первым и бывает сломанной 0-байтной заглушкой).
# Без этого разбор JSON молча давал пустой путь → exit 0 → защита не работала,
# оставаясь на вид включённой. См. LESSONS «Хук с exit 0 = молчаливый отказ».
. "$(dirname "${BASH_SOURCE[0]}")/_lib.sh" 2>/dev/null || true
declare -f resolve_py >/dev/null 2>&1 && resolve_py || PY_BIN="python3"

# Достаём путь редактируемого файла из JSON на stdin.
FILE_PATH="$(PYTHONUTF8=1 "$PY_BIN" -c '
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get("tool_input", {}) or {}
    print(ti.get("file_path") or ti.get("path") or "")
except Exception:
    print("")
' 2>/dev/null)"

# Пустой путь = либо инструмент без file_path, либо сломанный разбор. Не блокируем
# (иначе одна поломка парсера остановит всю работу), но и не молчим: защита в этот
# момент фактически отключена, и об этом должно быть видно.
if [ -z "$FILE_PATH" ]; then
  if ! command -v "$PY_BIN" >/dev/null 2>&1; then
    echo "⚠ guard-files: python не найден ($PY_BIN) — защита файлов НЕ применена." >&2
  fi
  exit 0
fi

# Нормализуем к пути относительно корня проекта (для сопоставления с glob).
REL="${FILE_PATH#$PROJECT_DIR/}"

# Идём по строкам списка (игнорируя пустые и комментарии) и сравниваем как glob.
#
# ВАЖНО про trim: раньше здесь стояло `pattern="$(echo "$pattern" | xargs)"` —
# два форка на строку. На 46 строках protected-paths.txt это 92 процесса, а форк
# в git-bash на Windows стоит ~95 мс: хук работал 12,8 с при таймауте 10 с и
# отваливался ВСЕГДА, пропуская правку (fail-open). В логах — 130 отмен
# PreToolUse:Edit. Ниже trim на builtin-подстановке, без единого форка: 256 мс.
# Не возвращать `echo | xargs` ни под каким предлогом.
# Отказ отдаём решением, а не кодом возврата: причина попадает в диалог
# разрешений и транскрипт. Без python — прежний exit 2, чтобы защита файла
# не исчезла из-за отсутствия интерпретатора.
block() {  # block <путь> <правило>
  BLOCKED="$1" RULE="$2" PYTHONUTF8=1 "$PY_BIN" -c '
import json, os, sys
sys.stdout.write(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason":
            "Файл защищён от правок: " + os.environ["BLOCKED"]
            + "\nСовпало правило в .claude/protected-paths.txt: " + os.environ["RULE"]
            + "\nЭто зона из CHECKPOINT §10. Нужна правка — Антон снимает защиту явно.",
    }
}, ensure_ascii=False))
' 2>/dev/null && exit 0

  echo "⛔ Файл защищён от правок: $1" >&2
  echo "   Совпало правило в .claude/protected-paths.txt: $2" >&2
  echo "   Это зона из CHECKPOINT §10. Нужна правка — Антон снимает защиту явно." >&2
  exit 2
}

while IFS= read -r pattern || [ -n "$pattern" ]; do
  pattern="${pattern%%#*}"                             # срезать комментарий
  pattern="${pattern#"${pattern%%[![:space:]]*}"}"     # trim слева
  pattern="${pattern%"${pattern##*[![:space:]]}"}"     # trim справа
  [ -z "$pattern" ] && continue
  # shellcheck disable=SC2254
  case "$REL" in
    $pattern) block "$REL" "$pattern" ;;
  esac
  case "$FILE_PATH" in
    $pattern) block "$FILE_PATH" "$pattern" ;;
  esac
done < "$PROTECTED"

exit 0
