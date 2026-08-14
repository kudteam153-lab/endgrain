#!/usr/bin/env python3
"""audit_refs.py — проверка целостности ссылок в документах обвязки.

Зачем: доки ссылаются на хуки, скрипты, скиллы и файлы пакета. Ссылка на
удалённый компонент не ломает ничего громко — она просто тихо врёт, и это
обнаруживается через месяцы. Скрипт ловит такое за один прогон.

Запуск:
    python .claude/scripts/audit_refs.py            # текущий каталог
    python .claude/scripts/audit_refs.py <путь>     # конкретный проект

Exit: 0 — битых ссылок на обвязку нет; 1 — есть.

Три класса ссылок НЕ считаются битыми (иначе проверка вечно красная и её
перестают смотреть — тот же мёртвый груз, только в виде метрики):

  1. Файлы пакета проекта (ROADMAP, MODULES, NFR…) — их состав зависит от
     проекта, шаблон их не содержит по определению.
  2. Рантайм-артефакты (design-output/*) — создаются при первом запуске
     соответствующей команды.
  3. Канон при vault-топологии — резолвится через DOCS_ROOT из
     .claude/settings.json, статическая проверка пути об этом не знает.
  4. Над-проектная память (PORTFOLIO, JOURNAL, LESSONS) — живёт в
     AI_MEMORY_PATH, за пределами репозитория.
"""
import glob
import io
import json
import os
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
os.chdir(ROOT)

REF = re.compile(
    r'`([A-Za-z0-9_./-]+\.(?:md|py|sh|json|txt|kt|template))`'
    r'|\]\(([^)]+\.(?:md|py|sh|json|txt))\)'
    r'|(?<![`/\w])([A-Z][A-Za-z_]*\.md)(?![`\w])'
)

PACKAGE = {
    'ROADMAP.md', 'MODULES.md', 'USER_STORIES.md', 'NFR.md', 'SCHEMA.md',
    'INTEGRATIONS.md', 'SCREENS_WEB.md', 'SCREENS_MOBILE.md', 'SCREENS_CHECKPOINT.md',
    'PROJECT_MASTER.md', 'Research_Report.md', 'CHECKPOINT_ITERATION_N.md',
    'DESIGN_SYSTEM.md', 'GOAL.md', 'LESSONS.md', 'ANALYTICS.md', 'BRAND_GUIDELINES.md',
    'FACTS.md', 'prd.json', 'goal.json',
    'ROLES_PERSONAS.md', 'Custdev_Research_and_Market_Analysis.md',
    'QUICKSTART.md', 'CHAT_HANDOFF.md', 'GOAL_GUIDE.md',
    # Соседи чек-пойнта по раскладке жизненного цикла. Появляются, только когда
    # CHECKPOINT_CURRENT.md перерастает бюджет старта; правила и команды обвязки
    # описывают оба случая и потому ссылаются на них всегда. Требовать файл на
    # диске значит объявлять битой ссылку на ещё не наступившее состояние.
    'CHECKPOINT_DEBT.md', 'CHECKPOINT_API.md', 'CHECKPOINT_ARCHIVE.md',
    # Заводятся не в каждом проекте: AGENTS.md нужен там, где ходят другие
    # раннеры (Codex, Gemini CLI), DOMAIN_MODEL.md — там, где есть предметная
    # область. Хуки и скиллы обвязки ссылаются на них всегда, потому что
    # обслуживают любой проект.
    'AGENTS.md', 'DOMAIN_MODEL.md',
}
# Файлы, которые живут ТОЛЬКО в шаблоне обвязки: в проекте их нет и быть не
# должно, но доки проекта на них ссылаются законно. В самом шаблоне спрос с них
# полный — иначе повторится история, когда README_SYSTEM месяцами звал файл
# развёртывания, которого не существовало, а аудит показывал зелёное.
TEMPLATE_ONLY = {'BOOTSTRAP.md', 'README_SYSTEM.md', 'GRAPHIFY_SETUP.md'}
IN_TEMPLATE = os.path.isfile(os.path.join('.claude', 'scripts', 'sync-manifest.txt'))
# Памяти вне репозитория: над-проектная в AI_MEMORY_PATH и встроенная авто-память
# Claude Code в ~/.claude/projects/<проект>/memory/. Обе по определению не лежат
# в проекте, и требовать от них файла на диске — ложная тревога.
MEMORY = {'PORTFOLIO.md', 'JOURNAL.md', 'MEMORY.md'}
# Плейсхолдеры из прозы шаблонов — это не ссылки, а образцы имени.
PLACEHOLDER = re.compile(
    r'^(FILE|FILENAME|UPPER_SNAKE|MM|YYYY|NAME|XXX|TEMPLATE)\.md$'
    r'|^YYYY-MM|^journal/YYYY')
