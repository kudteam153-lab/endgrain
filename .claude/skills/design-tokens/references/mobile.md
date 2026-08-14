# Мапа токенов: Mobile (Kotlin / Jetpack Compose)

Канон → три файла темы. Композаблы берут значения ТОЛЬКО из MaterialTheme / LocalDimens / LocalMotion.

```kotlin
// ui/theme/Color.kt — из канона, имена ролей, не оттенков
val Bg = Color(0xFF______)
val Surface_ = Color(0xFF______)
val Text = Color(0xFF______)
val Text2 = Color(0xFF______)
val Accent = Color(0xFF______)

// ui/theme/Type.kt — шкала из канона, sp
val Display = FontFamily(Font(R.font.display_bold, FontWeight.Bold))
val Body = FontFamily(Font(R.font.body_regular), Font(R.font.body_medium, FontWeight.Medium))
// Typography: размеры = канон-шкала, lineHeight = размер × коэффициент канона

// ui/theme/Theme.kt
private val LightColors = lightColorScheme(
    background = Bg, surface = Surface_, primary = Accent,
    onBackground = Text, onSurfaceVariant = Text2, /* ... */
)
// Расширенные токены сверх Material-схемы — через CompositionLocal:
data class Dimens(val s1: Dp = 4.dp, val s2: Dp = 8.dp, val s3: Dp = 12.dp,
    val s4: Dp = 16.dp, val s5: Dp = 24.dp, val s6: Dp = 32.dp, val s7: Dp = 48.dp,
    val radius: Dp = __.dp)
val LocalDimens = staticCompositionLocalOf { Dimens() }
data class Motion(val micro: Int = 120, val standard: Int = 240, val scene: Int = 400)
val LocalMotion = staticCompositionLocalOf { Motion() }
```

Тёмная тема: отдельная `darkColorScheme` из канона (тёмная база с тоном палитры, НЕ #000; акцент осветлён на 1-2 шага). Структурные токены (Dimens, Type, Motion) общие для обеих тем.

## Mobile-специфика
- Размеры текста — sp, всё остальное — dp. Никогда наоборот.
- Тач-таргет ≥ 48dp: `Modifier.minimumInteractiveComponentSize()` или явный sizeIn.
- Edge-to-edge: учитывай WindowInsets (status/navigation bar, ime) — стиль не освобождает от инсетов.
- Стиль ≠ отказ от платформы: back-жест, поведение клавиатуры, системный share — нативные. Кастомизируется внешний слой (цвет, форма, типографика), не механика.
- Шрифты в `res/font/`, проверка кириллицы и весов до фиксации.
- Состояния экрана обязательны: loading / empty / error — дизайнятся, а не «потом».
- Скриншоты для критика: Roborazzi — light + dark + fontScale 1.3, ключевые экраны целиком + кропы зон контролов.
- Производительность: без Modifier.blur на больших областях в скролле, без бесконечных анимаций вне видимости.
