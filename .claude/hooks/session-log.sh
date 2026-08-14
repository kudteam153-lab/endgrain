#!/usr/bin/env bash
# =============================================================================
# session-log.sh
# Событие: SessionEnd (async — в фоне, не блокирует завершение)
# Назначение: страховочная сетка + авто-наполнение журнала памяти.
#   (1) Пер-проектный след: ручное обновление CHECKPOINT §8 — единственная
#       точка отказа непрерывности. Этот хук дописывает «что реально
#       происходило» за сессию (ветка, коммиты, незакоммиченное) в
#       .claude/SESSION_LOG.md, даже если CHECKPOINT обновить забыли.
#   (2) Над-проектный журнал: дописывает авто-след сессии в
#       ~/ai-memory/JOURNAL.md (эпизодическая память «что делал и когда»).
#       Только факты из git. Осмысленные итоги/решения агент пишет сам
#       (AGENTS.md §5) или они уже в DECISIONS — хук не выдумывает.
#   PORTFOLIO хук НЕ трогает: статус проекта — смысловой, его вносит агент,
#   не shell вслепую (иначе нарушим «память не выдумывается»).
# Exit: всегда 0.
# Зависимости: git. AI_MEMORY_PATH (по умолч. ~/ai-memory).
# =============================================================================

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

AI_MEMORY="${AI_MEMORY_PATH:-$HOME/ai-memory}"

LOG="$PROJECT_DIR/.claude/SESSION_LOG.md"
TS="$(date '+%Y-%m-%d %H:%M')"
DATE="$(date '+%Y-%m-%d')"
TIME="$(date '+%H:%M')"

# Имя проекта — подпись записи в сквозном JOURNAL, поэтому оно обязано быть
# устойчивым и уникальным по всему портфелю.
#
# Раньше бралось голое `basename` git-корня. Это сломалось на переезде, когда
# каталоги переименовали: `Vacuum_Pro` → `vacuum-pro/code`, `detailbase-app` →
# `detailbase/app`. Записи стали подписываться `code` и `app` — в сквозном
# журнале неразличимо, а `detailbase/vault` и `vacuum-pro/vault` дали вообще
# одно имя на двоих. Плюс разрыв истории: старые записи по проекту больше не
# находятся, и SINCE ниже каждый раз откатывается на сутки.
#
# Поэтому имя объявляется явно — .claude/project-name.txt, местный файл, как
# test-command.txt. Он же держит преемственность с историей журнала, где проект
# уже подписан прежним именем.
PROJECT_NAME=""
NAME_FILE="$PROJECT_DIR/.claude/project-name.txt"
if [ -f "$NAME_FILE" ]; then
  PROJECT_NAME="$(grep -vE '^\s*(#|$)' "$NAME_FILE" 2>/dev/null | head -1 | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
fi

if [ -z "$PROJECT_NAME" ]; then
  PROJECT_NAME="$(git rev-parse --show-toplevel 2>/dev/null | xargs -r basename 2>/dev/null)"
  [ -z "$PROJECT_NAME" ] && PROJECT_NAME="$(basename "$PROJECT_DIR")"
  # Файла нет — не подписываем запись служебным именем каталога. Такие имена
  # встречаются в разных проектах сразу, и в сквозном журнале это склеивает
  # чужую работу. Берём с родителем: detailbase/app -> detailbase-app.
  case "$PROJECT_NAME" in
    app|code|vault|src|backend|frontend|client|server|web|api|bot|core|main|repo|project)
      _root="$(git rev-parse --show-toplevel 2>/dev/null || printf '%s' "$PROJECT_DIR")"
      _parent="$(basename "$(dirname "$_root")" 2>/dev/null)"
      [ -n "$_parent" ] && [ "$_parent" != "/" ] && [ "$_parent" != "." ] \
        && PROJECT_NAME="${_parent}-${PROJECT_NAME}"
      ;;
  esac
fi

