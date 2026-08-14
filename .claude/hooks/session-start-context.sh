#!/usr/bin/env bash
# =============================================================================
# session-start-context.sh
# Событие: SessionStart (раз в начале каждого чата)
# Назначение: автоматически положить в контекст агента текущее состояние —
#   ещё до первой реплики Антона: портфель всех проектов, цель текущего
#   проекта, состояние репо, следующая микро-задача, долги, и уроки
#   (проектные + портфельные практики/грабли — чтобы не повторять ошибки и
#   применять найденное).
# Вывод: JSON {"hookSpecificOutput": {"hookEventName": "SessionStart",
#   "additionalContext": "..."}} в stdout. Голый {"additionalContext": …} —
#   валидный JSON, exit 0, и контекст молча теряется (LESSONS «Хук отдаёт
#   контекст в устаревшей схеме»). Обёртку не снимать.
# Exit: всегда 0 (информационный хук, ничего не блокирует). Ненулевой код здесь
#   бесполезен: для SessionStart stderr идёт ТОЛЬКО пользователю, агент его не
#   видит (docs → «Exit code 2 behavior»: shows stderr to user only).
# Зависимости: git, python3.
# Память: путь к ai-memory задаётся переменной AI_MEMORY_PATH.
#   Windows (git-bash): D:\ai-memory  ->  AI_MEMORY_PATH=/d/ai-memory
#   (удобно прописать в .claude/settings.json блок "env" или в ~/.bashrc).
# =============================================================================

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Каталог хуков резолвим АБСОЛЮТНО и ДО cd. Раньше он вычислялся ниже, у самой
# канарейки, обычным dirname — то есть относительным путём, уже после смены
# каталога. При вызове хука относительным путём (`bash .claude/hooks/…` — ровно
# то, что даёт fallback `${CLAUDE_PROJECT_DIR:-.}`) путь после cd переставал
# резолвиться, probe не находил guard-files.sh и печатал «НЕТ ФАЙЛА», а канарейка
# — «ОТКАЗ, правки проходят без проверки» на полностью исправной защите.
# Ложная тревога здесь хуже молчания: она приучает не верить канарейке, и
# настоящий отказ тонет в шуме. Не переносить обратно вниз и не делать
# относительным.
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"

cd "$PROJECT_DIR" 2>/dev/null || exit 0

# Глобальная над-проектная память (портфель + журнал + уроки).
# На Windows указывать в git-bash-форме: /d/ai-memory (для D:\ai-memory).
AI_MEMORY="${AI_MEMORY_PATH:-$HOME/ai-memory}"

# --- где лежит канон проекта --------------------------------------------------
# Сам блок собирает canon_block из _lib.sh: тот же текст нужен субагентам,
# которые SessionStart не видят (subagent-context.sh на SubagentStart).
. "$(dirname "${BASH_SOURCE[0]}")/_lib.sh" 2>/dev/null || true
DOCS_BLOCK=""
declare -f canon_block >/dev/null 2>&1 && DOCS_BLOCK="$(canon_block)"

# --- поиск артефакта, когда его нет в корне --------------------------------
# Раньше был `find ... | head -1`: при нескольких кандидатах брался произвольный.
# В папке с подпроектами это подставляло ЧУЖОЙ GOAL/CHECKPOINT как рамку сессии —
# хуже пустого слота, потому что выглядит уверенно. Теперь: ровно один кандидат —
# берём; несколько — не берём ни одного и сообщаем о неоднозначности.
#
# PRUNE: без него find заходил в node_modules/.git/build, и хук упирался в
# таймаут SessionStart — 4 отмены в логах, из них startup 25.07: та сессия
# стартовала вслепую, без портфеля и уроков. Каталоги ниже артефактов пакета
# не содержат по определению, обходить их незачем.
AMBIG=""
PRUNE=( -name node_modules -o -name .git -o -name .venv -o -name venv
        -o -name build -o -name dist -o -name .gradle -o -name __pycache__
        -o -name .next -o -name target -o -name .pw-profile )

pick_unique() {
  local depth="$1" name="$2" hits n
  hits="$(find . \( "${PRUNE[@]}" \) -prune -o -maxdepth "$depth" -name "$name" -print 2>/dev/null)"
  [ -z "$hits" ] && return 0
  n="$(printf '%s\n' "$hits" | wc -l | tr -d ' ')"
  if [ "$n" -gt 1 ]; then
    AMBIG="${AMBIG}${AMBIG:+
}- ${name}: кандидатов ${n}, ни один не взят (положи файл в корень проекта или задай путь переменной)"
    return 0
  fi
  printf '%s' "$hits"
}

