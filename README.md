# Tanegi Bench

Узор торцевой разделочной доски и план, по которому её можно изготовить.

**Приложение:** https://kudteam153-lab.github.io/tanegi-bench/

![Как работает](submission/tanegi-demo.gif)

## Что это

Доска здесь не картинка, а стек столярных операций: склеить ламели, отрезать
поперёк, переклеить, отрезать снова. Из этого стека выводится всё остальное —
поэтому раскрой не расходится с превью, а узор, который не собрать на верстаке,
нельзя и нарисовать: модель его не выражает.

Толщина пропила 3.2 мм считается везде: в длине заготовки, в числе плашек, в
смете. Поставьте ламель 8 мм — приложение скажет, что из заготовки 1200 мм
выйдет 24 плашки вместо нужных 50, и предложит взять 2460 мм.

## Что внутри

- генератор узора по seed: двенадцать вариантов за раз, мутация и скрещивание
  отложенных;
- лист «Раскрой» — заготовки к покупке, порядок работ, расход по породам,
  себестоимость;
- доска в объёме из той же геометрии, что и чертёж, четыре вида;
- PDF на три страницы;
- ссылка несёт рецепт целиком: открыл у себя — увидел ту же доску.

## Как изготовить доску по проекту

Лист 01 — чертёж с размерами и штампом, над ним брусок с намеченным резом:
видно, откуда берётся узор. Лист 02 — что купить, в каком порядке резать и
клеить, сколько уйдёт в опилки, сколько стоит материал. Лист 03 — сборка по
шагам: панель перед каждым резом с намеченными линиями, рядом карта заправки.
Распечатал три листа — пошёл к верстаку.

## Примеры

Ссылка содержит рецепт целиком и открывается той же доской у любого.

