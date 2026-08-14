#!/usr/bin/env bash
# =============================================================================
# test-guards.sh — батарея проверок предохранителя guard-bash.sh.
# Запуск: bash .claude/hooks/test-guards.sh   (exit 0 = всё прошло)
# Гонять после КАЖДОЙ правки guard-bash.sh и после обновления Claude Code:
# часть правил снята, потому что их взял на себя auto-mode (спека §3.6) — если
# платформа передумает, батарея это не поймает, но регрессию в наших — поймает.
# Найденная ею дыра: `rm -rf /*` не блокировался с самого начала (2026-07-26).
# =============================================================================
# Тестовая батарея guard-bash.sh: MUST-BLOCK должны давать отказ, MUST-PASS — проход.
# Пути берём относительно самого скрипта — батарея переносима между проектами.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$HERE/guard-bash.sh"
export CLAUDE_PROJECT_DIR="$(cd "$HERE/../.." && pwd)"

# Интерпретатор берём тем же резолвером, что и сам предохранитель. Прямой вызов
# `python` давал на macOS (где есть только python3) 20 ложных FAIL: падала
# подготовка входного JSON, хук получал пустой stdin и честно отвечал pass.
# Батарея обязана проверять предохранитель, а не наличие имени `python`.
# shellcheck source=/dev/null
. "$HERE/_lib.sh" 2>/dev/null || true
if command -v resolve_py >/dev/null 2>&1; then
  resolve_py
else
  PY_BIN="$(command -v python3 || command -v python)"
fi

fail=0

# Проверяем РЕШЕНИЕ, а не код возврата. С 2026-07-26 guard-* отвечают
# permissionDecision "deny" при exit 0, но без python падают на прежний exit 2.
# Батарея обязана считать блокировкой оба случая: она проверяет предохранитель,
# а не способ, которым он говорит «нет».
verdict() {  # verdict <stdout хука> <код> → block|pass
  case "$1" in *'"permissionDecision"'*'"deny"'*) printf 'block'; return ;; esac
  if [ "$2" = 2 ]; then printf 'block'; else printf 'pass'; fi
}

run() {  # run <2 = ждём блокировку | 0 = ждём проход> <команда>
  local want="$1" cmd="$2" out code got
  out=$(printf '%s' "$cmd" | "$PY_BIN" -c '
import sys, json
print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.stdin.read()}}))
' | bash "$HOOK" 2>/dev/null)
  code=$?
  got="$(verdict "$out" "$code")"
  if [ "$want" = 2 ]; then want=block; else want=pass; fi
  if [ "$got" = "$want" ]; then
    printf "  ok   (%s) %s\n" "$got" "${cmd:0:62}"
  else
    printf "  FAIL ждали %s, получили %s: %s\n" "$want" "$got" "${cmd:0:62}"
    fail=$((fail+1))
  fi
}

echo "=== ДОЛЖНЫ БЛОКИРОВАТЬСЯ ==="
run 2 'rm -rf /'
run 2 'rm -rf ~'
run 2 'rm -rf $HOME'
run 2 'sudo rm -fr /*'
run 2 'mkfs.ext4 /dev/sda1'
run 2 'dd if=/dev/zero of=/dev/sda bs=1M'
run 2 'cat data > /dev/sda'
run 2 ':(){ :|:& };:'
run 2 'git push --force origin main'
run 2 'git push -f origin master'
run 2 'git push --force-with-lease origin production'
run 2 'psql -c "DROP TABLE orders"'
run 2 'psql -c "drop database detailbase"'
run 2 'mysql -e "TRUNCATE TABLE users"'
run 2 'psql -c "DELETE FROM customers;"'
run 2 'echo SECRET > .env.production'
run 2 'cat tpl > .env'
run 2 'docker system prune -a'
run 2 'docker system prune --all --volumes'