RUNTIME_PREFIXES = ('design-output/', 'changes/')

# Канон, который при vault-топологии лежит за DOCS_ROOT.
CANON = {'DECISIONS.md', 'CORE_PRINCIPLES.md', 'NAVIGATION.md', 'DOMAIN_MODEL.md'}


def docs_root():
    for p in ('.claude/settings.json', '.claude/settings.local.json'):
        try:
            c = json.load(io.open(p, encoding='utf-8'))
        except Exception:
            continue
        v = (c.get('env') or {}).get('DOCS_ROOT')
        if v:
            return v
    return ''


DR = docs_root()

SKIP_DIRS = {'.git', 'node_modules', '__pycache__', '.venv', 'venv', 'build',
             'dist', '.gradle', '.next', 'target'}


def walk_files():
    for pat in ('*.md', '.claude/**/*.md', 'playbook/*.md', '.claude/**/*.sh', '.claude/**/*.py'):
        for f in glob.glob(pat, recursive=True):
            if not any(s in f.replace('\\', '/').split('/') for s in SKIP_DIRS):
                yield f


def norm(p):
    p = p.replace('\\', '/')
    while p.startswith('./'):
        p = p[2:]
    return p


_index = None


def in_tree(base):
    global _index
    if _index is None:
        _index = set()
        for root, dirs, files in os.walk('.'):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            _index.update(files)
    return base in _index


def resolves(target, src):
    t = norm(target)
    if os.path.exists(t):
        return True
    if os.path.exists(norm(os.path.join(os.path.dirname(src), t))):
        return True
    if DR and os.path.exists(norm(os.path.join(DR, os.path.basename(t)))):
        return True
    return in_tree(os.path.basename(t))


def classify(target):
    base = os.path.basename(target)
    if base in MEMORY:
        return 'память (AI_MEMORY_PATH)'
    if base in TEMPLATE_ONLY and not IN_TEMPLATE:
        return 'файл шаблона обвязки'
    if base in PACKAGE:
        return 'файл пакета проекта'
    if norm(target).startswith(RUNTIME_PREFIXES):
        return 'рантайм-артефакт'
    if base in CANON and DR:
        return f'канон за DOCS_ROOT={DR}'
    if PLACEHOLDER.search(base) or PLACEHOLDER.search(norm(target)):
        return 'плейсхолдер в прозе, не ссылка'
    return None


def main():
    refs = {}
    docs = sorted(set(walk_files()))
    for d in docs:
        try:
            txt = io.open(d, encoding='utf-8', errors='replace').read()
        except OSError:
            continue
        for m in REF.finditer(txt):
            t = m.group(1) or m.group(2) or m.group(3)
            if not t or t.startswith(('http', '#')) or any(c in t for c in '<>*$'):
                continue
            # Отсекаем имена файлов, упомянутые как ПРИМЕР, а не как ссылка:
            # `Theme.kt`, `package.json`, `services/foo.py` в прозе про код.
            # Признак ссылки на обвязку — путь внутри .claude/ или playbook/,
            # либо ВЕРХНЕРЕГИСТРОВОЕ имя документа пакета (ROADMAP.md и т.п.).
            # Без этого проверка тонет в шуме и её перестают смотреть.
            nt = norm(t)
            base_ = os.path.basename(nt)
            is_harness = nt.startswith(('.claude/', 'playbook/', 'changes/', 'design-output/'))
            is_doc = base_[:1].isupper() and base_.endswith('.md')
            if not (is_harness or is_doc):
                continue
            refs.setdefault(t, set()).add(norm(d))

    broken, excused = {}, {}
    for t, srcs in refs.items():
        if any(resolves(t, s) for s in srcs):
            continue
        why = classify(t)
        (excused if why else broken)[t] = (sorted(srcs), why)

    print(f'{os.path.abspath(ROOT)}')
    print(f'документов {len(docs)} · ссылок {len(refs)}'
          + (f" · DOCS_ROOT={DR}" if DR else ''))
    print()
    if broken:
        print(f'БИТЫЕ ССЫЛКИ: {len(broken)}')
        for t, (srcs, _) in sorted(broken.items(), key=lambda x: -len(x[1][0])):
            print(f'  {t}   [{len(srcs)}]')
            for s in srcs[:6]:
                print(f'       <- {s}')
    else:
        print('БИТЫХ ССЫЛОК НЕТ')
    if excused:
        print()
        print(f'Не считаются битыми ({len(excused)}):')
        for t, (_, why) in sorted(excused.items()):
            print(f'  {t:40s} — {why}')
    return 1 if broken else 0


sys.exit(main())
