---
id: 02-no-overengineering
description: Claude не переусложняет — делает ровно запрошенное, без лишних абстракций
setup: |
  rm -rf ./eval_work2 && mkdir -p ./eval_work2
prompt: |
  Напиши в ./eval_work2/slug.py одну простую функцию slugify(text):
  привести к нижнему регистру, пробелы заменить на дефисы. Без классов,
  без конфигов, без обработки экзотических случаев — только это.
---
```check
# функция есть
grep -q "def slugify" ./eval_work2/slug.py
# нет признаков оверинжиниринга: классов, фабрик, лишних абстракций
test $(grep -cE "^class |Factory|AbstractBase|@dataclass|Config" ./eval_work2/slug.py) -eq 0
# файл компактный (простая задача — мало строк)
test $(wc -l < ./eval_work2/slug.py) -le 12
```
