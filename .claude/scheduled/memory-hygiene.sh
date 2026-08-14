#!/usr/bin/env bash
# =============================================================================
# memory-hygiene.sh — «ночной архивариус» для над-проектной памяти.
# Ставится в cron (рядом с checkpoint-drift.sh; см. .claude/scheduled/README.md).
# НЕ зовёт API (не тратит лимиты) — детерминированные проверки + опц. ротация.
#
# По умолчанию РЕЖИМ ОТЧЁТА (warn-only) — память терять нельзя, поэтому
# ничего не двигаем без явного флага:
#   • свежесть PORTFOLIO.md (давно не обновлялся?)
#   • размер JOURNAL.md (пора ли ротация?)
#   • дубли заголовков записей в JOURNAL
#
# Ротация (флаг --rotate): записи прошлых месяцев выносятся в
#   journal/YYYY-MM.md, в JOURNAL остаётся текущий месяц. Делается бэкап.
#
# Использование:
#   bash memory-hygiene.sh            # отчёт
#   bash memory-hygiene.sh --rotate   # отчёт + ротация старых записей
# Переменные: AI_MEMORY_PATH (=~/ai-memory), HYGIENE_STALE_DAYS (=7),
#   HYGIENE_MAX_LINES (=400).
# Exit: 0.
# =============================================================================

set -uo pipefail

AI_MEMORY="${AI_MEMORY_PATH:-$HOME/ai-memory}"
STALE_DAYS="${HYGIENE_STALE_DAYS:-7}"
MAX_LINES="${HYGIENE_MAX_LINES:-400}"
DO_ROTATE=0
[ "${1:-}" = "--rotate" ] && DO_ROTATE=1

PORTFOLIO="$AI_MEMORY/PORTFOLIO.md"
JOURNAL="$AI_MEMORY/JOURNAL.md"
CUR_MONTH="$(date '+%Y-%m')"

echo "=== $(date '+%Y-%m-%d %H:%M') — гигиена памяти: $AI_MEMORY ==="

if [ ! -d "$AI_MEMORY" ]; then
  echo "Папка памяти не найдена ($AI_MEMORY). Нечего обслуживать."
  echo "=== завершено ==="
  exit 0
fi

# --- свежесть PORTFOLIO ----------------------------------------------------
if [ -f "$PORTFOLIO" ]; then
  if find "$PORTFOLIO" -mtime +"$STALE_DAYS" >/dev/null 2>&1 \
     && [ -n "$(find "$PORTFOLIO" -mtime +"$STALE_DAYS" 2>/dev/null)" ]; then
    echo "⚠️  PORTFOLIO.md не менялся больше ${STALE_DAYS} дн. — проверь актуальность статусов и «эта неделя»."
  else
    echo "PORTFOLIO.md свежий (изменён в пределах ${STALE_DAYS} дн.)."
  fi
else
  echo "⚠️  Нет PORTFOLIO.md."
fi

# --- размер и дубли JOURNAL ------------------------------------------------
if [ -f "$JOURNAL" ]; then
  N_LINES=$(wc -l < "$JOURNAL" | tr -d ' ')
  echo "JOURNAL.md: ${N_LINES} строк (порог ротации: ${MAX_LINES})."

  DUPES="$(grep -E '^## [0-9]{4}-[0-9]{2}-[0-9]{2} ·' "$JOURNAL" 2>/dev/null | sort | uniq -d | head -10)"
  if [ -n "$DUPES" ]; then
    echo "⚠️  Дублирующиеся заголовки записей (проверь вручную):"
    printf '%s\n' "$DUPES" | sed 's/^/    /'
  fi

  if [ "$N_LINES" -ge "$MAX_LINES" ]; then
    if [ "$DO_ROTATE" -eq 1 ]; then
      echo "Ротация: выношу записи не текущего месяца (${CUR_MONTH}) в journal/…"
      mkdir -p "$AI_MEMORY/journal"
      cp "$JOURNAL" "$JOURNAL.bak.$(date '+%Y%m%d%H%M%S')"
      # Разбор по записям «## YYYY-MM-DD …»: прошлый месяц → journal/YYYY-MM.md,
      # текущий месяц + строки до первой записи (шапка) → новый JOURNAL.
      awk -v cur="$CUR_MONTH" -v dir="$AI_MEMORY/journal" '
        function flush(){
          if(buf=="") return
          if(rec_month=="" || rec_month==cur){ printf "%s", buf >> keep }
          else { printf "%s", buf >> (dir "/" rec_month ".md") }
        }
        BEGIN{ keep=ENVIRON["JOURNAL"] ".tmp"; printf "" > keep }
        /^## [0-9]{4}-[0-9]{2}-[0-9]{2}/{
          flush(); buf=""
          rec_month=substr($2,1,7)
        }
        { buf = buf $0 ORS }
        END{ flush() }
      ' "$JOURNAL"
      if [ -f "$JOURNAL.tmp" ]; then
        mv "$JOURNAL.tmp" "$JOURNAL"
        echo "Готово. Бэкап: $JOURNAL.bak.* · архивы: $AI_MEMORY/journal/"
      else
        echo "⚠️  Ротация не выполнена (tmp не создан) — JOURNAL не тронут."
      fi
    else
      echo "⚠️  JOURNAL разросся (${N_LINES} ≥ ${MAX_LINES}). Запусти с --rotate, чтобы вынести прошлые месяцы в journal/YYYY-MM.md."
    fi
  fi
else
  echo "⚠️  Нет JOURNAL.md."
fi

echo "=== завершено ==="
exit 0