echo
echo "=== ДОЛЖНЫ ПРОХОДИТЬ ==="
run 0 'git status'
run 0 'rm -rf ./build'
run 0 'rm -rf node_modules'
run 0 'git push origin feat/my-branch'
run 0 'git push --force origin feat/scratch'
run 0 'psql -c "DELETE FROM customers WHERE id=1;"'
run 0 'psql -c "SELECT * FROM orders"'
run 0 'docker system prune'
run 0 'npm run build'
run 0 'echo hi > .env.example'
run 0 'grep -r mkfstest .'
run 0 'rm -rf /var/tmp/build'
run 0 'rm -rf /tmp/cache'
run 2 'rm -rf /*'
run 0 'git reset --hard HEAD~1'
run 0 'git clean -fd'


# ---------------------------------------------------------------------------
# Часть 2: protected-paths — читает список САМОГО проекта, ничего не хардкодит.
# Добавлено 2026-07-26, когда выяснилось, что во всех боевых проектах список
# был закомментирован целиком: guard-files был исправен и не защищал ничего.
# ---------------------------------------------------------------------------
PP="$CLAUDE_PROJECT_DIR/.claude/protected-paths.txt"
GF="$HERE/guard-files.sh"

runf() {  # runf <2 = ждём блокировку | 0 = ждём проход> <путь>
  local want="$1" f="$2" out code got fj
  # Обратные слеши экранируем: без этого JSON с windows-путём не парсится, хук
  # получает пустой путь, выходит 0 — и тест «проходит», ничего не проверив.
  fj="${f//\\/\\\\}"
  out=$(printf '{"tool_name":"Edit","tool_input":{"file_path":"%s"}}' "$fj" \
    | CLAUDE_PROJECT_DIR="$CLAUDE_PROJECT_DIR" bash "$GF" 2>/dev/null)
  code=$?
  got="$(verdict "$out" "$code")"
  if [ "$want" = 2 ]; then want=block; else want=pass; fi
  if [ "$got" = "$want" ]; then
    printf "  ok   (%s) %s\n" "$got" "$f"
  else
    printf "  FAIL ждали %s, получили %s: %s\n" "$want" "$got" "$f"
    fail=$((fail+1))
  fi
}

if [ -f "$PP" ] && [ -f "$GF" ]; then
  echo
  echo "=== protected-paths: КАЖДОЕ правило списка должно блокировать ==="
  rules=0
  while IFS= read -r r; do
    r="${r%%#*}"; r="${r#"${r%%[![:space:]]*}"}"; r="${r%"${r##*[![:space:]]}"}"
    [ -z "$r" ] && continue
    rules=$((rules+1))
    case "$r" in
      \**) runf 2 "example${r#\*}" ;;   # *.lock -> example.lock
      *)   runf 2 "$r" ;;
    esac
  done < "$PP"
  [ "$rules" -eq 0 ] && echo "  ПРЕДУПРЕЖДЕНИЕ: список пуст — guard-files ничего не защищает"

  echo
  echo "=== protected-paths: рабочие файлы НЕ должны блокироваться ==="
  runf 0 'README.md'
  runf 0 'CHECKPOINT_CURRENT.md'
  runf 0 'package.json'
  runf 0 'src/components/Button.tsx'
  runf 0 'backend/app/main.py'
  runf 0 'docs/GOAL.md'

  # -------------------------------------------------------------------------
  # Абсолютные пути в той форме, которую реально передаёт инструмент.
  # Проверки выше кормят хук относительными путями — тем единственным случаем,
  # который работал. На абсолютном пути срез корня проекта не срабатывал, глоб
  # не совпадал, хук молчал: защита была выключена на каждой правке, а батарея
  # показывала «ВСЕ ПРОШЛИ». Тест обязан ходить тем же путём, что и инструмент,
  # иначе он проверяет замысел автора. Найдено в design-agent 01.08.2026.
  # -------------------------------------------------------------------------
  echo
  echo "=== protected-paths: абсолютный путь в форме инструмента ==="
  while IFS= read -r r; do
    r="${r%%#*}"; r="${r#"${r%%[![:space:]]*}"}"; r="${r%"${r##*[![:space:]]}"}"
    [ -z "$r" ] && continue
    case "$r" in
      \**) runf 2 "$CLAUDE_PROJECT_DIR/example${r#\*}" ;;
      *)   runf 2 "$CLAUDE_PROJECT_DIR/$r" ;;
    esac
  done < "$PP"
  runf 0 "$CLAUDE_PROJECT_DIR/CHECKPOINT_CURRENT.md"

  # Windows-форма пути там, где она вообще возможна (git-bash). На macOS/Linux
  # cygpath нет — ветка пропускается, и это не провал: такой формы там не бывает.
  if command -v cygpath >/dev/null 2>&1; then
    WINROOT="$(cygpath -w "$CLAUDE_PROJECT_DIR")"
    runf 2 "$WINROOT\\GOAL.md"
    runf 0 "$WINROOT\\CHECKPOINT_CURRENT.md"
    # Смешанная форма и другой регистр диска: d:/… против D:\…
    runf 2 "${WINROOT//\\//}/GOAL.md"
  else
    echo "  пропуск: нет cygpath, windows-форму пути проверить нечем"
  fi