# Путь к чек-пойнту можно переопределить переменной CHECKPOINT_PATH.
CHECKPOINT="${CHECKPOINT_PATH:-CHECKPOINT_CURRENT.md}"
[ -f "$CHECKPOINT" ] || CHECKPOINT="$(pick_unique 3 'CHECKPOINT_CURRENT.md')"

# Цель текущего проекта (immutable якорь) — ТОЛЬКО из корня или GOAL_PATH.
# Вглубь не ищем принципиально: GOAL.md в подпапке принадлежит ДРУГОМУ проекту,
# и подстановка его как «цели текущего» задаёт сессии заведомо ложную рамку.
# Так в мастерской целью объявлялся GOAL случайного подпроекта.
GOAL="${GOAL_PATH:-$PROJECT_DIR/GOAL.md}"
if [ ! -f "$GOAL" ]; then
  GOAL=""
  NESTED="$(find . \( "${PRUNE[@]}" \) -prune -o -mindepth 2 -maxdepth 3 -name 'GOAL.md' -print 2>/dev/null | head -5)"
  if [ -n "$NESTED" ]; then
    AMBIG="${AMBIG}${AMBIG:+
}- GOAL.md: в корне нет, во вложенных папках есть — это цели ДРУГИХ проектов, ни одна не взята"
  fi
fi

# --- git-состояние (только если это git-репозиторий) ----------------------
GIT_BLOCK=""
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  BRANCH="$(git branch --show-current 2>/dev/null)"
  COMMITS="$(git log --oneline -5 2>/dev/null)"
  DIRTY="$(git status --short 2>/dev/null | head -20)"
  [ -z "$DIRTY" ] && DIRTY="(рабочее дерево чистое)"
  GIT_BLOCK="Ветка: ${BRANCH}
Последние коммиты:
${COMMITS}
Незакоммиченные изменения:
${DIRTY}"
else
  GIT_BLOCK="(не git-репозиторий)"
fi

# --- извлечение секции «## N. ...» из CHECKPOINT (нумерованные заголовки) ---
extract_section() {
  local n="$1" next=$(( $1 + 1 ))
  awk -v a="^## ${n}\\\. " -v b="^## ${next}\\\. " '
    $0 ~ a {flag=1}
    $0 ~ b {flag=0}
    flag {print}
  ' "$CHECKPOINT" 2>/dev/null
}

# --- извлечение markdown-секции по заголовку «## Заголовок» до следующего «## » ---
extract_md_section() {
  local file="$1" title="$2"
  [ -f "$file" ] || return 0
  awk -v t="^## ${title}[[:space:]]*$" '
    $0 ~ t {flag=1; next}
    /^## / {flag=0}
    flag {print}
  ' "$file" 2>/dev/null
}

NEXT_TASK="(CHECKPOINT_CURRENT.md не найден — агент должен запросить состояние)"
DEBT=""
# Блоки кэпятся: автоконтекст — лёгкая отправная точка, не весь реестр
# (CLAUDE.md §4.6). Полный §7/§8 — в самом CHECKPOINT_CURRENT.md.
#
# Кэп ДВОЙНОЙ — по строкам И по символам. Только строчного не хватало: в
# detailbase-app CHECKPOINT_CURRENT.md весит 597 КБ при 506 строках (строки §8
# в среднем по 2 279 символов — широкие таблицы). 60 строк давали 137 КБ, и в
# каждую сессию самого нагруженного проекта уезжало ~34 000 токенов
# автоконтекста. Обнаружено 2026-07-26 при замере хука.
CAP_NEXT="${CTX_CAP_NEXT:-60}"
CAP_DEBT="${CTX_CAP_DEBT:-40}"
CAP_NEXT_CH="${CTX_CAP_NEXT_CHARS:-4000}"
CAP_DEBT_CH="${CTX_CAP_DEBT_CHARS:-3000}"

# clip <строк> <символов> — режет stdin и честно помечает обрезку.
clip() {
  local ln="$1" ch="$2" full cut
  full="$(cat)"
  cut="$(printf '%s' "$full" | head -n "$ln" | head -c "$ch")"
  if [ "${#cut}" -lt "${#full}" ]; then
    printf '%s\n\n[…обрезано: показано %s из %s символов. Полный раздел — в самом CHECKPOINT_CURRENT.md, прочитай его, если нужен весь список]' \
      "$cut" "${#cut}" "${#full}"
  else
    printf '%s' "$cut"
  fi
}

