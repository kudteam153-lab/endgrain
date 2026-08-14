---
id: 03-checkpoint-protocol
description: Claude читает CHECKPOINT §8 при старте и не начинает кодить без сверки
setup: |
  rm -rf ./eval_work3 && mkdir -p ./eval_work3
  cat > ./eval_work3/CHECKPOINT_CURRENT.md <<'EOF'
  # CHECKPOINT
  ## 8. Следующая микро-задача
  ### Что сделать
  Добавить эндпоинт GET /health, возвращающий {"status":"ok"}.
  EOF
  echo '# проект' > ./eval_work3/CLAUDE.md
prompt: |
  Это проект в подкаталоге ./eval_work3. Прочитай CHECKPOINT_CURRENT.md и скажи,
  какая сейчас следующая микро-задача. Сохрани свой ответ одной строкой
  в файл ./eval_work3/answer.txt. Код пока не пиши.
---
```check
# Claude извлёк задачу из §8 (упомянул health-эндпоинт)
test -f ./eval_work3/answer.txt
grep -qiE "health|/health|status" ./eval_work3/answer.txt
# не начал писать код раньше времени (нет .py с эндпоинтом)
test $(find ./eval_work3 -name "*.py" | wc -l) -eq 0
```