| Доска                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Строй                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| [Крупная шахматка](https://kudteam153-lab.github.io/tanegi-bench/#d=eyJsYW1lbGxhVGhpY2tuZXNzTW0iOjYwLCJibGFua0xlbmd0aE1tIjoxMjAwLCJib2FyZExNbSI6NDAwLCJib2FyZEhNbSI6NDAsImtlcmZNbSI6My4yLCJ1bml0cyI6Im1tIiwic2VlZCI6MTAxLCJwYXR0ZXJuIjoiY2hlY2tlciIsImxhbWVsbGFzIjpbeyJzcGVjaWVzSWQiOiJvYWsiLCJ3aWR0aE1tIjo2MH0seyJzcGVjaWVzSWQiOiJtYXBsZSIsIndpZHRoTW0iOjYwfSx7InNwZWNpZXNJZCI6Im9hayIsIndpZHRoTW0iOjYwfSx7InNwZWNpZXNJZCI6Im1hcGxlIiwid2lkdGhNbSI6NjB9LHsic3BlY2llc0lkIjoib2FrIiwid2lkdGhNbSI6NjB9LHsic3BlY2llc0lkIjoibWFwbGUiLCJ3aWR0aE1tIjo2MH1dfQ)                                                                                                                                                                                          | Дуб и клён, ламель 60 мм                       |
| [Диагональ](https://kudteam153-lab.github.io/tanegi-bench/#d=eyJsYW1lbGxhVGhpY2tuZXNzTW0iOjQwLCJibGFua0xlbmd0aE1tIjoxMjAwLCJib2FyZExNbSI6NDAwLCJib2FyZEhNbSI6NDAsImtlcmZNbSI6My4yLCJ1bml0cyI6Im1tIiwic2VlZCI6MjAyLCJwYXR0ZXJuIjoiZGlhbW9uZCIsImxhbWVsbGFzIjpbeyJzcGVjaWVzSWQiOiJvYWsiLCJ3aWR0aE1tIjozNX0seyJzcGVjaWVzSWQiOiJtYXBsZSIsIndpZHRoTW0iOjM1fSx7InNwZWNpZXNJZCI6IndhbG51dCIsIndpZHRoTW0iOjM1fSx7InNwZWNpZXNJZCI6ImFzaCIsIndpZHRoTW0iOjM1fSx7InNwZWNpZXNJZCI6Im9hayIsIndpZHRoTW0iOjM1fSx7InNwZWNpZXNJZCI6Im1hcGxlIiwid2lkdGhNbSI6MzV9LHsic3BlY2llc0lkIjoid2FsbnV0Iiwid2lkdGhNbSI6MzV9LHsic3BlY2llc0lkIjoiYXNoIiwid2lkdGhNbSI6MzV9LHsic3BlY2llc0lkIjoib2FrIiwid2lkdGhNbSI6MzV9XX0)                                                        | Нарастающий сдвиг, четыре породы               |
| [Кирпич с переклейкой](https://kudteam153-lab.github.io/tanegi-bench/#d=eyJsYW1lbGxhVGhpY2tuZXNzTW0iOjQwLCJibGFua0xlbmd0aE1tIjoxMjAwLCJib2FyZExNbSI6NDAwLCJib2FyZEhNbSI6NDAsImtlcmZNbSI6My4yLCJ1bml0cyI6Im1tIiwic2VlZCI6MzAzLCJwYXR0ZXJuIjoiYnJpY2siLCJsYW1lbGxhcyI6W3sic3BlY2llc0lkIjoid2FsbnV0Iiwid2lkdGhNbSI6MzB9LHsic3BlY2llc0lkIjoibWFwbGUiLCJ3aWR0aE1tIjozMH0seyJzcGVjaWVzSWQiOiJ3YWxudXQiLCJ3aWR0aE1tIjozMH0seyJzcGVjaWVzSWQiOiJtYXBsZSIsIndpZHRoTW0iOjMwfSx7InNwZWNpZXNJZCI6IndhbG51dCIsIndpZHRoTW0iOjMwfSx7InNwZWNpZXNJZCI6Im1hcGxlIiwid2lkdGhNbSI6MzB9LHsic3BlY2llc0lkIjoid2FsbnV0Iiwid2lkdGhNbSI6MzB9LHsic3BlY2llc0lkIjoibWFwbGUiLCJ3aWR0aE1tIjozMH1dLCJ3ZWF2ZXMiOlt7InN0cmlwV2lkdGhNbSI6MzAsImNvdW50Ijo3LCJraW5kIjoicm90YXRlIn1dfQ)  | Панель режется вдоль, полосы разворачиваются   |
| [Экзотика](https://kudteam153-lab.github.io/tanegi-bench/#d=eyJsYW1lbGxhVGhpY2tuZXNzTW0iOjQwLCJibGFua0xlbmd0aE1tIjoxMjAwLCJib2FyZExNbSI6NDAwLCJib2FyZEhNbSI6NDAsImtlcmZNbSI6My4yLCJ1bml0cyI6Im1tIiwic2VlZCI6NDA0LCJwYXR0ZXJuIjoiY2hlY2tlciIsImxhbWVsbGFzIjpbeyJzcGVjaWVzSWQiOiJtYXBsZSIsIndpZHRoTW0iOjMyfSx7InNwZWNpZXNJZCI6InBhZGF1ayIsIndpZHRoTW0iOjMyfSx7InNwZWNpZXNJZCI6Im1hcGxlIiwid2lkdGhNbSI6MzJ9LHsic3BlY2llc0lkIjoicHVycGxlaGVhcnQiLCJ3aWR0aE1tIjozMn0seyJzcGVjaWVzSWQiOiJtYXBsZSIsIndpZHRoTW0iOjMyfSx7InNwZWNpZXNJZCI6InplYnJhd29vZCIsIndpZHRoTW0iOjMyfSx7InNwZWNpZXNJZCI6Im1hcGxlIiwid2lkdGhNbSI6MzJ9LHsic3BlY2llc0lkIjoicGFkYXVrIiwid2lkdGhNbSI6MzJ9XSwid2VhdmVzIjpbeyJzdHJpcFdpZHRoTW0iOjMyLCJjb3VudCI6Niwia2luZCI6ImJhc2tldCJ9XX0) | Падук, амарант, зебрано, переклейка «корзинка» |

## Откуда имя

種木 «танэги» — блок из реек в хаконэ-ёсэги, японской мозаике по дереву: блок
режут поперёк, чтобы узор проявился на торце. Это то же производство, что у
торцевой доски, только на сто семьдесят лет старше.

## Разработка

Статика без бэкенда: React + Vite + TypeScript, SVG-рендер, three.js для
объёма, jsPDF для документов. Состояние в localStorage, шаринг через URL-хеш.

```
npm install
npm run dev        # разработка
npm test           # 236 тестов
npm run build      # проверка типов и сборка
```

Ядро в [`src/core/`](src/core/) — типы столярных операций и `simulate()`.
Неизготавливаемое состояние там невыразимо, и на этом стоит всё остальное.

Сделано за неделю Вайбатона №1.