if [ -n "$CHECKPOINT" ] && [ -f "$CHECKPOINT" ]; then
  NT="$(extract_section 8 | clip "$CAP_NEXT" "$CAP_NEXT_CH")"
  [ -n "$NT" ] && NEXT_TASK="$NT"
  DEBT="$(extract_section 7 | clip "$CAP_DEBT" "$CAP_DEBT_CH")"
fi

# --- цель проекта: «## Цель» + «## Acceptance» из GOAL.md -------------------
GOAL_BLOCK=""
if [ -n "$GOAL" ] && [ -f "$GOAL" ]; then
  G_GOAL="$(extract_md_section "$GOAL" "Цель")"
  G_ACC="$(extract_md_section "$GOAL" "Acceptance — проверяемые критерии «готово»")"
  [ -z "$G_ACC" ] && G_ACC="$(extract_md_section "$GOAL" "Acceptance")"
  GOAL_BLOCK="$(printf '%s\n\nAcceptance:\n%s' "$G_GOAL" "$G_ACC")"
fi

# --- портфель: «## Проекты» + «## Эта неделя» из ai-memory/PORTFOLIO.md -----
PORTFOLIO=""
PFILE="$AI_MEMORY/PORTFOLIO.md"
if [ -f "$PFILE" ]; then
  P_PROJ="$(extract_md_section "$PFILE" "Проекты")"
  P_WEEK="$(extract_md_section "$PFILE" "Эта неделя")"
  PORTFOLIO="$(printf 'Проекты:\n%s\n\nЭта неделя:\n%s' "$P_PROJ" "$P_WEEK")"
fi

# --- заголовки активных уроков ПРОЕКТА из LESSONS.md (напоминание) ---------
LESSONS=""
LFILE="${LESSONS_PATH:-LESSONS.md}"
[ -f "$LFILE" ] || LFILE="$(pick_unique 3 'LESSONS.md')"
if [ -n "$LFILE" ] && [ -f "$LFILE" ]; then
  LESSONS="$(awk '
    /^## Активные уроки/{f=1; next}
    /^## Архив/{f=0}
    f && /^### /{sub(/^### /,""); print "- " $0}
  ' "$LFILE" 2>/dev/null | head -8)"
fi

# --- заголовки активных фактов из FACTS.md (память: доверяем первой) --------
FACTS=""
FFILE="${FACTS_PATH:-FACTS.md}"
[ -f "$FFILE" ] || FFILE="$(pick_unique 3 'FACTS.md')"
if [ -n "$FFILE" ] && [ -f "$FFILE" ]; then
  FACTS="$(awk '
    /^## Активные факты/{f=1; next}
    /^## Архив/{f=0}
    f && /^### /{sub(/^### /,""); sub(/ *\{#[^}]*\}[[:space:]]*$/,""); print "- " $0}
  ' "$FFILE" 2>/dev/null | head -10)"
fi

