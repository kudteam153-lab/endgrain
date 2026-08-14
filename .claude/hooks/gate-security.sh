#!/usr/bin/env bash
# =============================================================================
# gate-security.sh
# Событие: Stop (завершение хода). Ставится в settings.json рядом с
#   gate-tests / gate-goal (см. README_SYSTEM).
# Назначение: если правки сессии задели security-релевантный код (по списку
#   паттернов .claude/security-paths.txt) — РАЗОВО напомнить пройти гейт
#   безопасности до первого реального юзера (playbook/checklists.md §«Гейт
#   безопасности»). Это НЕ блок (как gate-tests на красных тестах), а мягкое
#   напоминание (exit 2 один раз).
# Триггер: хотя бы один паттерн совпал с путём изменённого файла ИЛИ с
#   добавленной (+) строкой git-diff. Нет diff / нет git / нет списка /
#   нет совпадений → молчит (exit 0).
# Кадэнс: раз за сессию. Маркер .claude/.security-gate-seen хранит session_id,
#   по которым уже напоминали. Анти-луп: stop_hook_active=true → молчит.
# Exit: 0 — пропустить; 2 — один проход напоминания (stderr виден агенту).
# =============================================================================

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

PATTERNS="$PROJECT_DIR/.claude/security-paths.txt"
[ -f "$PATTERNS" ] || exit 0

# stdin: JSON от Claude Code.
INPUT="$(cat 2>/dev/null || true)"

# Анти-луп: повторный Stop после нашей же сверки.
if printf '%s' "$INPUT" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

# Вне git diff не оценить — молчим.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# session_id для кадэнса «раз за сессию».
SID="$(printf '%s' "$INPUT" \
  | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' \
  | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/')"
[ -z "$SID" ] && SID="nosid"
MARK="$PROJECT_DIR/.claude/.security-gate-seen"
if [ -f "$MARK" ] && grep -qxF "$SID" "$MARK" 2>/dev/null; then
  exit 0
fi

# Что менялось: пути изменённых файлов + добавленные строки diff.
CHANGED_PATHS="$(git status --porcelain 2>/dev/null | sed 's/^...//')"
# Нет изменений — нечего проверять.
[ -z "$(printf '%s' "$CHANGED_PATHS" | tr -d '[:space:]')" ] && exit 0
ADDED_LINES="$(git diff HEAD 2>/dev/null | grep -E '^\+' | grep -vE '^\+\+\+')"
BLOB="$CHANGED_PATHS
$ADDED_LINES"

# Чистим список паттернов (без пустых/комментариев).
PAT="$(sed -e 's/#.*$//' "$PATTERNS" | grep -vE '^[[:space:]]*$')"
[ -z "$PAT" ] && exit 0

# Первое совпавшее правило (для подсказки в сообщении).
HIT=""
while IFS= read -r p; do
  [ -z "$p" ] && continue
  if printf '%s' "$BLOB" | grep -iEq -- "$p" 2>/dev/null; then
    HIT="$p"; break
  fi
done <<EOF
$PAT
EOF

[ -z "$HIT" ] && exit 0

# Совпало — помечаем сессию (чтобы не дёргать каждый Stop) и разово напоминаем.
printf '%s\n' "$SID" >> "$MARK" 2>/dev/null || true

# Напоминание через additionalContext: оно ничего не блокирует, и оборот
# модели ради его прочтения не нужен.
. "$(dirname "${BASH_SOURCE[0]}")/_lib.sh" 2>/dev/null || true

MSG="Правки сессии задели security-релевантный код (правило: ${HIT}).
Перед тем как это увидит реальный юзер — пройди гейт безопасности
(playbook/checklists.md §«Гейт безопасности до первого реального юзера»):
  • /security-review (или Claude с брифом): аутентификация и сессии,
    утечки данных в API-ответах, валидация ввода и инъекции, зависимости с CVE;
  • человеческое ревью для всего, что трогает аутентификацию, секреты, данные.
Разовое напоминание за сессию, не блок. Зона уже отревьюена — заверши как есть.
(Зоны срабатывания — .claude/security-paths.txt; подстраивается под проект.)"

if declare -f stop_context >/dev/null 2>&1 && stop_context "$MSG"; then
  exit 0
fi
printf '%s\n' "$MSG" >&2
exit 2
