#!/usr/bin/env bash
# =============================================================================
# gate-quality.sh
# Событие: Stop (когда Claude считает, что закончил).
# Назначение: протезные глаза для не-кодера. Жёстко не даёт завершить ход,
#   пока детерминированные проверки качества красные — линт, типы, сложность,
#   мёртвый код, уязвимые зависимости. Ловит «мусорный иишный код» и класс
#   бэк-багов, которые принципал не видит глазами (LESSONS «Слепой принципал
#   + агент сам себе проверяющий»). Дополняет gate-tests (тесты ≠ качество).
# OPT-IN: по умолчанию выключен. Включается — положи команду в
#   .claude/quality-command.txt, например:
#       ruff check . && mypy .                  (Python / FastAPI)
#       npx eslint . && npx tsc --noEmit        (TS / Node)
#       ./gradlew ktlintCheck detekt            (Kotlin / FamyFlow)
#   Нет файла или он пустой → exit 0 (дремлет, пока проект не настроит).
# Мягкий режим: пустой файл .claude/quality-warn-only → только предупреждать
#   (exit 0 всегда) — на время подгонки шумной команды.
# Анти-луп: stop_hook_active=true → exit 0.
# Exit: 2 — проверки упали (Claude продолжит чинить); 0 — иначе.
# =============================================================================

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
QUALITY_CMD_FILE="$PROJECT_DIR/.claude/quality-command.txt"

# Реальный python в обход WindowsApps-заглушки (см. LESSONS «Хук с exit 0 =
# молчаливый отказ»). При сбое парсер вернёт "false" — гейт отработает как обычно
# (не отключится), максимум один лишний прогон при реальном Stop-лупе.
. "$(dirname "${BASH_SOURCE[0]}")/_lib.sh" 2>/dev/null || true
declare -f resolve_py >/dev/null 2>&1 && resolve_py || PY_BIN="python3"

# Защита от бесконечного цикла Stop→Stop.
STOP_ACTIVE="$(PYTHONUTF8=1 "$PY_BIN" -c '
import sys, json
try:
    print(str(json.load(sys.stdin).get("stop_hook_active", False)).lower())
except Exception:
    print("false")
' 2>/dev/null)"
[ "$STOP_ACTIVE" = "true" ] && exit 0

# Опт-ин: без файла команды — выходим.
[ -f "$QUALITY_CMD_FILE" ] || exit 0
QUALITY_CMD="$(grep -v '^[[:space:]]*#' "$QUALITY_CMD_FILE" | sed '/^[[:space:]]*$/d' | head -1)"
[ -z "$QUALITY_CMD" ] && exit 0

cd "$PROJECT_DIR" 2>/dev/null || exit 0

if ! eval "$QUALITY_CMD" >/tmp/claude_quality_out 2>&1; then
  # Мягкий режим — только предупреждение, не блок.
  if [ -f "$PROJECT_DIR/.claude/quality-warn-only" ]; then
    echo "🟡 Проверки качества нашли отклонения (warn-only режим)." >&2
    tail -25 /tmp/claude_quality_out >&2
    exit 0
  fi
  echo "🔴 Качество кода: детерминированные проверки не прошли — задача не готова." >&2
  echo "   Команда: $QUALITY_CMD" >&2
  echo "   «Протезные глаза» для зон, которые Антон не читает глазами (бэк/инфра)." >&2
  echo "   Последние строки вывода:" >&2
  tail -25 /tmp/claude_quality_out >&2
  echo "   Почини и заверши ход заново." >&2
  exit 2
fi

exit 0
