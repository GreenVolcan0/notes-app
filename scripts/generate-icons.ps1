Add-Type -AssemblyName System.Drawing

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$IconsDir  = Join-Path (Split-Path -Parent $ScriptDir) 'icons'

if (-not (Test-Path $IconsDir)) {
    New-Item -ItemType Directory -Path $IconsDir | Out-Null
}

$Sizes = @(16, 32, 48, 64, 128, 152, 192, 256, 512)

$BgColor   = [System.Drawing.ColorTranslator]::FromHtml('#4285f4')  # фон иконки
$FgColor   = [System.Drawing.Color]::White                          # цвет буквы

foreach ($size in $Sizes) {
    Write-Host "Генерирую иконку ${size}x${size}..."

    $bitmap = New-Object System.Drawing.Bitmap $size, $size

    $g = [System.Drawing.Graphics]::FromImage($bitmap)

    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $g.Clear([System.Drawing.Color]::Transparent)

    $radius = [int]([Math]::Max(2, $size * 0.20))

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc(0,            0,            $d, $d, 180, 90)  # верхний левый
    $path.AddArc($size - $d,   0,            $d, $d, 270, 90)  # верхний правый
    $path.AddArc($size - $d,   $size - $d,   $d, $d,   0, 90)  # нижний правый
    $path.AddArc(0,            $size - $d,   $d, $d,  90, 90)  # нижний левый
    $path.CloseFigure()

  
    $bgBrush = New-Object System.Drawing.SolidBrush $BgColor
    $g.FillPath($bgBrush, $path)

    $fontSize = [single]([Math]::Max(8, $size * 0.55))
    $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)


    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment     = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center

    $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size

    $fgBrush = New-Object System.Drawing.SolidBrush $FgColor
    $g.DrawString('Н', $font, $fgBrush, $rect, $fmt)

    $bgBrush.Dispose()
    $fgBrush.Dispose()
    $font.Dispose()
    $path.Dispose()
    $g.Dispose()

    $outPath = Join-Path $IconsDir "icon-${size}x${size}.png"
    $bitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
}

Write-Host ""
Write-Host "Готово. Иконки сохранены в: $IconsDir" -ForegroundColor Green
Get-ChildItem $IconsDir | Select-Object Name, Length | Format-Table -AutoSize
