#!/usr/bin/env bash
# =============================================================================
# format-after-edit.sh
# Событие: PostToolUse, matcher Edit|Write|MultiEdit
# Назначение: автоматически форматировать только что изменённый файл под
#   единый стиль. Снимает класс «шумных диффов» (принцип Karpathy —
#   surgical edits / соблюдай существующий стиль).
# Exit: всегда 0 (PostToolUse — наблюдение; правка уже выполнена).
# Поведение: каждый форматтер запускается только если он установлен
#   (command -v), иначе тихо пропускается — хук никогда не валит сессию.
# =============================================================================

set -uo pipefail

# Реальный python в обход WindowsApps-заглушки (см. LESSONS «Хук с exit 0 =
# молчаливый отказ»). Здесь не критично (PostToolUse, косметика), но единообразно.
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

has() { command -v "$1" >/dev/null 2>&1; }

case "$FILE_PATH" in
  # Kotlin — FamyFlow
  *.kt|*.kts)
    if has ktlint; then ktlint --format "$FILE_PATH" >/dev/null 2>&1 || true
    elif has ktfmt; then ktfmt "$FILE_PATH" >/dev/null 2>&1 || true; fi
    ;;
  # Python — VPN-бот, бэкенды
  *.py)
    has ruff  && ruff check --fix --quiet "$FILE_PATH" >/dev/null 2>&1 || true
    has black && black --quiet "$FILE_PATH" >/dev/null 2>&1 || true
    ;;
  # Frontend — Detailbase
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.css|*.scss|*.html|*.md)
    if has prettier; then prettier --write "$FILE_PATH" >/dev/null 2>&1 || true
    elif has npx; then npx --no-install prettier --write "$FILE_PATH" >/dev/null 2>&1 || true; fi
    ;;
  # Swift — iOS
  *.swift)
    has swiftformat && swiftformat "$FILE_PATH" >/dev/null 2>&1 || true
    ;;
esac

exit 0
