#!/usr/bin/env bash
# =============================================================================
# guard-highrisk.sh
# Событие: PreToolUse (Bash, Edit, Write, MultiEdit)
# Назначение: эскалация вместо блокировки. guard-bash и guard-files говорят
#   «нельзя» грубо-деструктивному; здесь — действия обратимые, но дорогие,
#   где нужно решение Антона, а не запрет.
#
# До 2026-07-26 это был поведенческий инвариант: агент должен был свериться
# с high-risk-actions.txt и остановиться сам. Механизма не было — файл не
# читал никто, кроме скилла grill, и то как справку. Теперь механизируемая
# часть списка (high-risk-patterns.txt) проверяется хуком.
#
# Решение: permissionDecision "ask". С Claude Code 2.1.211 hook-«ask» нельзя
# повысить до «allow» никаким правилом разрешений — эскалация не обходится
# накопленными разрешениями, и в этом весь смысл.
#
# Exit: всегда 0. Нет паттернов, нет python, ничего не совпало — молча пропуск:
# этот хук не предохранитель, ложный отказ здесь дороже пропуска.
# =============================================================================

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$HERE/../.." && pwd)}"
PATTERNS="$PROJECT_DIR/.claude/high-risk-patterns.txt"

[ -f "$PATTERNS" ] || exit 0

. "$HERE/_lib.sh" 2>/dev/null || true
declare -f resolve_py >/dev/null 2>&1 && resolve_py || PY_BIN="python3"

# Тип инструмента, команда и путь — одним разбором: три запуска python на
# каждый вызов Bash съели бы бюджет хука (форк в git-bash ~95 мс).
FIELDS="$(PYTHONUTF8=1 "$PY_BIN" -c '
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get("tool_input", {}) or {}
    print(d.get("tool_name", ""))
    print((ti.get("command", "") or "").replace("\n", " "))
    print(ti.get("file_path", "") or ti.get("notebook_path", "") or "")
except Exception:
    print(""); print(""); print("")
' 2>/dev/null)"

TOOL="$(printf '%s' "$FIELDS" | sed -n 1p)"
CMD="$(printf '%s' "$FIELDS"  | sed -n 2p)"
FILE="$(printf '%s' "$FIELDS" | sed -n 3p)"

[ -n "$TOOL" ] || exit 0

# Путь относительно проекта — правила пишутся в проектных терминах.
REL="${FILE#$PROJECT_DIR/}"

shopt -s nocasematch

ask() {  # ask <категория> <паттерн> <что именно>
  CATEGORY="$1" RULE="$2" SUBJECT="$3" PYTHONUTF8=1 "$PY_BIN" -c '
import json, os, sys
sys.stdout.write(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "ask",
        "permissionDecisionReason":
            "Действие из списка эскалации: " + os.environ["CATEGORY"]
            + "\n" + os.environ["SUBJECT"]
            + "\nСовпало правило .claude/high-risk-patterns.txt: " + os.environ["RULE"]
            + "\nОно обратимо, но дорого — решение за Антоном, не за агентом.",
    }
}, ensure_ascii=False))
' 2>/dev/null
  exit 0
}

while IFS= read -r line || [ -n "$line" ]; do
  line="${line%%#*}"
  line="${line#"${line%%[![:space:]]*}"}"
  [ -z "$line" ] && continue

  # Разделитель полей — «::», а не «|»: вертикальная черта есть внутри самих
  # регулярных выражений (альтернация), и правило про kubectl рвалось пополам —
  # хвост альтернации уезжал в поле-исключение, а само правило переставало
  # срабатывать. Молча: ложный пропуск, а не ошибка разбора.
  category="${line%%::*}"; rest="${line#*::}"
  kind="${rest%%::*}";     rest="${rest#*::}"
  # Четвёртое поле необязательное: паттерн-исключение. ERE не умеет
  # отрицательный просмотр вперёд, а без него правило на «UPDATE … SET … ;»
  # эскалирует и обычный UPDATE с WHERE — то есть почти каждый.
  if [ "$rest" != "${rest#*::}" ]; then
    pattern="${rest%%::*}"; except="${rest#*::}"
  else
    pattern="$rest"; except=""
  fi

  # trim без форков — как в guard-files: на длинном списке форки съедали таймаут
  category="${category%"${category##*[![:space:]]}"}"
  kind="${kind#"${kind%%[![:space:]]*}"}"; kind="${kind%"${kind##*[![:space:]]}"}"
  pattern="${pattern#"${pattern%%[![:space:]]*}"}"; pattern="${pattern%"${pattern##*[![:space:]]}"}"
  except="${except#"${except%%[![:space:]]*}"}"; except="${except%"${except##*[![:space:]]}"}"
  [ -z "$pattern" ] && continue

  case "$kind" in
    bash)
      [ "$TOOL" = "Bash" ] || continue
      [ -n "$CMD" ] || continue
      [ -n "$except" ] && [[ $CMD =~ $except ]] && continue
      [[ $CMD =~ $pattern ]] && ask "$category" "$pattern" "Команда: $CMD"
      ;;
    path)
      [ -n "$FILE" ] || continue
      # shellcheck disable=SC2254
      if [ -n "$except" ]; then
        case "$REL" in $except|*/$except) continue ;; esac
      fi
      # shellcheck disable=SC2254
      case "$REL" in
        $pattern|*/$pattern) ask "$category" "$pattern" "Файл: $REL" ;;
      esac
      ;;
  esac
done < "$PATTERNS"

exit 0
