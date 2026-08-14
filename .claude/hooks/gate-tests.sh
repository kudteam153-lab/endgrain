#!/usr/bin/env bash
# =============================================================================
# gate-tests.sh
# Событие: Stop (когда Claude считает, что закончил отвечать)
# Назначение: не дать завершить ход, пока тесты красные. Материализует
#   Definition of Done и принцип test-first. Exit 2 заставляет Claude
#   продолжить работу (починить тесты), а не остановиться на «готово».
# OPT-IN: по умолчанию выключен. Включается так — положи команду тестов
#   в .claude/test-command.txt, например:
#       pytest -q                 (VPN-бот, бэкенды)
#       ./gradlew testDebugUnitTest --quiet   (FamyFlow)
#       npm test --silent         (Detailbase)
#   Нет файла или он пустой → хук ничего не делает (exit 0).
# Защита от цикла: если Claude уже остановлен Stop-хуком (stop_hook_active),
#   выходим с 0, чтобы не зациклиться.
# Exit: 2 — тесты упали (Claude продолжит чинить); 0 — иначе.
# =============================================================================

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
TEST_CMD_FILE="$PROJECT_DIR/.claude/test-command.txt"

# Реальный python в обход WindowsApps-заглушки (см. LESSONS «Хук с exit 0 =
# молчаливый отказ»). При сбое парсер вернёт "false" — гейт отработает как обычно.
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
[ -f "$TEST_CMD_FILE" ] || exit 0
TEST_CMD="$(grep -v '^[[:space:]]*#' "$TEST_CMD_FILE" | sed '/^[[:space:]]*$/d' | head -1)"
[ -z "$TEST_CMD" ] && exit 0

cd "$PROJECT_DIR" 2>/dev/null || exit 0

if ! eval "$TEST_CMD" >/tmp/claude_test_out 2>&1; then
  echo "🔴 Тесты не прошли — задача не считается завершённой (Definition of Done)." >&2
  echo "   Команда: $TEST_CMD" >&2
  echo "   Последние строки вывода:" >&2
  tail -25 /tmp/claude_test_out >&2
  echo "   Почини тесты и заверши ход заново." >&2
  exit 2
fi

exit 0
