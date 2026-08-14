#!/usr/bin/env bash
# =============================================================================
# usage_check.sh — расход подписки Max x5 относительно 5h/недельного окна.
# НЕ про доллары (у тебя подписка, не API) — про то, не упрёшься ли в лимит.
#
# Колесо не изобретаем: используем ccusage (парсит локальные JSONL Claude Code).
# Скрипт — тонкая обёртка: показывает текущее 5h-окно, дневной и недельный
# расход, и предупреждает о факторах, ускоряющих слив.
#
# Использование:
#   bash .claude/scripts/usage_check.sh            # сводка сейчас
#   bash .claude/scripts/usage_check.sh --blocks   # детально по 5h-окнам
#   bash .claude/scripts/usage_check.sh --week      # за неделю
#
# Встроенные альтернативы (без установки): в самой сессии Claude Code набери
#   /usage   — статус лимитов     /cost — расход текущей сессии
# =============================================================================

set -uo pipefail

# ccusage запускается через npx без установки.
run_ccusage() { npx -y ccusage@latest "$@" 2>/dev/null; }

if ! command -v npx >/dev/null 2>&1; then
  echo "npx не найден (нужен Node). Без него используй встроенные /usage и /cost в сессии Claude Code."
  exit 0
fi

MODE="${1:-summary}"

echo "=== Расход подписки (Max x5): $(date '+%Y-%m-%d %H:%M') ==="
echo

case "$MODE" in
  --blocks)
    echo "5-часовые окна (blocks):"
    run_ccusage blocks
    ;;
  --week)
    echo "За последние 7 дней (daily):"
    run_ccusage daily --since "$(date -d '7 days ago' '+%Y%m%d' 2>/dev/null || date -v-7d '+%Y%m%d')"
    ;;
  *)
    echo "Текущее 5-часовое окно:"
    run_ccusage blocks --active 2>/dev/null || run_ccusage blocks | tail -5
    echo
    echo "Сегодня по проектам:"
    run_ccusage --instances 2>/dev/null | tail -15 || run_ccusage daily | tail -5
    ;;
esac

cat <<'NOTE'

──────────────────────────────────────────────
Что ускоряет слив 5h-окна (помни):
  • Пиковые часы (будни 5–11 PT / 13–19 GMT) — окно тает быстрее.
  • Opus с контекстом 1M шлёт огромный payload на КАЖДЫЙ запрос — даже
    на мелочь. Если не нужен 1M — переключись на 200K-вариант.
  • Лимит ~50 сессий/мес: сессия = 5h-сегмент с первого сообщения.
Экономия: держи CLAUDE.md/playbook стабильными (кэш), не грузи лишние
файлы (прогрессивное раскрытие), мелкие задачи — на Haiku/Sonnet.
──────────────────────────────────────────────
NOTE
