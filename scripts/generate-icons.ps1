# =====================================================================
# generate-icons.ps1 — генератор PNG-иконок для PWA «Заметки»
# Практическое занятие №14. Web App Manifest.
# =====================================================================
#
# Зачем нужен этот скрипт:
#   Web App Manifest требует набор PNG-иконок разных размеров:
#   16/32 (favicon), 152 (Apple touch icon), 192/512 (Android/PWA),
#   и промежуточные. Скрипт рисует их одним прогоном через
#   .NET-классы System.Drawing — без сторонних зависимостей.
#
# Запуск (из корня проекта):
#   powershell -ExecutionPolicy Bypass -File .\notes-app\scripts\generate-icons.ps1
#
# Что рисует:
#   - Сплошной заливочный фон (theme color #4285f4, как в манифесте)
#   - Скруглённые углы (для приятного вида в Chrome / на Android)
#   - Большую белую букву «Н» (Notes/Заметки) по центру
#   - Безопасную зону: контент занимает ~60% от полного размера,
#     чтобы при обрезке (purpose: maskable) ничего не отрезалось.
#
# Студенту на заметку: System.Drawing — это часть GDI+ из .NET Framework.
# На Windows работает из коробки, без установки доп. библиотек.
# Там же есть Graphics.SmoothingMode, который включает антиалиасинг.
# =====================================================================

# Подключаем сборку System.Drawing — она содержит классы Bitmap, Graphics, Brush и т.д.
Add-Type -AssemblyName System.Drawing

# Папка, куда сохраняем PNG. Берём её через путь относительно скрипта,
# чтобы запуск работал из любого CWD.
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$IconsDir  = Join-Path (Split-Path -Parent $ScriptDir) 'icons'

# Если папки icons ещё нет — создаём (на случай первого запуска).
if (-not (Test-Path $IconsDir)) {
    New-Item -ItemType Directory -Path $IconsDir | Out-Null
}

# Размеры иконок, которые нужны Web App Manifest.
# Минимум по заданию — 3 шт., но удобнее покрыть весь набор:
#   16/32 — favicon (вкладка браузера, история)
#   48/64/128 — промежуточные (Windows, hi-DPI экраны)
#   152 — Apple touch icon (iPad/iPhone «На главный экран»)
#   192 — стандарт Android (минимальный для PWA-установки)
#   256 — для Windows-ярлыков
#   512 — splash screen + maskable icon (обязательный для PWA)
$Sizes = @(16, 32, 48, 64, 128, 152, 192, 256, 512)

# Цвета берём ровно из manifest.json и theme-color, чтобы в SplashScreen
# на Android не было «прыжка» цветов.
$BgColor   = [System.Drawing.ColorTranslator]::FromHtml('#4285f4')  # фон иконки
$FgColor   = [System.Drawing.Color]::White                          # цвет буквы

foreach ($size in $Sizes) {
    Write-Host "Генерирую иконку ${size}x${size}..."

    # Bitmap — это «холст» в оперативной памяти. На него мы и будем рисовать.
    $bitmap = New-Object System.Drawing.Bitmap $size, $size

    # Graphics — объект, через который выполняются операции рисования.
    $g = [System.Drawing.Graphics]::FromImage($bitmap)

    # Настройки качества:
    #  - AntiAlias: сглаживает контуры (без лесенок)
    #  - HighQuality: лучшее качество интерполяции при масштабировании
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Заливка фона. Сначала — прозрачным (на случай, если потом захотим
    # рисовать со скруглением и оставлять прозрачные углы).
    $g.Clear([System.Drawing.Color]::Transparent)

    # Радиус скругления углов: 20% от размера. Чем меньше иконка,
    # тем менее заметно скругление, но цифры выглядят аккуратно.
    $radius = [int]([Math]::Max(2, $size * 0.20))

    # Рисуем «прямоугольник со скруглёнными углами» через GraphicsPath.
    # GDI+ не имеет прямого FillRoundedRectangle, поэтому собираем путь
    # из 4 дуг + соединяющих линий.
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc(0,            0,            $d, $d, 180, 90)  # верхний левый
    $path.AddArc($size - $d,   0,            $d, $d, 270, 90)  # верхний правый
    $path.AddArc($size - $d,   $size - $d,   $d, $d,   0, 90)  # нижний правый
    $path.AddArc(0,            $size - $d,   $d, $d,  90, 90)  # нижний левый
    $path.CloseFigure()

    # Заливаем путь синим фоном.
    $bgBrush = New-Object System.Drawing.SolidBrush $BgColor
    $g.FillPath($bgBrush, $path)

    # Текст «Н» — символ заметок (Notes).
    # Размер шрифта подбираем динамически: ~55% от размера иконки.
    # Так буква получится крупной, но не упрётся в края (важно для maskable).
    $fontSize = [single]([Math]::Max(8, $size * 0.55))
    $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

    # StringFormat с Center/Center даёт ровное центрирование текста
    # внутри прямоугольника, без ручного измерения ширины глифа.
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment     = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center

    # Прямоугольник, в который укладываем текст: весь холст.
    $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size

    $fgBrush = New-Object System.Drawing.SolidBrush $FgColor
    $g.DrawString('Н', $font, $fgBrush, $rect, $fmt)

    # Освобождаем GDI-ресурсы: в .NET они не очищаются GC мгновенно,
    # а файлы держатся открытыми. Полезная привычка — Dispose() явно.
    $bgBrush.Dispose()
    $fgBrush.Dispose()
    $font.Dispose()
    $path.Dispose()
    $g.Dispose()

    # Сохраняем как PNG. Имя совпадает с тем, что указано в manifest.json.
    $outPath = Join-Path $IconsDir "icon-${size}x${size}.png"
    $bitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
}

Write-Host ""
Write-Host "Готово. Иконки сохранены в: $IconsDir" -ForegroundColor Green
Get-ChildItem $IconsDir | Select-Object Name, Length | Format-Table -AutoSize
