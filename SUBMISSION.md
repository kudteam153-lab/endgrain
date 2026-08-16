# SUBMISSION — материалы заявки

> **Назначение.** Всё, что уходит организаторам Вайбатона, и чек-лист, по которому это сверяется. Заводится на дне 6, исполняется на дне 7.
>
> **Источник требований.** `FACTS.md #F-11` (обязательный минимум), `#F-12` (что присылать), `#F-13` (критерии оценки), `#F-14` (бонусы).

---

## 1. Чек-лист обязательного минимума (`#F-11`)

| Требование                    | Где в продукте                                                                    | Статус |
| ----------------------------- | --------------------------------------------------------------------------------- | ------ |
| Редактор узора                | панель слева: породы, ширины, узор, переклейка                                    | ✅     |
| Несколько пород или цветов    | десять пород из `#F-09`, палитра 2–4 на доску                                     | ✅     |
| Поворот и отражение элементов | узоры «Зеркало», «Диагональ», переклейка «Корзинка» — всё через трансформы модели | ✅     |
| Настройка размеров доски      | длина, толщина, толщина ламели, пропил, длина заготовки                           | ✅     |
| Сохранение проекта            | автосохранение в localStorage, файл JSON, ссылка с рецептом                       | ✅     |
| Экспорт изображения узора     | SVG, PNG, плюс PDF на три листа                                                   | ✅     |

## 2. Что присылаем (`#F-12`)

| Пункт                           | Что именно                                                                                                                                              | Статус |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Ссылка на продукт               | https://kudteam153-lab.github.io/tanegi-bench/ | ✅ |
| Ссылка на репозиторий           | https://github.com/kudteam153-lab/tanegi-bench (публичный) | ✅ |
| Видео или GIF                   | `submission/tanegi-demo.mp4` (263 КБ), `tanegi-demo.gif` (801 КБ), анимированный `tanegi-demo.svg` | ✅ |
| Примеры досок                   | четыре ссылки с рецептом в хеше и PNG каждой — §4 | ✅ |
| Как изготовить доску по проекту | абзац в тексте заявки §5, разворот — листы 02 и 03 | ✅ |

---

## 3. Сценарий видео — тридцать секунд

Снимать экраном, без озвучки, с подписями в кадре. Порядок такой, потому что он повторяет путь столяра: сначала узор, потом проверка, потом документы.

> **Сценарий писался до смены дизайн-системы (`#D-22`).** Кнопки «В объёме» больше нет: объём включается переключателем `2D / 3D` на самом листе, и у него четыре вида — изометрия, сверху, сбоку, с торца. Строку 18–23 снимать по новому интерфейсу.

| Секунды | Что в кадре                                                          | Подпись                                           |
| ------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| 0–4     | Открытая доска, нажать «Сгенерировать» три раза подряд               | «Узор собирает грамматика, а не случайные числа»  |
| 4–9     | «Варианты» — сетка из двенадцати, навести на одну, нажать «похожие»  | «Двенадцать вариантов. У любого — своя родня»     |
| 9–13    | Клик по варианту, он открывается в чертеже; поменять породу в панели | «Пересчёт мгновенный»                             |
| 13–18   | Поставить толщину ламели 8 мм — вылезает предупреждение              | «Что нельзя изготовить, здесь не рисуется»        |
| 18–23   | «В объёме», повернуть доску мышью                                    | «Доска в объёме — из того же узора, что и чертёж» |
| 23–28   | Лист 02 и лист 03: таблицы, порядок работ, схема сборки              | «Раскрой, смета и порядок работ»                  |
| 28–30   | Нажать PDF, показать открытый файл на три страницы                   | «PDF — и на верстак»                              |

Чего в видео не делать: не показывать пустой экран в начале (доска есть сразу), не листать код, не объяснять голосом то, что видно.

---

## 4. Примеры досок

Четыре доски разного строя. Ссылка несёт рецепт целиком — открывается той же доской у любого.

### Крупная шахматка

Дуб и клён, ламель 60 мм — самый спокойный строй, с него обычно начинают.

