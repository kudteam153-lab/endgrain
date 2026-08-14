#!/usr/bin/env bash
# =============================================================================
# design-check.sh
# Событие: PostToolUse, matcher Edit|Write|MultiEdit
# Назначение: после правки UI-файла проверить, что использованы токены
#   дизайн-системы, а не захардкоженные цвета/отступы. Закрывает цель
#   «Claude никогда не теряется в дизайне и делает ровно то, что заложено».
# Особенность PostToolUse: правка уже сделана — отменить нельзя. Но exit 2
#   отдаёт stderr обратно Claude как фидбэк, и Claude может сам исправить
#   следующим шагом. То есть дизайн-система становится проверяемым
#   инвариантом, а не «памятью», на которую надо надеяться.
# Exit: 2 — есть нарушения (Claude получит замечание и исправит);
#        0 — чисто, либо проверка не настроена для этого проекта.
# Строгий режим off→warn: чтобы только предупреждать (exit 0 всегда),
#   создай пустой файл .claude/design-check-warn-only
# =============================================================================

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
SCRIPT="$PROJECT_DIR/.claude/scripts/check_design_tokens.py"
TOKENS="$PROJECT_DIR/.claude/design-tokens.json"

# Проверка включается только если есть и скрипт, и конфиг токенов.
[ -f "$SCRIPT" ] || exit 0
[ -f "$TOKENS" ] || exit 0

# Реальный python в обход WindowsApps-заглушки (см. guard-files.sh / LESSONS
# «Хук с exit 0 = молчаливый отказ»): без этого разбор JSON давал пустой путь,
# и design-check тихо пропускал любой файл, оставаясь на вид включённым.
. "$(dirname "${BASH_SOURCE[0]}")/_lib.sh" 2>/dev/null || true
declare -f resolve_py >/dev/null 2>&1 && resolve_py || PY_BIN="python3"

FILE_PATH="$(PYTHONUTF8=1 "$PY_BIN" -c '
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get("tool_input", {}) or {}
    print(ti.get("file_path") or ti.get("path") or "")
except Exception:
    print("")
' 2>/dev/null)"

[ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ] && exit 0

# Интересуют только UI-файлы.
case "$FILE_PATH" in
  *.kt|*.tsx|*.jsx|*.css|*.scss|*.ts) : ;;
  *) exit 0 ;;
esac

OUTPUT="$(PYTHONUTF8=1 "$PY_BIN" "$SCRIPT" --tokens "$TOKENS" "$FILE_PATH" 2>&1)"
STATUS=$?

[ $STATUS -eq 0 ] && exit 0

echo "🎨 Дизайн-система: найдены отклонения в $FILE_PATH" >&2
echo "$OUTPUT" >&2
echo "Используй токены из дизайн-системы вместо хардкода и поправь файл." >&2

# Мягкий режим — только предупреждение.
[ -f "$PROJECT_DIR/.claude/design-check-warn-only" ] && exit 0

exit 2
