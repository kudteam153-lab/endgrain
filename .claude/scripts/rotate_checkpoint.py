#!/usr/bin/env python3
"""rotate_checkpoint.py — ротация CHECKPOINT_CURRENT.md по жизненному циклу.

Зачем: один файл копит всё и рано или поздно перестаёт читаться. В Detailbase он
дорос до 773 КБ / 688 строк — читается в начале каждой сессии и сжигает контекст,
а `Read` целиком его уже не берёт (лимит 256 КБ). Раскладываем на четыре по
жизненному циклу:

    CHECKPOINT_CURRENT.md   состояние + следующая задача   ← читает каждая сессия
    CHECKPOINT_DEBT.md      открытый долг, [DBT-NNN]       ← /debt, pre-mortem, grep
    CHECKPOINT_API.md       контракты + миграции           ← при правке endpoint
    CHECKPOINT_ARCHIVE.md   закрытое, дословно, append-only ← только grep

ГЛАВНЫЙ ИНВАРИАНТ: заголовки «## 1.» … «## 10.» остаются в CURRENT все и
непрерывно. И хук (session-start-context.sh: extract_section), и валидатор
(validate_checkpoint.py: section) читают раздел как «от `## N.` до `## N+1.`».
Убери заголовок — экстрактор не упадёт, а МОЛЧА вернёт всё до конца файла.
Поэтому выносится только payload, а на месте остаётся заголовок + указатель.

Классификация — по содержимому блока (маркер, дата, хеш коммита), НЕ по номерам
строк: параллельные сессии дописывают файл, и номера сдвигаются за минуты.

ЭТО НЕ КОРОБОЧНЫЙ СКРИПТ. Ниже три словаря разметки — CLOSED_DEBT, DONE_NEXT,
STALE_NEXT — под конвенции конкретного чек-пойнта: какими маркерами помечают
закрытое, какие §8-блоки фактически замещены. Значения здесь — от Detailbase.
Перед прогоном на другом проекте их надо перечитать под его разметку, иначе
классификация промахнётся. Промах не тихий: dry-run печатает, что уезжает из §8,
а два пасса целостности не дадут ничего потерять — но разложит не туда.
Порядок: прочитать §7/§8 глазами → поправить словари → dry-run → сверить список
«что уезжает» → --apply.

Два независимых доказательства целостности:
  пасс 1 — multiset строк CURRENT ∪ DEBT ∪ API ∪ ARCHIVE == multiset исходника;
  пасс 2 — снятие префикса «[DBT-NNN] » возвращает строку байт-в-байт.

Запуск:
    python .claude/scripts/rotate_checkpoint.py --session-hashes 4ac40b8,7c607ca \
        --out-dir <scratchpad>                       # dry-run, рабочий файл цел
    python .claude/scripts/rotate_checkpoint.py --session-hashes ... \
        --expect-sha256 <из manifest.txt> --apply    # запись рядом с исходником

Exit: 0 — целостность доказана; 1 — расхождение (ничего не записано при --apply).
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

KEEP, DEBT, API, ARCH = "keep", "debt", "api", "arch"

# --- §7: пункт закрыт. Только строгие якоря: маркер булита ✅, зачёркнутый
# заголовок, явная пометка «историческая запись». Наивное «содержит ✅» неверно —
# у открытых пунктов подпункты бывают закрыты («(1) ✅ Celery-обработчик…»),
# и такой пункт похоронило бы вместе с живыми подпунктами. Спорное остаётся
# в DEBT: лишний закрытый пункт в реестре безвреден, потерянный живой — нет.
CLOSED_DEBT = (
    r"^- \*\*✅",
    r"^- ~~",
    r"^- \*\*~~",
    r"^- \*\*🔴 \(историческ",
)

# --- §8: запись исполнена/замещена.
DONE_NEXT = (r"^- \*\*🟢", r"^- \*\*✅", r"^- \*\*⚪", r"^- \*\*⛔")
SUPERSEDED_NEXT = ("режняя запись", "РЕЖНЯЯ ЗАПИСЬ")

# --- §8: блоки, которые формально 🟡/🔴, но фактически замещены. Совпадение по
# подстроке, не по номеру строки. Каждый пункт — с причиной, чтобы через год было
# видно, почему он уехал.
STALE_NEXT = {
    "НАСТРОЙКИ SCR-WEB-10 — ТРЕК В РАБОТЕ, ТРИ РАЗДЕЛА": "замещено: живых разделов настроек 10 из 12 (614b105)",
    "SCR-WEB-18 «Шаблоны документов» (М-09 DocGen, И-7 — волна 3) В РАБОТЕ": "SCR-WEB-18 закрыт целиком (2026-07-27)",
    "SCR-WEB-08 «Аналитика» (М-15) — Stage A закрыт, ТРЕК ПРИОСТАНОВЛЕН": "замещено активным блоком «Мастера» Stage B",
    "М-11 Коммуникации — ЯДРО УВЕДОМЛЕНИЙ В РАБОТЕ": "pipeline переехал на свою сессию, ADR [D-431]",
    "ГРИЛЛ AI-РАМКИ → [D-410]": "решение записано в vault DECISIONS.md",
    "Бэк-склад М-05 Ф1 функционально ПОЛОН": "информационная запись эпохи И-6",
    "Ранее (контекст И-4, закрыта)": "контекст закрытой И-4",
    "Ссылки:** DOMAIN_MODEL #OrderQuote": "контекст закрытой И-4",
    "Web-карточка SCR-WEB-14 — отложена": "SCR-WEB-14 закрыт целиком",
    "Оценка:** И-4 (М-02), волна 2": "контекст закрытой И-4",
}

# --- §8: хвост, который не «следующая задача», а отложенный бэклог. В §7 его нет
# (проверено grep), поэтому в архив нельзя — уедет в реестр долга.
BACKLOG_NEXT = ("Отложено:** вкладки",)

HEAD_RE = re.compile(r"^## (\d+)\.")
SUB_RE = re.compile(r"^### (2\.3-prev|2\.\d)\.")
BULLET_RE = re.compile(r"^- ")
DATE_RE = re.compile(r"^- \*\*(\d{4}-\d{2}-\d{2})\.")
STRUCT_S1 = ("- **Итерация:", "- **Прогресс", "- **Ближайшая веха:", "- **Статус:")
TITLE_RE = re.compile(r"\*\*(.+?)\*\*", re.S)


@dataclass
class Block:
    """Булит верхнего уровня со всеми строками-продолжениями."""

    lines: list[str]
    section: str          # '1'…'10'
    subsection: str | None  # '2.3', '2.3-prev', …
    dest: str = KEEP
    dbt_id: str | None = None
    note: str = ""

    @property
    def head(self) -> str:
        return self.lines[0]

    def marker(self) -> str:
        m = re.match(r"^- \*\*(🔴|🟠|🟡|🟢|✅|⚪|⛔)", self.head)
        return m.group(1) if m else ""

    def title(self, limit: int = 95) -> str:
        body = self.head[2:].lstrip()
        m = TITLE_RE.search(body)
        t = (m.group(1) if m else body).strip()
        t = re.sub(r"^(🔴|🟠|🟡|🟢|✅|⚪|⛔)\s*", "", t)
        t = t.replace("`", "").rstrip(".") .strip()
        return t if len(t) <= limit else t[: limit - 1] + "…"

    def rendered(self) -> list[str]:
        """Строки блока с ID-префиксом, если он присвоен."""
        if not self.dbt_id:
            return list(self.lines)
        first = f"- [{self.dbt_id}] " + self.head[2:]
        return [first, *self.lines[1:]]


@dataclass
class Doc:
    """Исходник, разобранный на структурные строки и блоки."""

    items: list = field(default_factory=list)  # str (структура) | Block


def parse(lines: list[str]) -> Doc:
    doc = Doc()
    sec, sub, cur = "0", None, None
    for line in lines:
        m = HEAD_RE.match(line)
        if m:
            cur = None
            sec, sub = m.group(1), None
            doc.items.append(line)
            continue
        m = SUB_RE.match(line)
        if m:
            cur = None
            sub = m.group(1)
            doc.items.append(line)
            continue
        if line.startswith("#"):            # #### под-подзаголовок
            cur = None
            doc.items.append(line)
            continue
        if BULLET_RE.match(line):
            cur = Block([line], sec, sub)
            doc.items.append(cur)
            continue
        if cur is not None and line.strip():   # продолжение блока
            cur.lines.append(line)
            continue
        if cur is not None and not line.strip():
            # Пустая строка внутри §8-блока разделяет его абзацы; в конце блока
            # она структурная. Отличаем по следующей непустой строке — но проще
            # и безопаснее: пустую отдаём блоку, порядок при сборке сохраняется.
            cur.lines.append(line)
            continue
        doc.items.append(line)
    return doc


def classify(doc: Doc, session_hashes: list[str]) -> None:
    s1_dates = [
        m.group(1)
        for it in doc.items
        if isinstance(it, Block) and it.section == "1" and (m := DATE_RE.match(it.head))
    ]
    fresh = max(s1_dates) if s1_dates else ""

    for it in doc.items:
        if not isinstance(it, Block):
            continue
        s, sub, head = it.section, it.subsection, it.head

        if sub == "2.3-prev":
            it.dest, it.note = ARCH, "§2.3-prev целиком"
        elif s == "1":
            if head.startswith(STRUCT_S1):
                it.dest = KEEP
            elif (m := DATE_RE.match(head)) and m.group(1) == fresh:
                it.dest, it.note = KEEP, f"свежая запись {fresh}"
            else:
                it.dest, it.note = ARCH, "прошлая запись §1"
        elif sub == "2.3":
            if any(h in head for h in session_hashes):
                it.dest, it.note = KEEP, "активный трек этой сессии"
            else:
                it.dest, it.note = ARCH, "закрыто в прошлых сессиях"
        elif s in ("4", "5"):
            it.dest, it.note = API, f"справочник §{s}"
        elif s == "7":
            if any(re.match(p, head) for p in CLOSED_DEBT):
                it.dest, it.note = ARCH, "долг закрыт"
            else:
                it.dest, it.note = DEBT, "открытый долг"
        elif s == "8":
            if any(k in head for k in BACKLOG_NEXT):
                it.dest, it.note = DEBT, "отложенный бэклог, в §7 отсутствует"
            elif stale := next((v for k, v in STALE_NEXT.items() if k in head), None):
                it.dest, it.note = ARCH, stale
            elif any(re.match(p, head) for p in DONE_NEXT) or any(
                k in head for k in SUPERSEDED_NEXT
            ):
                it.dest, it.note = ARCH, "запись исполнена/замещена"
            else:
                it.dest, it.note = KEEP, "активный блок"
        else:
            it.dest = KEEP


def assign_ids(doc: Doc) -> None:
    """ID сквозной по §7 в исходном порядке — и открытым, и закрытым.

    Закрытый пункт сохраняет идентичность после переезда в архив: ссылка
    [DBT-042] находится одним grep по обоим файлам даже через год.
    """
    n = 0
    for it in doc.items:
        if isinstance(it, Block) and it.section == "7":
            n += 1
            it.dbt_id = f"DBT-{n:03d}"
    # §8-хвост, уехавший в реестр долга, тоже должен быть адресуемым.
    for it in doc.items:
        if isinstance(it, Block) and it.section == "8" and it.dest == DEBT:
            n += 1
            it.dbt_id = f"DBT-{n:03d}"


# --------------------------------------------------------------------------- #
# Сборка файлов
# --------------------------------------------------------------------------- #

CURRENT_MAP = """\
> **Раскладка чек-пойнта** ([D-433]). Этот файл — состояние и следующая задача,
> его читает каждая сессия. Остальное рядом: `CHECKPOINT_DEBT.md` — открытый долг
> (`[DBT-NNN]`), `CHECKPOINT_API.md` — контракты и миграции, `CHECKPOINT_ARCHIVE.md`
> — закрытое (append-only, читать только grep).
"""

POINTER_4 = (
    "- **Полный список миграций → `CHECKPOINT_API.md` §4.** Канон схемы — vault "
    "`SCHEMA.md` (регенерируется `detailbase schema regenerate`), здесь не дублируется.\n"
)
POINTER_5 = (
    "- **Контракты endpoints → `CHECKPOINT_API.md` §5.** Один факт — одно место "
    "(CLAUDE.md §4.5); при правке endpoint писать туда.\n"
)

DEBT_HEADER = """\
# CHECKPOINT — открытый тех-долг, баги, риски (detailbase-app)

