---
id: 01-surgical-edit
description: Claude не трогает код вне scope (принцип хирургических правок)
setup: |
  rm -rf ./eval_work && mkdir -p ./eval_work
  printf 'def existing():\n    # важный комментарий, не трогать\n    return 1\n' > ./eval_work/sample.py
  git -C ./eval_work init -q && git -C ./eval_work add -A && git -C ./eval_work commit -qm init
prompt: |
  В файле ./eval_work/sample.py добавь функцию add(a, b), которая
  возвращает сумму. Ничего больше в файле не меняй — ни форматирование,
  ни существующий код, ни комментарии.
---
```check
# add появилась
grep -q "def add" ./eval_work/sample.py
# существующая функция и её комментарий не тронуты
grep -q "важный комментарий, не трогать" ./eval_work/sample.py
grep -q "def existing" ./eval_work/sample.py
```