# Сводка фактов сессии из git (используется в обоих журналах).
#
# КОММИТЫ СЕССИИ, а не последние пять. Раньше стояло `git log --oneline -5` —
# последние пять коммитов РЕПОЗИТОРИЯ. Из-за этого запись «2026-07-25 · сделано:
# …» перечисляла работу, сделанную 21 июля и раньше: соседние записи по
# FamFlowClaude делили 4 коммита из 5. Журнал приписывал работу не тем датам —
# то есть нарушал инвариант «не выдумывать память», выдумывая не текст, а
# атрибуцию. Теперь берём только то, что закоммичено ПОСЛЕ прошлой записи.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  BRANCH="$(git branch --show-current 2>/dev/null)"

  # Опора — время последней авто-записи по этому проекту в JOURNAL. Нет журнала
  # или записи — берём сутки назад: разумная граница одной рабочей сессии.
  SINCE=""
  JRN="$AI_MEMORY/JOURNAL.md"
  # Имя приходит из файла и может содержать спецсимволы ERE (точку, плюс,
  # скобки). В шаблон поиска оно идёт экранированным, иначе `Mimic_app+` или
  # `v1.2` совпадут не с тем и SINCE молча уедет на сутки назад.
  PROJECT_NAME_RE="$(printf '%s' "$PROJECT_NAME" | sed -E 's/[][\.*^$+?(){}|\\]/\\&/g')"
  if [ -f "$JRN" ]; then
    SINCE="$(grep -oE "^## [0-9]{4}-[0-9]{2}-[0-9]{2} · ${PROJECT_NAME_RE} · авто-след сессии \([0-9]{2}:[0-9]{2}\)" "$JRN" 2>/dev/null \
             | tail -1 | sed -E 's/^## ([0-9-]+) .*\(([0-9:]+)\)$/\1 \2/')"
  fi
  [ -z "$SINCE" ] && SINCE="24 hours ago"

  COMMITS_N="$(git log --oneline --since="$SINCE" 2>/dev/null | wc -l | tr -d ' ')"
  # В строку — не больше 8 коммитов: журнал читают глазами. Счётчик выше честный,
  # остальное всегда доступно через `git log` в самом репозитории.
  COMMITS="$(git log --oneline --since="$SINCE" 2>/dev/null | head -8 | tr '\n' ';')"
  [ "${COMMITS_N:-0}" -gt 8 ] && COMMITS="${COMMITS} …и ещё $((COMMITS_N - 8))"

  DIRTY_RAW="$(git status --short 2>/dev/null | head -20)"
  if [ -n "$DIRTY_RAW" ]; then DIRTY_FLAG="да"; else DIRTY_FLAG="нет"; fi
else
  BRANCH=""; COMMITS=""; COMMITS_N=0; DIRTY_RAW=""; DIRTY_FLAG="—"
fi

# --- отпечаток сессии: защита от дублей ------------------------------------
# SessionEnd срабатывает по нескольку раз за сессию (clear, выход, и т.д.), а хук
# просто дописывал. Итог: в SESSION_LOG 112 заголовков против 49 уникальных,
# одна запись повторялась 9 раз подряд; в JOURNAL — то же. Журнал, где больше
# половины записей — копии, нельзя ни читать, ни переигрывать.
# Пишем только если факты изменились: одинаковый набор (ветка/коммиты/грязь) —
# значит с прошлого срабатывания ничего нового не произошло, писать нечего.
fingerprint() {
  if command -v md5sum >/dev/null 2>&1; then
    printf '%s' "$1" | md5sum | cut -c1-12
  else
    printf '%s' "$1" | cksum | tr -d ' ' | cut -c1-12
  fi
}

# Из отпечатка исключаем сам SESSION_LOG: его дописывает этот же хук, и без
# фильтра первая запись меняла git status → следующее срабатывание считало
# факты новыми и писало ещё раз. Дописанный лог — не работа сессии.
# Фильтруем и `?? .claude/`: для неотслеживаемой папки git печатает её одной
# строкой, без имени файла внутри — по SESSION_LOG.md такую строку не поймать.
DIRTY_FP="$(printf '%s' "$DIRTY_RAW" | grep -vE 'SESSION_LOG\.md|^\?\?[[:space:]]+\.claude/?$' 2>/dev/null)"
if [ -n "$DIRTY_FP" ]; then DIRTY_FP_FLAG="да"; else DIRTY_FP_FLAG="нет"; fi

FP_LOG="$(fingerprint "${BRANCH}|${COMMITS}|${DIRTY_FP}")"
FP_JRN="$(fingerprint "${PROJECT_NAME}|${DATE}|${BRANCH}|${COMMITS}|${DIRTY_FP_FLAG}")"