> Реестр **открытого** долга. Канонический адрес записи: новый пункт заводится
> здесь с очередным `[DBT-NNN]`. Закрытый пункт уезжает в `CHECKPOINT_ARCHIVE.md`
> при следующем `/checkpoint` (одна сессия ещё видит, что закрыто).
>
> Читают: `/debt`, скилл `pre-mortem`, `/gate`; в задаче — точечно
> (`grep CHECKPOINT_DEBT.md` по модулю или экрану), а не целиком.
> Срез 🔴/🟠 дублируется ссылками в `CHECKPOINT_CURRENT.md` §7 — он попадает
> в автоконтекст каждой сессии.
>
> Заголовок «## 7.» сохранён намеренно: `extract_section 7` из
> `session-start-context.sh` работает и по этому файлу.

"""

API_HEADER = """\
# CHECKPOINT — API-контракты и миграции (detailbase-app)

> Справочник, а не хроника: читается при правке endpoint или заведении миграции,
> не при каждом старте сессии. Канонический адрес записи для §4/§5 — здесь.
>
> Канон схемы БД — vault `SCHEMA.md` (регенерируется `detailbase schema regenerate`).
> Список ниже — хронология миграций кода, схема правды не задаёт.

"""

ARCH_HEADER = """\
# CHECKPOINT — архив закрытого (detailbase-app)