# --- КАНАРЕЙКА: живы ли предохранители -------------------------------------
# Проверяем не «настроен ли хук», а РЕАЛЬНО ЛИ ОН БЛОКИРУЕТ, и сколько тратит.
# Причина: guard-files.sh полгода работал 12,8 с при таймауте 10 с — отваливался
# всегда, правка проходила (fail-open), и это было видно только в jsonl, куда
# никто не смотрит. 174 отмены накопились незамеченными. Теперь отказ виден в
# первой же реплике сессии.
# Стоимость: два прогона предохранителей на старте (~0,5 с), один раз за сессию.
CANARY=""
# HOOK_DIR резолвится в начале файла, до cd — см. комментарий там.
# У предохранителя ДВА способа сказать «блокирую», и сверять надо оба, иначе
# канарейка кричит «ОТКАЗ» на исправной защите — а такой шум страшнее молчания:
# настоящий отказ становится неотличим от ложного. Основной способ (см. шапки
# guard-files.sh / guard-bash.sh): решение `permissionDecision: deny` в stdout
# при exit 0 — так причина попадает в диалог разрешений и транскрипт. Код 2 —
# legacy-fallback на случай, когда нет python и JSON собрать нечем.
probe() {  # probe <имя> <скрипт> <json> <ожидаемый_код>
  local name="$1" script="$2" json="$3" want="$4" t0 t1 rc ms out
  [ -f "$script" ] || { printf '%s: НЕТ ФАЙЛА' "$name"; return; }
  t0=$(date +%s%N 2>/dev/null || echo 0)
  out="$(printf '%s' "$json" | CLAUDE_PROJECT_DIR="$PROJECT_DIR" bash "$script" 2>/dev/null)"
  rc=$?
  t1=$(date +%s%N 2>/dev/null || echo 0)
  ms=$(( (t1 - t0) / 1000000 ))
  if [ "$rc" = "$want" ] || printf '%s' "$out" | grep -q '"permissionDecision"[[:space:]]*:[[:space:]]*"deny"'; then
    printf '%s %sмс OK' "$name" "$ms"
  else
    printf '%s %sмс ⛔НЕ БЛОКИРУЕТ (код %s, ждали %s или deny в решении)' "$name" "$ms" "$rc" "$want"
  fi
}
# Пробуем НЕ фиксированный GOAL.md, а первое реальное правило из списка проекта:
# списки различаются между проектами, и проба по чужому пути дала бы ложную
# тревогу. Пустой список — отдельный диагноз, а не «отказ»: хук исправен, но
# защищать ему нечего (так в detailbase-app: все строки закомментированы, то
# есть в самом нагруженном проекте не защищены ни GOAL, ни боевой .env).
PP="$PROJECT_DIR/.claude/protected-paths.txt"
if [ -f "$PP" ]; then
  # Комментарий срезаем ДО трима: правила пишутся с пояснением на той же строке
  # («GOAL.md    # цель проекта»), и `tr -d [:space:]` его бы не убрал — проба
  # уходила бы по несуществующему пути и канарейка кричала бы впустую.
  FIRST_RULE="$(grep -vE '^[[:space:]]*(#|$)' "$PP" 2>/dev/null | head -1 \
                | sed 's/#.*//' | tr -d '[:space:]')"
  if [ -z "$FIRST_RULE" ]; then
    CANARY="guard-files: список protected-paths ПУСТ — ничего не защищено"
  else
    # Глоб вида *.lock не годится как путь пробы — берём конкретное имя.
    case "$FIRST_RULE" in
      *\**|*\?*) PROBE_PATH="$(printf '%s' "$FIRST_RULE" | tr -d '*?')" ;;
      *)         PROBE_PATH="$FIRST_RULE" ;;
    esac
    CANARY="$(probe 'guard-files' "$HOOK_DIR/guard-files.sh" \
      "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"${PROBE_PATH}\"}}" 2)"
  fi
fi
if [ -f "$HOOK_DIR/guard-bash.sh" ]; then
  CANARY="${CANARY}${CANARY:+ · }$(probe 'guard-bash' "$HOOK_DIR/guard-bash.sh" \
    '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' 2)"
fi

# --- ПОРТФЕЛЬНЫЕ практики/грабли из ai-memory/LESSONS.md (заголовки) -------
# Чтобы агент применял найденное и не повторял ошибок во всех проектах.
PRACTICES=""
PLFILE="$AI_MEMORY/LESSONS.md"
if [ -f "$PLFILE" ]; then
  PRACTICES="$(awk '
    /^## .*[Пп]рактики/{sec="[+]"; next}
    /^## .*[Гг]рабли/{sec="[!]"; next}
    /^## /{sec=""}
    sec && /^### /{sub(/^### /,""); print "- " sec " " $0}
  ' "$PLFILE" 2>/dev/null | head -14)"
fi

# --- сборка JSON через python (корректное экранирование) -------------------
# Данные передаём через ВРЕМЕННЫЙ ФАЙЛ (NUL-разделители), а НЕ через argv:
# на Windows длинный argv → E2BIG («Argument list too long»), и хук молча
# отдавал пустой stdout (контекст не приходил). Плюс выбираем РЕАЛЬНЫЙ python,
# пропуская execution-alias из WindowsApps (сломанная 0-байтная заглушка,
# которая в подпроцессе хука резолвится первой по PATH).
PAYLOAD="$(mktemp 2>/dev/null || printf '%s' "${TMPDIR:-/tmp}/sse_$$")"
printf '%s\0%s\0%s\0%s\0%s\0%s\0%s\0%s\0%s\0%s\0%s' \
  "$GIT_BLOCK" "$NEXT_TASK" "$DEBT" "$LESSONS" "$PORTFOLIO" "$GOAL_BLOCK" "$PRACTICES" "$FACTS" "$AMBIG" "$CANARY" "$DOCS_BLOCK" \
  > "$PAYLOAD"

declare -f resolve_py >/dev/null 2>&1 && resolve_py || PY_BIN="python3"

PY_ERR="${PAYLOAD}.err"
CTX_JSON="$(PYTHONUTF8=1 "$PY_BIN" - "$PAYLOAD" 2>"$PY_ERR" <<'PY'
import json, sys
with open(sys.argv[1], "rb") as _f:
    _fields = _f.read().decode("utf-8", "replace").split("\0")