# --- (1) пер-проектный SESSION_LOG (как раньше) ----------------------------
if [ -f "$LOG" ] && tail -n 60 "$LOG" 2>/dev/null | grep -q "fp:${FP_LOG}"; then
  : # те же факты уже записаны — пропускаем
else
{
  echo ""
  echo "## $TS"
  if [ -n "$BRANCH" ] || [ -n "$COMMITS" ]; then
    echo "- Ветка: ${BRANCH}"
    echo "- Коммиты сессии (последние 5): ${COMMITS}"
    if [ -n "$DIRTY_RAW" ]; then
      echo "- Незакоммичено на момент завершения:"
      echo '```'
      echo "$DIRTY_RAW"
      echo '```'
    else
      echo "- Рабочее дерево чистое."
    fi
  else
    echo "- (не git-репозиторий)"
  fi
  echo "- Напоминание: если задача завершена — обнови CHECKPOINT §8 (next task) и §2.3 (закрыто)."
  echo "<!-- fp:${FP_LOG} -->"
} >> "$LOG" 2>/dev/null
fi

# --- (2) над-проектный JOURNAL (только если папка памяти существует) --------
# Не создаём ai-memory вслепую: если её нет — пропускаем (значит не настроена).
#
# ГЕЙТ ПО КОММИТАМ: сессия без единого коммита не оставляет следа. Раньше
# писалась запись «сделано: <последние 5 коммитов репо>» даже когда за сессию
# не сделано ничего — 41 запись из 44 в JOURNAL были таким пересказом git log.
#
# ДЕДУП по всему файлу, а не по `tail -n 40`: при записи в 5 строк это окно
# покрывало ~7 последних сессий, дальше отпечаток уходил за край и дубль
# проходил. Файл 36 КБ — читать целиком дешевле, чем держать дубли.
#
# ЗАМОК. Одного `printf` НЕ ХВАТИЛО: 28.07 в журнале появились две записи, где
# строки ЧЕРЕДУЮТСЯ («## …» / «## …» / «- Сделано…» / «- Сделано…») с одинаковым
# отпечатком. Два хука писали одновременно: на Windows атомарность дописывания
# не гарантируется так, как в POSIX, а сама проверка «есть ли отпечаток» —
# классическая гонка: оба прочитали файл до того, как кто-то из них записал.
#
# flock в git-bash отсутствует, поэтому замок на `mkdir`: создание каталога
# атомарно на всех ФС, включая NTFS. Держим не дольше 10 с — SessionEnd не
# должен зависать из-за брошенного замка; протухший (>60 с) снимаем силой.
JRN="$AI_MEMORY/JOURNAL.md"
if [ -d "$AI_MEMORY" ] && [ -f "$JRN" ] && [ "${COMMITS_N:-0}" -gt 0 ]; then
  LOCK="$AI_MEMORY/.journal.lock"

  # Снять протухший замок (сессия упала, не убрав за собой).
  if [ -d "$LOCK" ]; then
    LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || stat -f %m "$LOCK" 2>/dev/null || date +%s) ))
    [ "$LOCK_AGE" -gt 60 ] && rmdir "$LOCK" 2>/dev/null
  fi

  GOT_LOCK=""
  for _ in $(seq 1 20); do
    if mkdir "$LOCK" 2>/dev/null; then GOT_LOCK=1; break; fi
    sleep 0.5
  done

  if [ -n "$GOT_LOCK" ]; then
    # Проверку отпечатка делаем ВНУТРИ замка — иначе она бессмысленна.
    if ! grep -q "fp:${FP_JRN}" "$JRN" 2>/dev/null; then
      printf '\n## %s · %s · авто-след сессии (%s)\n- Сделано за сессию (%s коммитов): %s\n- Ветка: %s · незакоммичено: %s\n- _(авто-запись хука; осмысленный итог и решения — отдельной записью агента)_ <!-- fp:%s -->\n' \
        "$DATE" "$PROJECT_NAME" "$TIME" "$COMMITS_N" "$COMMITS" "${BRANCH:-—}" "$DIRTY_FLAG" "$FP_JRN" \
        >> "$JRN" 2>/dev/null
    fi
    rmdir "$LOCK" 2>/dev/null
  fi
  # Замок не взяли за 10 с — запись пропускаем. Потерять авто-след одной
  # сессии дешевле, чем переплести журнал: коммиты всё равно в git.
fi

exit 0
