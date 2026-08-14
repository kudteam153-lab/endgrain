#!/usr/bin/env bash
# =============================================================================
# gate-goal.sh
# Событие: Stop (завершение хода агента). Ставится в settings.json рядом с
#   gate-tests (см. README_SYSTEM).
# Назначение: удержание цели. На СУЩЕСТВЕННОМ ходе мягко напоминает свериться
#   с GOAL (acceptance + anti-scope) — чтобы агент не «добавил от себя» и не
#   ушёл за рамки. Это НЕ блок по ошибке (как gate-tests на красных тестах),
#   а разовая сверка-напоминание.
# Порог: на тривиальном ходе (мало файлов/строк) — молчит (exit 0).
# Анти-луп: если stop_hook_active=true (сверка уже была) — молчит (exit 0).
# Без вызова API: оценка существенности — по git, сама сверка — на агенте.
# Exit: 0 — пропустить; 2 — один проход сверки (stderr виден агенту).
# Переопределяемые пороги: GATE_GOAL_FILES (=3), GATE_GOAL_LINES (=80).
# =============================================================================

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

# stdin: JSON от Claude Code. Если это уже повторный Stop после нашей сверки —
# не зацикливаемся.
INPUT="$(cat 2>/dev/null || true)"
if printf '%s' "$INPUT" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

# Цель должна существовать — иначе сверять не с чем.
GOAL="$PROJECT_DIR/GOAL.md"
[ -f "$GOAL" ] || GOAL="$(find . -maxdepth 2 -name 'GOAL.md' 2>/dev/null | head -1)"
[ -n "$GOAL" ] && [ -f "$GOAL" ] || exit 0

# Вне git порог существенности не оценить — молчим.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

THRESH_FILES="${GATE_GOAL_FILES:-3}"
THRESH_LINES="${GATE_GOAL_LINES:-80}"

FILES=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
LINES=$(git diff HEAD --shortstat 2>/dev/null \
  | grep -oE '[0-9]+ (insertion|deletion)' \
  | grep -oE '^[0-9]+' \
  | awk '{s+=$1} END{print s+0}')
[ -z "$FILES" ] && FILES=0
[ -z "$LINES" ] && LINES=0

# Тривиальный ход — не мешаем.
if [ "$FILES" -lt "$THRESH_FILES" ] && [ "$LINES" -lt "$THRESH_LINES" ]; then
  exit 0
fi

# Существенный ход — разовая мягкая сверка цели. Напоминание идёт через
# additionalContext: оно ничего не блокирует, и оборот модели на него не нужен.
GOAL_REL="${GOAL#./}"
. "$(dirname "${BASH_SOURCE[0]}")/_lib.sh" 2>/dev/null || true

MSG="Перед завершением — сверься с целью проекта (${GOAL_REL}):
  • сделанное соответствует acceptance в GOAL / goal.json?
  • не вышел ли за anti-scope — не добавил ли лишнего «от себя»?
Если всё в рамках — заверши как есть. Если вышел за scope — остановись и
вынеси Антону выбор (A/B/C), не решай молча.
(Разовая сверка цели, не блок по тестам. Порог сработал: ${FILES} файлов / ${LINES} строк.)"

if declare -f stop_context >/dev/null 2>&1 && stop_context "$MSG"; then
  exit 0
fi
printf '%s\n' "$MSG" >&2
exit 2