fi

# ---------------------------------------------------------------------------
# Часть 3: эскалация (guard-highrisk.sh). Проверяем не «блокирует ли», а
# «спрашивает ли»: ask и deny — разные решения, и путать их нельзя.
# Ложное срабатывание здесь дороже пропуска — половина проверок про тишину.
# ---------------------------------------------------------------------------
GH="$HERE/guard-highrisk.sh"

runh() {  # runh <ask|quiet> <tool> <поле> <значение>
  local want="$1" tool="$2" field="$3" val="$4" out got vj
  vj="${val//\\/\\\\}"   # см. runf: неэкранированный `\` рушит разбор JSON
  out=$(printf '{"tool_name":"%s","tool_input":{"%s":"%s"}}' "$tool" "$field" "$vj" \
    | CLAUDE_PROJECT_DIR="$CLAUDE_PROJECT_DIR" bash "$GH" 2>/dev/null)
  case "$out" in *'"permissionDecision"'*'"ask"'*) got=ask ;; *) got=quiet ;; esac
  if [ "$got" = "$want" ]; then
    printf "  ok   (%s) %s\n" "$got" "$val"
  else
    printf "  FAIL ждали %s, получили %s: %s\n" "$want" "$got" "$val"
    fail=$((fail+1))
  fi
}

if [ -f "$GH" ] && [ -f "$CLAUDE_PROJECT_DIR/.claude/high-risk-patterns.txt" ]; then
  echo
  echo "=== эскалация: ДОЛЖНЫ СПРАШИВАТЬ ==="
  runh ask Bash  command   'git commit --no-verify -m x'
  runh ask Bash  command   'kubectl apply -f k8s/'
  runh ask Bash  command   'alembic downgrade -1'
  runh ask Edit  file_path '.github/workflows/ci.yml'
  # Тот же путь абсолютным — эскалация молчала на нём по той же причине,
  # что и запрет в guard-files: срез корня проекта не срабатывал.
  runh ask Edit  file_path "$CLAUDE_PROJECT_DIR/.github/workflows/ci.yml"
  if [ -n "${WINROOT:-}" ]; then
    runh ask Edit file_path "$WINROOT\\.github\\workflows\\ci.yml"
  fi
  runh ask Write file_path 'docker-compose.yml'

  echo
  echo "=== эскалация: НЕ ДОЛЖНЫ СПРАШИВАТЬ ==="
  runh quiet Bash  command   'git commit -m x'
  runh quiet Bash  command   'kubectl get pods'
  runh quiet Bash  command   'alembic upgrade head'
  runh quiet Bash  command   'pytest -q'
  runh quiet Edit  file_path 'src/app.py'
  runh quiet Write file_path '.env.example'
fi

