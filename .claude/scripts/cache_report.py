#!/usr/bin/env python3
"""
cache_report.py — считает prompt-cache hit rate по логам твоих ботов.

Зачем: цель ≥80% попаданий в кэш (Code w/ Claude 2026). Чтобы её достигать,
надо измерять. Скрипт агрегирует поле usage из ответов anthropic SDK и
показывает hit rate, чтобы ты видел, помогает ли кэш и где течёт.

Как логировать (в своём боте при каждом ответе API):
    import json
    with open("usage.jsonl", "a") as f:
        f.write(json.dumps({
            "ts": time.time(),
            "usage": resp.usage.model_dump()  # или dict(resp.usage)
        }) + "\\n")

Поле usage от Anthropic содержит:
    input_tokens, output_tokens,
    cache_read_input_tokens, cache_creation_input_tokens

Использование:
    python3 .claude/scripts/cache_report.py usage.jsonl
    python3 .claude/scripts/cache_report.py usage.jsonl --by-day

Hit rate = cache_read / (cache_read + cache_creation + input)
  — доля токенов, прилетевших из кэша, среди всех «входных».
"""
from __future__ import annotations
import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime


def extract_usage(obj: dict) -> dict | None:
    """Достаёт usage из строки лога (поддерживает вложенное и плоское)."""
    u = obj.get("usage", obj)
    if not isinstance(u, dict):
        return None
    keys = ("input_tokens", "output_tokens",
            "cache_read_input_tokens", "cache_creation_input_tokens")
    if not any(k in u for k in keys):
        return None
    return {k: int(u.get(k, 0) or 0) for k in keys}


def hit_rate(read: int, creation: int, inp: int) -> float:
    denom = read + creation + inp
    return (read / denom * 100) if denom else 0.0


def fmt_block(title: str, agg: dict) -> str:
    read = agg["cache_read_input_tokens"]
    creation = agg["cache_creation_input_tokens"]
    inp = agg["input_tokens"]
    out = agg["output_tokens"]
    hr = hit_rate(read, creation, inp)
    flag = "✅" if hr >= 80 else ("🟠" if hr >= 50 else "🔴")
    return (
        f"{title}\n"
        f"  Cache hit rate: {hr:5.1f}% {flag}  (цель ≥80%)\n"
        f"  из кэша (read):     {read:>12,}\n"
        f"  запись в кэш:       {creation:>12,}\n"
        f"  обычный input:      {inp:>12,}\n"
        f"  output:             {out:>12,}\n"
        f"  запросов:           {agg['_n']:>12,}"
    )


def main() -> int:
    ap = argparse.ArgumentParser(description="Prompt-cache hit rate по логам")
    ap.add_argument("logfile", help="JSONL-лог с полем usage")
    ap.add_argument("--by-day", action="store_true", help="разбивка по дням")
    args = ap.parse_args()

    try:
        lines = open(args.logfile, encoding="utf-8").read().splitlines()
    except FileNotFoundError:
        print(f"⛔ Файл не найден: {args.logfile}", file=sys.stderr)
        return 1

    def new_agg():
        return {"input_tokens": 0, "output_tokens": 0,
                "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0,
                "_n": 0}

    total = new_agg()
    by_day = defaultdict(new_agg)
    parsed = 0

    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        try:
            obj = json.loads(ln)
        except json.JSONDecodeError:
            continue
        u = extract_usage(obj)
        if not u:
            continue
        parsed += 1
        for k, v in u.items():
            total[k] += v
        total["_n"] += 1
        if args.by_day:
            ts = obj.get("ts")
            day = datetime.fromtimestamp(ts).strftime("%Y-%m-%d") if ts else "unknown"
            for k, v in u.items():
                by_day[day][k] += v
            by_day[day]["_n"] += 1

    if parsed == 0:
        print("⛔ В логе не найдено записей с usage. Проверь формат "
              "(нужны поля input_tokens/cache_read_input_tokens/...).", file=sys.stderr)
        return 1

    print(fmt_block("=== ИТОГО ===", total))
    if args.by_day:
        print("\n--- По дням ---")
        for day in sorted(by_day):
            print()
            print(fmt_block(day, by_day[day]))

    hr = hit_rate(total["cache_read_input_tokens"],
                  total["cache_creation_input_tokens"],
                  total["input_tokens"])
    if hr < 80:
        print("\n💡 Hit rate ниже 80%. Проверь: стабилен ли префикс "
              "(системный промпт/инструменты байт-в-байт)? Не держишь ли "
              "лишние схемы инструментов и сырой вывод в контексте? "
              "См. playbook/token-efficiency.md §1.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