[Открыть доску](https://kudteam153-lab.github.io/tanegi-bench/#d=eyJsYW1lbGxhVGhpY2tuZXNzTW0iOjYwLCJibGFua0xlbmd0aE1tIjoxMjAwLCJib2FyZExNbSI6NDAwLCJib2FyZEhNbSI6NDAsImtlcmZNbSI6My4yLCJ1bml0cyI6Im1tIiwic2VlZCI6MTAxLCJwYXR0ZXJuIjoiY2hlY2tlciIsImxhbWVsbGFzIjpbeyJzcGVjaWVzSWQiOiJvYWsiLCJ3aWR0aE1tIjo2MH0seyJzcGVjaWVzSWQiOiJtYXBsZSIsIndpZHRoTW0iOjYwfSx7InNwZWNpZXNJZCI6Im9hayIsIndpZHRoTW0iOjYwfSx7InNwZWNpZXNJZCI6Im1hcGxlIiwid2lkdGhNbSI6NjB9LHsic3BlY2llc0lkIjoib2FrIiwid2lkdGhNbSI6NjB9LHsic3BlY2llc0lkIjoibWFwbGUiLCJ3aWR0aE1tIjo2MH1dfQ) · снимок: `submission/ex1-shahmatka.png`

### Диагональ

Нарастающий сдвиг ряд за рядом. Четыре породы, орех держит контраст.

[Открыть доску](https://kudteam153-lab.github.io/tanegi-bench/#d=eyJsYW1lbGxhVGhpY2tuZXNzTW0iOjQwLCJibGFua0xlbmd0aE1tIjoxMjAwLCJib2FyZExNbSI6NDAwLCJib2FyZEhNbSI6NDAsImtlcmZNbSI6My4yLCJ1bml0cyI6Im1tIiwic2VlZCI6MjAyLCJwYXR0ZXJuIjoiZGlhbW9uZCIsImxhbWVsbGFzIjpbeyJzcGVjaWVzSWQiOiJvYWsiLCJ3aWR0aE1tIjozNX0seyJzcGVjaWVzSWQiOiJtYXBsZSIsIndpZHRoTW0iOjM1fSx7InNwZWNpZXNJZCI6IndhbG51dCIsIndpZHRoTW0iOjM1fSx7InNwZWNpZXNJZCI6ImFzaCIsIndpZHRoTW0iOjM1fSx7InNwZWNpZXNJZCI6Im9hayIsIndpZHRoTW0iOjM1fSx7InNwZWNpZXNJZCI6Im1hcGxlIiwid2lkdGhNbSI6MzV9LHsic3BlY2llc0lkIjoid2FsbnV0Iiwid2lkdGhNbSI6MzV9LHsic3BlY2llc0lkIjoiYXNoIiwid2lkdGhNbSI6MzV9LHsic3BlY2llc0lkIjoib2FrIiwid2lkdGhNbSI6MzV9XX0) · снимок: `submission/ex2-diagonal.png`

### Кирпич с переклейкой

Панель режется вдоль, полосы разворачиваются и клеятся заново — рисунок становится двумерным.

[Открыть доску](https://kudteam153-lab.github.io/tanegi-bench/#d=eyJsYW1lbGxhVGhpY2tuZXNzTW0iOjQwLCJibGFua0xlbmd0aE1tIjoxMjAwLCJib2FyZExNbSI6NDAwLCJib2FyZEhNbSI6NDAsImtlcmZNbSI6My4yLCJ1bml0cyI6Im1tIiwic2VlZCI6MzAzLCJwYXR0ZXJuIjoiYnJpY2siLCJsYW1lbGxhcyI6W3sic3BlY2llc0lkIjoid2FsbnV0Iiwid2lkdGhNbSI6MzB9LHsic3BlY2llc0lkIjoibWFwbGUiLCJ3aWR0aE1tIjozMH0seyJzcGVjaWVzSWQiOiJ3YWxudXQiLCJ3aWR0aE1tIjozMH0seyJzcGVjaWVzSWQiOiJtYXBsZSIsIndpZHRoTW0iOjMwfSx7InNwZWNpZXNJZCI6IndhbG51dCIsIndpZHRoTW0iOjMwfSx7InNwZWNpZXNJZCI6Im1hcGxlIiwid2lkdGhNbSI6MzB9LHsic3BlY2llc0lkIjoid2FsbnV0Iiwid2lkdGhNbSI6MzB9LHsic3BlY2llc0lkIjoibWFwbGUiLCJ3aWR0aE1tIjozMH1dLCJ3ZWF2ZXMiOlt7InN0cmlwV2lkdGhNbSI6MzAsImNvdW50Ijo3LCJraW5kIjoicm90YXRlIn1dfQ) · снимок: `submission/ex3-brick-weave.png`

### Доска с экзотикой

Падук, амарант и зебрано, переклейка «корзинка». Красиво и дорого — смета на листе 02 показывает это честно.

[Открыть доску](https://kudteam153-lab.github.io/tanegi-bench/#d=eyJsYW1lbGxhVGhpY2tuZXNzTW0iOjQwLCJibGFua0xlbmd0aE1tIjoxMjAwLCJib2FyZExNbSI6NDAwLCJib2FyZEhNbSI6NDAsImtlcmZNbSI6My4yLCJ1bml0cyI6Im1tIiwic2VlZCI6NDA0LCJwYXR0ZXJuIjoiY2hlY2tlciIsImxhbWVsbGFzIjpbeyJzcGVjaWVzSWQiOiJtYXBsZSIsIndpZHRoTW0iOjMyfSx7InNwZWNpZXNJZCI6InBhZGF1ayIsIndpZHRoTW0iOjMyfSx7InNwZWNpZXNJZCI6Im1hcGxlIiwid2lkdGhNbSI6MzJ9LHsic3BlY2llc0lkIjoicHVycGxlaGVhcnQiLCJ3aWR0aE1tIjozMn0seyJzcGVjaWVzSWQiOiJtYXBsZSIsIndpZHRoTW0iOjMyfSx7InNwZWNpZXNJZCI6InplYnJhd29vZCIsIndpZHRoTW0iOjMyfSx7InNwZWNpZXNJZCI6Im1hcGxlIiwid2lkdGhNbSI6MzJ9LHsic3BlY2llc0lkIjoicGFkYXVrIiwid2lkdGhNbSI6MzJ9XSwid2VhdmVzIjpbeyJzdHJpcFdpZHRoTW0iOjMyLCJjb3VudCI6Niwia2luZCI6ImJhc2tldCJ9XX0) · снимок: `submission/ex4-exotic.png`

---

## 5. Текст заявки — готов к отправке

> Пост-комментарий со ссылкой, поэтому коротко. Видео прикладывается файлом:
> `submission/tanegi-demo.mp4` (263 КБ) или `tanegi-demo.gif` (801 КБ).
> Есть и анимированный SVG — `tanegi-demo.svg`, открывается в браузере,
> но 1.9 МБ и на части площадок SVG режется, поэтому он запасной.

---

**Tanegi Bench** — узор торцевой разделочной доски и план, по которому её можно изготовить.

https://kudteam153-lab.github.io/tanegi-bench/

Доска здесь не картинка, а стек столярных операций: склеить ламели, отрезать поперёк, переклеить, отрезать снова. Из этого стека выводится всё остальное — поэтому раскрой не расходится с превью, а узор, который не собрать на верстаке, нельзя и нарисовать: модель его не выражает.

Толщина пропила 3.2 мм считается везде — в длине заготовки, в числе плашек, в смете. Поставьте ламель 8 мм, и приложение скажет: из заготовки 1200 мм выйдет 24 плашки вместо нужных 50, возьмите 2460 мм.

Что внутри:
— генератор узора по seed, двенадцать вариантов за раз, мутация и скрещивание отложенных;
— лист «Раскрой»: заготовки к покупке, порядок работ, расход по породам, себестоимость;
— доска в объёме из той же геометрии, что и чертёж, четыре вида;
— PDF на три страницы;
— ссылка несёт рецепт целиком: открыл у себя — увидел ту же доску.

**Как изготовить доску по проекту.** Лист 01 — чертёж с размерами и штампом, над ним брусок с намеченным резом: видно, откуда берётся узор. Лист 02 — что купить, в каком порядке резать и клеить, сколько уйдёт в опилки, сколько стоит материал. Лист 03 — сборка по шагам: панель перед каждым резом с намеченными линиями, рядом карта заправки. Распечатал три листа — пошёл к верстаку.

Имя из ремесла: 種木 «танэги» — блок из реек в хаконэ-ёсэги, который режут поперёк, чтобы узор проявился на торце. Это то же производство, что у торцевой доски, только на сто семьдесят лет старше.

Репозиторий: https://github.com/kudteam153-lab/tanegi-bench
Сделано за неделю Вайбатона, история коммитов публичная.

---

---

_Конец. Заполняется на дне 7, до отправки заявки._
