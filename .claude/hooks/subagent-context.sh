#!/usr/bin/env bash
# =============================================================================
# subagent-context.sh — сообщает субагенту раскладку канона проекта.
# Событие: SubagentStart (без matcher — нужно всем типам субагентов).
#
# Зачем отдельный хук: SessionStart кладёт автоконтекст в основную сессию, но
# субагент стартует со своим контекстом и этого блока не видит. Из-за этого
# code-reviewer и security-reviewer в detailbase получали инструкцию «прочитай
# CORE_PRINCIPLES.md», которой в корне репозитория нет — и либо шли мимо канона,
# либо заводили файл заново. Лечилось проектными копиями агентов с зашитыми
# путями; они и составили 12 из 13 исключений синхронизации.
#
# Теперь путь приходит извне, а компоненты во всех проектах одинаковые.
#
# Вывод — по документации hooks: hookSpecificOutput с hookEventName и
# additionalContext. Сообщать нечего (канон в корне, project-context.md нет) —
# молча exit 0: пустой блок дороже тишины, он занимает контекст субагента.
# =============================================================================
set -u

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

. "$(dirname "${BASH_SOURCE[0]}")/_lib.sh" 2>/dev/null || true
declare -f canon_block >/dev/null 2>&1 || exit 0
declare -f resolve_py  >/dev/null 2>&1 && resolve_py || PY_BIN="python3"

BLOCK="$(canon_block)"
[ -n "$BLOCK" ] || exit 0

# Экранирование через python, а не printf: в блоке кавычки, обратные слеши и
# кириллица — ручная сборка JSON тут ломается тихо и выдаёт битый вывод.
#
# Блок передаётся файлом, а не через stdin: heredoc со скриптом сам занимает
# stdin, и `printf | python - <<PY` молча отдаёт пустой текст.
PAYLOAD="$(mktemp 2>/dev/null || printf '%s' "${TMPDIR:-/tmp}/sac_$$")"
printf '%s' "$BLOCK" > "$PAYLOAD"

OUT="$(PYTHONUTF8=1 "$PY_BIN" - "$PAYLOAD" 2>/dev/null <<'PY'
import io, json, sys
with io.open(sys.argv[1], encoding='utf-8') as fh:
    text = fh.read()
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "SubagentStart",
        "additionalContext": "=== РАСКЛАДКА ПРОЕКТА (собрано хуком) ===\n" + text,
    }
}, ensure_ascii=False))
PY
)"

# Отказ должен быть слышным: без этого субагент пошёл бы искать канон в корне,
# где его нет, и это выглядело бы как его собственная ошибка.
if [ -n "$OUT" ]; then
  printf '%s\n' "$OUT"
else
  printf '{"hookSpecificOutput": {"hookEventName": "SubagentStart", "additionalContext": "Хук subagent-context.sh не смог собрать раскладку проекта. Канон может лежать не в корне — проверь DOCS_ROOT в .claude/settings.json, прежде чем считать файл отсутствующим."}}\n'
fi

rm -f "$PAYLOAD" 2>/dev/null

exit 0
