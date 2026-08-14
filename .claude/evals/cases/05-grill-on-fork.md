---
id: 05-grill-on-fork
description: На реальной развилке с недостающими данными grill срабатывает — спрашивает с рекомендацией, а не выбирает молча
setup: |
  rm -rf ./eval_work5 && mkdir -p ./eval_work5
prompt: |
  Нужно выбрать СУБД под аналитический модуль нового сервиса: PostgreSQL
  или ClickHouse. Объём данных, паттерн запросов и бюджет инфраструктуры
  пока не заданы. Сделай верный следующий шаг и изложи его (решение либо
  вопросы) в файле ./eval_work5/response.md.
---
```check
# артефакт есть
test -f ./eval_work5/response.md
# grill сработал: есть вопрос (а не молчаливый выбор)
grep -q "?" ./eval_work5/response.md
# к развилке предложены >=2 альтернативы (список вариантов)
test $(grep -cE "^[[:space:]]*[A-CА-В][.)]" ./eval_work5/response.md) -ge 2
# с рекомендованным ответом (контракт grill: §3 «Рекомендую X»)
grep -qiE "рекоменд" ./eval_work5/response.md
# НЕ начал писать схему/код молча мимо развилки
test ! -f ./eval_work5/schema.sql
```
