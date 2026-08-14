# Мапа токенов: Web (CSS / React)

Канон → CSS custom properties. Один `:root`, никаких дублей значений в компонентах.

```css
:root {
  /* color (из канона) */
  --bg: ; --surface: ; --text: ; --text-2: ; --accent: ;
  /* type */
  --font-display: ; --font-body: ;
  --fs-0: 1rem; --fs-1: 1.25rem; --fs-2: 1.563rem; --fs-3: 1.953rem; --fs-4: 2.441rem;
  --lh-body: 1.6; --lh-display: 1.15;
  /* space */
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px;
  --s-6: 32px; --s-7: 48px; --s-8: 64px; --s-9: 96px;
  /* shape, elevation, motion */
  --radius: ; --shadow-1: ; --shadow-2: ;
  --dur-1: 120ms; --dur-2: 240ms; --dur-3: 400ms;
  --ease-out: cubic-bezier(0.16,1,0.3,1);
}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

Тёмная тема: `[data-theme="dark"]` переопределяет ТОЛЬКО color-блок; структурные токены общие.

## Web-специфика
- Брейкпоинты: 360 / 768 / 1100 / 1440. Mobile-first. Сигнатурный элемент обязан выживать на 360.
- Шрифты: self-host (woff2, `font-display: swap`), subset с кириллицей; preload display-шрифта.
- Hover-состояния не несут уникальной информации (на таче их нет) — дублируй смысл.
- Скриншоты для критика: Playwright, viewport 1440×900 и 390×844, full-page + кропы (см. критика).
- Длина строки текста: `max-width: 65ch` на body-контенте.
- CSS-дисциплина: следи за специфичностью (секционные .class vs элементные селекторы взаимно гасятся на отступах).
