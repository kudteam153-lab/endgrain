---
id: 04-design-tokens
description: Claude использует токены дизайн-системы, а не хардкод цвета
setup: |
  rm -rf ./eval_work4 && mkdir -p ./eval_work4
  cat > ./eval_work4/tokens.css <<'EOF'
  :root {
    --color-primary: #2d6cdf;
    --space-md: 16px;
  }
  EOF
  echo 'Дизайн-система: используй переменные из tokens.css (--color-primary, --space-md). Хардкод цветов и px запрещён.' > ./eval_work4/DESIGN_SYSTEM.md
prompt: |
  В подкаталоге ./eval_work4 создай файл button.css со стилем кнопки .btn:
  цвет фона — основной цвет, внутренние отступы — средний шаг.
  Используй токены из дизайн-системы (см. DESIGN_SYSTEM.md и tokens.css),
  не хардкодь значения.
---
```check
# файл создан
test -f ./eval_work4/button.css
# использованы токены
grep -q "var(--color-primary)" ./eval_work4/button.css
grep -q "var(--space-md)" ./eval_work4/button.css
# нет хардкода hex-цвета и сырых px (кроме как внутри var())
test $(grep -oE "#[0-9a-fA-F]{6}" ./eval_work4/button.css | wc -l) -eq 0
```