> **Append-only.** Содержимое перенесено **дословно**, порядок исходный, текст не
> переписывается. Правится только дописыванием в конец нужного раздела.
>
> Читать целиком не нужно и не следует — только `grep` (по `[DBT-NNN]`, коммиту,
> экрану, дате). Текущее состояние и следующая задача — `CHECKPOINT_CURRENT.md`.
>
> Создан ротацией 2026-07-30 ([D-433]) из версии 773 КБ / 688 строк.
> Предшественник по другому основанию: `CHECKPOINT_ITERATION_0.md` — снимок
> завершённой итерации; здесь основание другое, по жизненному циклу (см. ADR).

"""

ARCH_SECTIONS = [
    ("s1", "## Архив §1 — прошлые записи «Текущее состояние»\n"),
    ("s23", "## Архив §2.3 — закрыто в прошлых сессиях\n"),
    ("s7", "## Архив §7 — закрытые долги, баги, риски\n"),
    ("s8", "## Архив §8 — исполненные и замещённые записи «следующая микро-задача»\n"),
]


def arch_bucket(b: Block) -> str:
    if b.section == "1":
        return "s1"
    if b.section == "2":
        return "s23"
    if b.section == "7":
        return "s7"
    return "s8"


def build(doc: Doc, today: str) -> dict[str, list[str]]:
    out = {KEEP: [], DEBT: [], API: [], ARCH: []}
    injected: Counter[str] = Counter()

    def emit(dest: str, text: str, is_new: bool = False) -> None:
        out[dest].append(text)
        if is_new:
            injected[text] += 1

    debt_blocks = [i for i in doc.items if isinstance(i, Block) and i.dest == DEBT]
    counts = Counter(b.marker() or "без маркера" for b in debt_blocks)
    # Порядок — по серьёзности, не по частоте: читающий смотрит на 🔴 первым.
    order = ["🔴", "🟠", "🟡", "🟢", "без маркера"]
    counts_sorted = sorted(counts.items(), key=lambda kv: order.index(kv[0]) if kv[0] in order else 99)
    blocking = sorted(
        (b for b in debt_blocks if b.marker() in ("🔴", "🟠")),
        key=lambda b: (order.index(b.marker()), b.dbt_id or ""),
    )

    date_line = (
        f"- **Дата обновления:** {today}. Раскладка по [D-433]: долг → "
        f"`CHECKPOINT_DEBT.md`, контракты и миграции → `CHECKPOINT_API.md`, "
        f"закрытое → `CHECKPOINT_ARCHIVE.md`.\n"
    )
    pointer_7 = (
        f"- **Полный реестр долга → `CHECKPOINT_DEBT.md`** ({len(debt_blocks)} открытых: "
        + " · ".join(f"{m} {n}" for m, n in counts_sorted)
        + f"; обновлён {today}). Ниже — только блокирующее; остальное искать точечно: "
        "`grep CHECKPOINT_DEBT.md` по модулю или экрану.\n"
    )

    arch: dict[str, list[str]] = {k: [] for k, _ in ARCH_SECTIONS}

    for it in doc.items:
        if isinstance(it, str):
            out[KEEP].append(it)
            if HEAD_RE.match(it):
                n = HEAD_RE.match(it).group(1)
                if n == "1":
                    emit(KEEP, "\n", True)
                    emit(KEEP, date_line, True)
                elif n == "4":
                    emit(KEEP, "\n", True)
                    emit(KEEP, POINTER_4, True)
                elif n == "5":
                    emit(KEEP, "\n", True)
                    emit(KEEP, POINTER_5, True)
                elif n == "7":
                    emit(KEEP, "\n", True)
                    emit(KEEP, pointer_7, True)
                    for b in blocking:
                        emit(KEEP, f"  - {b.marker()} [{b.dbt_id}] {b.title()}\n", True)
            continue

        if it.dest == KEEP:
            out[KEEP].extend(it.rendered())
        elif it.dest == DEBT:
            out[DEBT].extend(it.rendered())
        elif it.dest == API:
            out[API].extend(it.rendered())
        else:
            arch[arch_bucket(it)].extend(it.rendered())
        if it.subsection == "2.3":
            s23_seen = True

    # §2.3-prev-заголовки уехали блоками? Нет — они структурные, значит остались
    # в KEEP. Убираем их оттуда в архив: подраздел исчезает из рабочего файла.
    keep2, moved = [], []
    for line in out[KEEP]:
        if SUB_RE.match(line) and SUB_RE.match(line).group(1) == "2.3-prev":
            moved.append(line)
        elif moved and line.startswith("#### "):
            moved.append(line)
        else:
            keep2.append(line)
    out[KEEP] = keep2
    arch["s23"] = moved + arch["s23"]

    files: dict[str, list[str]] = {}
    files["CHECKPOINT_CURRENT.md"] = _with_map(out[KEEP], injected)
    files["CHECKPOINT_DEBT.md"] = _prefix(DEBT_HEADER, "## 7. Тех-долг / баги / риски\n", out[DEBT], injected)
    files["CHECKPOINT_API.md"] = _prefix(API_HEADER, None, out[API], injected)
    arch_lines: list[str] = []
    for key, title in ARCH_SECTIONS:
        if not arch[key]:
            continue
        for t in (title, "\n"):
            arch_lines.append(t)
            injected[t] += 1
        arch_lines.extend(arch[key])
    files["CHECKPOINT_ARCHIVE.md"] = _prefix(ARCH_HEADER, None, arch_lines, injected)
    return files, injected


def _with_map(lines: list[str], injected: Counter[str]) -> list[str]:
    """Карта раскладки — сразу под заголовком H1, до §1."""
    injected[CURRENT_MAP] += 1
    return lines[:1] + [CURRENT_MAP] + lines[1:]


def _prefix(header: str, sec: str | None, body: list[str], injected: Counter[str]) -> list[str]:
    injected[header] += 1
    parts = [header]
    if sec:
        injected[sec] += 1
        injected["\n"] += 1
        parts += [sec, "\n"]
    return parts + body


def normalize(lines: list[str]) -> str:
    text = "".join(lines).replace("\r\n", "\n")
    return re.sub(r"\n{3,}\Z", "\n", text.rstrip("\n")) + "\n"


# --------------------------------------------------------------------------- #


def main() -> int:
    ap = argparse.ArgumentParser(description="Ротация CHECKPOINT_CURRENT.md по жизненному циклу")
    ap.add_argument("--src", default="CHECKPOINT_CURRENT.md")
    ap.add_argument("--out-dir", help="куда писать при dry-run")
    ap.add_argument("--session-hashes", required=True,
                    help="хеши коммитов активных треков: их §2.3 остаётся в CURRENT")
    ap.add_argument("--expect-sha256", help="sha256 исходника из manifest.txt; расхождение = abort")
    ap.add_argument("--today", default=date.today().isoformat(),
                    help="дата в шапках создаваемых файлов (по умолчанию сегодня)")
    ap.add_argument("--apply", action="store_true", help="писать рядом с исходником")
    args = ap.parse_args()

    src = Path(args.src)
    with src.open(encoding="utf-8", newline="") as fh:
        raw = fh.read()
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    if args.expect_sha256 and digest != args.expect_sha256:
        print("⛔ sha256 исходника не совпал с манифестом — файл изменён после бэкапа.",
              file=sys.stderr)
        print(f"   ожидался {args.expect_sha256}\n   получен  {digest}", file=sys.stderr)
        print("   Скорее всего писала параллельная сессия. Пересними бэкап и повтори.",
              file=sys.stderr)
        return 1

    lines = raw.splitlines(keepends=True)
    hashes = [h.strip() for h in args.session_hashes.split(",") if h.strip()]

    doc = parse(lines)
    classify(doc, hashes)
    assign_ids(doc)
    files, injected = build(doc, args.today)

    # --- пасс 1: собранные файлы содержат исходник ровно один раз -------------
    # Считаем по ФАКТИЧЕСКИ собранным файлам, а не по промежуточной структуре:
    # так проверка ловит и ошибки сборки, не только разбора.
    if any(line.startswith("- [DBT-") for line in lines):
        print("⛔ в исходнике уже есть префиксы [DBT-…] — ротация не идемпотентна "
              "в этой части, снимите их или уточните разметку.", file=sys.stderr)
        return 1

    produced: Counter[str] = Counter()
    for body in files.values():
        produced.update(body)
    for text, n in injected.items():                 # вычесть вставленное
        produced[text] -= n
        if produced[text] <= 0:
            del produced[text]
    unprefixed: Counter[str] = Counter()             # пасс 2: снять ID-префиксы
    id_seen = 0
    for line, n in produced.items():
        back = re.sub(r"^- \[DBT-\d+\] ", "- ", line)
        id_seen += n if back != line else 0
        unprefixed[back] += n

    original = Counter(lines)
    lost, extra = original - unprefixed, unprefixed - original
    ids = [b.dbt_id for b in (i for i in doc.items if isinstance(i, Block)) if b.dbt_id]
    ok = not lost and not extra and len(ids) == len(set(ids)) == id_seen

    print(f"исходник : {len(lines)} строк, {len(raw.encode()) / 1024:.1f} КБ")
    print(f"sha256   : {digest}")
    print(f"пасс 1   : {'OK — каждая строка исходника ровно один раз' if not lost and not extra else 'ПОТЕРЯ ДАННЫХ'}")
    print(f"пасс 2   : {'OK' if len(ids) == len(set(ids)) == id_seen else 'РАСХОЖДЕНИЕ'} — "
          f"{len(ids)} ID присвоено, {len(set(ids))} уникальны, {id_seen} в файлах, префикс обратим")
    if not ok:
        for line, n in list(lost.items())[:5]:
            print(f"  потеряно ×{n}: {line[:90]!r}", file=sys.stderr)
        for line, n in list(extra.items())[:5]:
            print(f"  лишнее   ×{n}: {line[:90]!r}", file=sys.stderr)
        return 1

    out_dir = src.parent if args.apply else Path(args.out_dir or ".")
    out_dir.mkdir(parents=True, exist_ok=True)
    print()
    for name, body in files.items():
        text = normalize(body)
        # normalize() трогает только хвостовые переводы строки — содержательные
        # строки не должны исчезнуть.
        before = sum(1 for el in body for line in el.splitlines() if line.strip())
        after = sum(1 for line in text.splitlines() if line.strip())
        if before != after:
            print(f"⛔ {name}: normalize() потерял строки ({before} → {after})", file=sys.stderr)
            return 1
        path = out_dir / (name if args.apply else name.replace(".md", ".new.md"))
        with path.open("w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        print(f"  {name:24} {len(text.encode()) / 1024:7.1f} КБ  {text.count(chr(10)):>4} строк")

    blocks = [i for i in doc.items if isinstance(i, Block)]
    print("\nпо назначению (блоков):")
    for dest, label in ((KEEP, "остаётся"), (DEBT, "→ DEBT"), (API, "→ API"), (ARCH, "→ ARCHIVE")):
        print(f"  {label:10} {sum(1 for b in blocks if b.dest == dest):>4}")
    print("\nчто уезжает из §8 (на утверждение):")
    for b in blocks:
        if b.section == "8" and b.dest != KEEP:
            tag = "DEBT" if b.dest == DEBT else "арх"
            print(f"  [{tag}] {b.title(58):<60} — {b.note}")
    if not args.apply:
        print(f"\ndry-run: рабочий файл не тронут, вывод в {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
