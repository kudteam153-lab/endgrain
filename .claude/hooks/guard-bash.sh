#!/usr/bin/env bash
# =============================================================================
# guard-bash.sh
# Событие: PreToolUse, matcher Bash
# Назначение: предохранитель против деструктивных команд. У соло-разработчика
#   нет второй пары глаз перед выполнением bash; для коммерческого VPN и
#   Detailbase (боевые БД, инфра на Oracle Cloud) цена ошибки высокая.
# Решение: permissionDecision "deny" с причиной (exit 0). Без python — exit 2.
# Зависимости: python3, grep.
# Настройка: список паттернов ниже. Дополняй под свою инфру.
# =============================================================================

set -uo pipefail

# Реальный python в обход WindowsApps-заглушки. КРИТИЧНО для этого хука: если
# python3 резолвится в сломанную 0-байтную заглушку, CMD пустеет и предохранитель
# молча пропускает rm -rf / DROP / force-push, оставаясь на вид включённым.
# См. LESSONS «Хук с exit 0 = молчаливый отказ».
. "$(dirname "${BASH_SOURCE[0]}")/_lib.sh" 2>/dev/null || true
declare -f resolve_py >/dev/null 2>&1 && resolve_py || PY_BIN="python3"

CMD="$(PYTHONUTF8=1 "$PY_BIN" -c '
import sys, json
try:
    d = json.load(sys.stdin)
    print((d.get("tool_input", {}) or {}).get("command", ""))
except Exception:
    print("")
' 2>/dev/null)"

# Пустой CMD = либо вызов без команды, либо сломанный парсер. Не блокируем (иначе
# одна поломка остановит всю работу), но если python не найден — предохранитель
# фактически снят, и это должно быть видно, а не проглочено.
if [ -z "$CMD" ]; then
  command -v "$PY_BIN" >/dev/null 2>&1 || \
    echo "⚠ guard-bash: python не найден ($PY_BIN) — предохранитель bash НЕ активен." >&2
  exit 0
fi

# Отказ отдаём решением, а не кодом возврата: причина тогда попадает в диалог
# разрешений и в транскрипт, а не только в stderr, куда никто не смотрит.
# Если python недоступен — падаем на прежний exit 2: предохранитель обязан
# сработать даже без интерпретатора, пусть и молча.
block() {
  REASON="$1" CMD="$CMD" PYTHONUTF8=1 "$PY_BIN" -c '
import json, os, sys
sys.stdout.write(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason":
            "Заблокировано предохранителем guard-bash: " + os.environ["REASON"]
            + ".\nКоманда: " + os.environ["CMD"]
            + "\nЕсли она действительно нужна — Антон выполняет её вручную.",
    }
}, ensure_ascii=False))
' 2>/dev/null && exit 0

  echo "⛔ Команда заблокирована предохранителем (guard-bash):" >&2
  echo "   $CMD" >&2
  echo "   Причина: $1" >&2
  echo "   Если команда действительно нужна — Антон выполняет её вручную." >&2
  exit 2
}

# Сопоставление — встроенным [[ =~ ]], БЕЗ форков. Раньше здесь стояло десять
# пар `echo "$CMD" | grep -Eq …` = 20 процессов на каждый вызов Bash. На Windows
# форк в git-bash ~95 мс, и хук отваливался по таймауту (в логах 10 отмен
# PreToolUse:Bash) — то есть предохранитель молча снимался. Не возвращать пайпы.
# nocasematch нужен для SQL: DROP/drop/Drop.
shopt -s nocasematch

m() { [[ $CMD =~ $1 ]]; }   # 0 = совпало

# --- деструктивная работа с ФС ---------------------------------------------
# `/\*?` — покрывает и `rm -rf /`, и `rm -rf /*` (второй случай старый паттерн
# пропускал: после `/` шла `*`, а он требовал пробел или конец строки).
# Конкретные абсолютные пути (`rm -rf /var/tmp/build`) НЕ блокируются намеренно.
m 'rm[[:space:]]+(-[a-zA-Z]*[rf][a-zA-Z]*[[:space:]]+)+(/\*?|~|\$HOME|\*)([[:space:]]|$)' \
  && block "рекурсивное удаление корня/домашней/маски"
m '(^|[^[:alnum:]])mkfs([^[:alnum:]]|$)' \
  && block "форматирование файловой системы (mkfs)"
m '(^|[^[:alnum:]])dd[[:space:]].*of=/dev/' \
  && block "запись блочного устройства (dd of=/dev/…)"
m '>[[:space:]]*/dev/(sd|nvme|disk)' \
  && block "перезапись блочного устройства"
m ':\(\)\{.*\|.*&.*\};:' \
  && block "fork-бомба"

# --- git: разрушительное над основными ветками -----------------------------
# reset --hard / clean -fd / checkout -- . здесь БОЛЬШЕ НЕТ: с Claude Code
# 2.1.183 их блокирует сам auto-mode, пока не попрошено явно. Дубль убран
# 2026-07-26 (спека §3.6). Force-push auto-mode не покрывает — остаётся.
m 'git[[:space:]]+push[[:space:]].*(--force|--force-with-lease|-f)([[:space:]]|$).*(main|master|production|prod)([[:space:]]|$)' \
  && block "force-push в защищённую ветку"

# --- базы данных -----------------------------------------------------------
m '(DROP|TRUNCATE)[[:space:]]+(TABLE|DATABASE|SCHEMA)([^[:alnum:]]|$)' \
  && block "разрушительная SQL-операция (DROP/TRUNCATE)"
m 'DELETE[[:space:]]+FROM[[:space:]]+[a-zA-Z_."]+[[:space:]]*;' \
  && block "DELETE без WHERE (удаление всей таблицы)"

# --- секреты / боевые конфиги ----------------------------------------------
m '>[[:space:]]*\.env(\.production|\.prod)?([[:space:]]|$)' \
  && block "перезапись .env (риск затереть боевые секреты)"

# --- docker/инфра ----------------------------------------------------------
m 'docker[[:space:]]+system[[:space:]]+prune[[:space:]].*(-a|--all)([[:space:]]|$)' \
  && block "docker system prune -a (снос всех образов/томов)"

exit 0