# ---------------------------------------------------------------------------
# Часть 4: контекстные хуки — доезжает ли текст до агента ВООБЩЕ.
# Части 1-3 проверяют только предохранители, то есть умение сказать «нет».
# Умение сказать «вот состояние» не проверял никто — и ровно там жил баг:
# голый {"additionalContext": …} это валидный JSON и exit 0, хук «отработал»,
# контекст молча не доехал (LESSONS «Хук отдаёт контекст в устаревшей схеме»).
# Поражены были все репо портфеля, кроме LemmaCore; нашли по асимметрии руками.
# Батарея обязана ловить это сама, иначе следующая правка формы повторит класс.
#
# Проверяем ОБЕ ветки каждого хука. Аварийная важнее штатной: сообщение о
# поломке ехало тем же каналом, что и штатный вывод, — одна ошибка формы гасила
# сразу оба сигнала, и предохранитель, который должен кричать, молчал громче
# всех. Ветку вызываем реально (PATH без python), а не читаем глазами.
# ---------------------------------------------------------------------------
BASH_BIN="$(command -v bash || printf '/bin/bash')"

# Аварийную ветку вызываем битым ИНТЕРПРЕТАТОРОМ, а не пустым PATH. Пустой PATH
# рубит заодно cat/git/mktemp, и хук замолкает раньше, чем дойдёт до python, —
# тест тогда проверяет не ту ветку. Заглушки ниже воспроизводят ровно тот отказ,
# который был на Windows: python в PATH есть, запускается, ничего не отдаёт.
PYSTUB="$(mktemp -d 2>/dev/null || printf '%s' "${TMPDIR:-/tmp}/pystub_$$")"
for _n in python3 python py; do
  printf '#!/bin/sh\nexit 1\n' > "$PYSTUB/$_n"
  chmod +x "$PYSTUB/$_n" 2>/dev/null
done
NOPY_PATH="$PYSTUB:$PATH"

# ctx <ярлык> <strict|loose> <вывод>
#   strict — контекст принимается ТОЛЬКО в схеме hookSpecificOutput;
#   loose  — событие принимает ещё и не-JSON stdout как контекст
#            (docs → «Exit code 0»: UserPromptSubmit / UserPromptExpansion /
#            SessionStart). Для остальных событий голый текст в контекст НЕ
#            попадает, поэтому loose ставить только этим трём.
ctx() {
  local label="$1" mode="$2" out="$3" head
  head="${out#"${out%%[![:space:]]*}"}"
  if [ -z "$head" ]; then
    printf "  FAIL пустой вывод, контекст не доехал: %s\n" "$label"; fail=$((fail+1)); return
  fi
  case "$head" in
    '{'*)
      case "$out" in
        *'"hookSpecificOutput"'*'"hookEventName"'*)
          printf "  ok   (схема) %s\n" "$label" ;;
        *)
          printf "  FAIL JSON без hookSpecificOutput — контекст теряется молча: %s\n" "$label"
          fail=$((fail+1)) ;;
      esac ;;
    *)
      if [ "$mode" = loose ]; then
        printf "  ok   (голый текст) %s\n" "$label"
      else
        printf "  FAIL не-JSON вывод, для этого события в контекст не попадёт: %s\n" "$label"
        fail=$((fail+1))
      fi ;;
  esac
}