_fields += [""] * (11 - len(_fields))
git_block, next_task, debt, lessons, portfolio, goal, practices, facts, ambig, canary, docs_root = _fields[:11]

parts = [
    "=== АВТОКОНТЕКСТ СЕССИИ (собран хуком, не вводился пользователем) ===",
]
# Канарейка идёт ПЕРВОЙ: отказ предохранителя должен быть виден до всего
# остального, а не утонуть под портфелем.
if canary.strip():
    broken = ("⛔" in canary) or ("НЕТ ФАЙЛА" in canary)
    empty = "ПУСТ" in canary
    if broken:
        note = " — ОТКАЗ. Скажи Антону ДО начала работы: правки проходят без проверки"
    elif empty:
        note = " — предупреждение: список защиты пуст, guard-files ничего не блокирует"
    else:
        note = ""
    parts += ["", "## Предохранители" + note, canary.strip()]
if docs_root.strip():
    parts += ["", "## Раскладка канона (DOCS_ROOT)", docs_root.strip()]
if portfolio.strip():
    parts += ["", "## Портфель — что в работе по всем проектам (ai-memory)", portfolio.strip()]
if goal.strip():
    parts += ["", "## Цель текущего проекта (GOAL — immutable, перечитывать на точках решения)", goal.strip()]
parts += [
    "",
    "## Состояние репозитория",
    git_block,
    "",
    "## Следующая микро-задача (CHECKPOINT §8)",
    next_task.strip() or "(пусто)",
]
if debt.strip():
    parts += ["", "## Открытые долги / риски (CHECKPOINT §7)", debt.strip()]
if facts.strip():
    parts += ["", "## Факты проекта (FACTS — доверяй первыми, у факта есть срок годности)", facts.strip()]
if practices.strip():
    parts += ["", "## Уроки портфеля — применяй практики ([+]), не повторяй грабли ([!]); детали в ai-memory/LESSONS.md", practices.strip()]
if lessons.strip():
    parts += ["", "## Уроки проекта (LESSONS — учитывай, детали по запросу)", lessons.strip()]
if ambig.strip():
    parts += ["", "## Неоднозначность — эти артефакты НЕ подставлены (не додумывай за них)", ambig.strip()]
parts += [
    "",
    "Это отправная точка. Действуй по протоколу старта (AGENTS.md / CLAUDE.md): "
    "сверься с NAVIGATION и CORE_PRINCIPLES, при необходимости дочитай файлы под "
    "задачу. История по проекту — в ai-memory/JOURNAL.md по запросу. Если "
    "автоконтекст расходится с тем, что просит Антон, — остановись и уточни, не додумывай.",
]
print(json.dumps({"hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "\n".join(parts),
}}, ensure_ascii=False))
PY
)"

# Отказ должен быть слышным. Раньше падение python (cp1251-кодировка, E2BIG,
# битый интерпретатор) давало пустой stdout при exit 0 — Claude Code считал, что
# контекст собран, и сессия молча шла вслепую. Такой баг прожил месяц незамеченным.
# Теперь вместо тишины — явное сообщение агенту, что автоконтекста нет и почему.
if [ -n "$CTX_JSON" ]; then
  printf '%s\n' "$CTX_JSON"
else
  # ВАЖНО: аварийное сообщение печатается ГОЛЫМ ТЕКСТОМ, а не JSON — намеренно.
  # Для SessionStart не-JSON stdout попадает в контекст как есть (docs → «Exit
  # code 0»: stdout is added as context для UserPromptSubmit / UserPromptExpansion
  # / SessionStart). Значит у текста нет схемы, которая может устареть, и он
  # долетит даже тогда, когда обёртка выше окажется неверной.
  # Раньше он шёл тем же JSON-каналом, что и штатный вывод: одна ошибка формы
  # гасила ОБА сигнала — и «вот контекст», и «контекста нет». Сообщение о поломке
  # не должно ехать по проводу, поломку которого оно обязано обнаружить.
  # Не переводить обратно в JSON.
  ERR_TAIL="$(tail -c 400 "$PY_ERR" 2>/dev/null | tr '\n\t' '  ')"
  printf '=== АВТОКОНТЕКСТ НЕ СОБРАН (session-start-context.sh) ===\nХук отработал вхолостую, состояние проекта в контекст НЕ попало. Причина: %s\nСкажи об этом Антону и запроси состояние вручную — не считай отсутствие контекста признаком того, что всё чисто.\n' \
    "${ERR_TAIL:-python не дал вывода и не сообщил об ошибке}"
fi

rm -f "$PAYLOAD" "$PY_ERR" 2>/dev/null

exit 0