SSC="$HERE/session-start-context.sh"
if [ -f "$SSC" ]; then
  echo
  echo "=== контекст: session-start-context.sh (обе ветки) ==="
  ctx "штатная ветка" strict "$(printf '{"hook_event_name":"SessionStart"}' \
    | CLAUDE_PROJECT_DIR="$CLAUDE_PROJECT_DIR" bash "$SSC" 2>/dev/null)"
  # Аварийная ветка: python недоступен. Голый текст здесь ПРАВИЛЕН и намеренен —
  # у него нет схемы, которая может устареть. Если тут появится JSON, значит
  # сообщение о поломке снова поехало по гаснущему проводу.
  ctx "аварийная ветка (битый python)" loose "$(printf '{"hook_event_name":"SessionStart"}' \
    | PATH="$NOPY_PATH" CLAUDE_PROJECT_DIR="$CLAUDE_PROJECT_DIR" "$BASH_BIN" "$SSC" 2>/dev/null)"

  # Канарейка предохранителей при вызове ОТНОСИТЕЛЬНЫМ путём — та форма, которую
  # даёт fallback `${CLAUDE_PROJECT_DIR:-.}` из settings.json. Хук делает cd в
  # корень проекта, и всё, что резолвит пути относительно себя ПОСЛЕ cd, на этой
  # форме отваливается: probe не находил guard-files.sh и печатал «НЕТ ФАЙЛА», а
  # канарейка — «ОТКАЗ, правки проходят без проверки» на исправной защите.
  # Проверки выше ходят абсолютным путём и такой отказ не видят. Тот же класс,
  # что найденный в design-agent 01.08: тест обязан ходить тем же путём, что и
  # инструмент, иначе он проверяет замысел автора.
  if [ -f "$HERE/guard-files.sh" ]; then
    relout="$(cd "$CLAUDE_PROJECT_DIR/.." 2>/dev/null && printf '{"hook_event_name":"SessionStart"}' \
      | CLAUDE_PROJECT_DIR="$CLAUDE_PROJECT_DIR" \
        bash "$(basename "$CLAUDE_PROJECT_DIR")/.claude/hooks/session-start-context.sh" 2>/dev/null)"
    # Маркеры берём ТОЧНЫЕ, из самого хука: «## Предохранители — ОТКАЗ», «НЕТ
    # ФАЙЛА», «⛔НЕ БЛОКИРУЕТ». Голый `⛔` не годится — этот символ попадается в
    # долгах CHECKPOINT и в уроках, и батарея валилась бы на исправной защите
    # (проверено на detailbase/app). Ловить шум шумом — то же, от чего лечимся.
    case "$relout" in
      *'НЕТ ФАЙЛА'*|*'⛔НЕ БЛОКИРУЕТ'*|*'Предохранители — ОТКАЗ'*)
        printf "  FAIL канарейка кричит ОТКАЗ на исправной защите (вызов относительным путём)\n"
        fail=$((fail+1)) ;;
      '')
        printf "  FAIL пустой вывод при вызове относительным путём\n"; fail=$((fail+1)) ;;
      *)
        printf "  ok   (канарейка) вызов относительным путём\n" ;;
    esac
  fi
fi

SBC="$HERE/subagent-context.sh"
if [ -f "$SBC" ]; then
  echo
  echo "=== контекст: subagent-context.sh (обе ветки) ==="
  # Хук молчит, когда сообщать нечего (нет DOCS_ROOT и project-context.md) — это
  # штатно, и на настоящем каталоге проверка ловила бы тишину по замыслу вместо
  # формы вывода. Поэтому подсовываем ВРЕМЕННЫЙ корень, где сообщать есть что:
  # тогда молчание уже означает поломку, а не отсутствие темы.
  # _lib.sh хук берёт рядом с собой, так что подмены корня достаточно.
  TMPROOT="$(mktemp -d 2>/dev/null || printf '%s' "${TMPDIR:-/tmp}/sbc_$$")"
  mkdir -p "$TMPROOT/.claude" 2>/dev/null
  printf 'проверка батареи: раскладка канона\n' > "$TMPROOT/.claude/project-context.md"

  # SubagentStart голый текст в контекст НЕ принимает — только strict, обе ветки.
  ctx "штатная ветка" strict "$(printf '{"hook_event_name":"SubagentStart"}' \
    | CLAUDE_PROJECT_DIR="$TMPROOT" bash "$SBC" 2>/dev/null)"
  ctx "аварийная ветка (битый python)" strict "$(printf '{"hook_event_name":"SubagentStart"}' \
    | PATH="$NOPY_PATH" CLAUDE_PROJECT_DIR="$TMPROOT" "$BASH_BIN" "$SBC" 2>/dev/null)"

  case "$TMPROOT" in /tmp/*|/var/*|"${TMPDIR%/}"/*) rm -rf "$TMPROOT" ;; esac
fi

echo
case "$PYSTUB" in /tmp/*|/var/*|"${TMPDIR%/}"/*) rm -rf "$PYSTUB" ;; esac
if [ "$fail" -eq 0 ]; then echo "ИТОГО: ВСЕ ПРОШЛИ"; else echo "ИТОГО ПРОВАЛОВ: $fail"; fi
exit "$fail"
