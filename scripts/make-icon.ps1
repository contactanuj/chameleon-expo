# make-icon.ps1 - generates assets/icon.png (1024x1024) for The Chameleon.
# Clean, modern flat chameleon silhouette. Pure System.Drawing (GDI+), no tools.
# Pick a palette with -Style A|B|C  (default B). Run: powershell -File scripts\make-icon.ps1 -Style B
param([ValidateSet('A','B','C')][string]$Style = 'B')
Add-Type -AssemblyName System.Drawing
$S = 1024
function C([int]$a,[int]$r,[int]$g2,[int]$b){ [System.Drawing.Color]::FromArgb($a,$r,$g2,$b) }
function RoundPen($brushOrCol,$w){ $p=New-Object System.Drawing.Pen($brushOrCol,$w); $p.StartCap=[System.Drawing.Drawing2D.LineCap]::Round; $p.EndCap=[System.Drawing.Drawing2D.LineCap]::Round; $p.LineJoin=[System.Drawing.Drawing2D.LineJoin]::Round; $p }
function PtF($x,$y){ New-Object System.Drawing.PointF ([single]$x),([single]$y) }

function Build-Body {
  $bp = New-Object System.Drawing.Drawing2D.GraphicsPath
  $bp.AddBezier(748,540, 740,508, 726,478, 700,456)   # snout tip -> brow
  $bp.AddBezier(700,456, 690,418, 672,384, 636,356)   # brow -> casque peak (up & back)
  $bp.AddBezier(636,356, 626,392, 614,420, 598,446)   # casque back edge -> nape
  $bp.AddBezier(598,446, 520,452, 448,472, 372,500)   # arched back
  $bp.AddBezier(372,500, 356,512, 356,540, 372,560)   # back -> tail base
  $bp.AddBezier(372,560, 440,602, 502,606, 560,600)   # belly
  $bp.AddBezier(560,600, 602,596, 628,576, 654,556)   # belly -> jaw
  $bp.AddBezier(654,556, 690,550, 720,548, 748,540)   # jaw -> snout (close)
  $bp.CloseFigure(); return $bp
}
function Build-TailPts {
  $cx=300.0;$cy=602.0;$rOut=150.0;$rIn=24.0;$turns=1.4;$startDeg=-42.0;$steps=90
  $pts=New-Object System.Collections.ArrayList
  for($i=0;$i -le $steps;$i++){ $t=$i/$steps;$ang=($startDeg+$t*$turns*360.0)*[Math]::PI/180.0;$r=$rOut-($rOut-$rIn)*$t;[void]$pts.Add((PtF ($cx+$r*[Math]::Cos($ang)) ($cy+$r*[Math]::Sin($ang)))) }
  return [System.Drawing.PointF[]]$pts.ToArray([System.Drawing.PointF])
}
function Draw-Chameleon($g, $fill, $eye) {
  $tail=New-Object System.Drawing.Drawing2D.GraphicsPath; $tail.AddCurve((Build-TailPts),0.5)
  $g.DrawPath((RoundPen $fill 70), $tail)
  foreach($leg in @(@(470,556,452,648,470,704),@(596,556,618,648,600,704))){
    $lp=New-Object System.Drawing.Drawing2D.GraphicsPath
    $lp.AddCurve([System.Drawing.PointF[]]@((PtF $leg[0] $leg[1]),(PtF $leg[2] $leg[3]),(PtF $leg[4] $leg[5])))
    $g.DrawPath((RoundPen $fill 40), $lp)
    $g.FillEllipse($fill, ($leg[4]-26),($leg[5]-12),52,26)
  }
  $g.FillPath($fill, (Build-Body))
  foreach($p in @(@(548,456),@(492,464),@(436,476),@(398,488))){
    $x=$p[0];$y=$p[1]; $g.FillPolygon($fill, @((PtF ($x-18) ($y+7)),(PtF $x ($y-18)),(PtF ($x+18) ($y+7))))
  }
  $g.FillEllipse($eye, 686, 468, 30, 30)
}

$bmp=New-Object System.Drawing.Bitmap $S,$S
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$rect=New-Object System.Drawing.Rectangle 0,0,$S,$S

switch ($Style) {
  'A' { $c1=(C 255 70 176 110); $c2=(C 255 10 60 35); $fill=(New-Object System.Drawing.SolidBrush (C 255 240 246 226)); $eye=(New-Object System.Drawing.SolidBrush (C 255 12 60 35)) }
  'C' { $c1=(C 255 26 36 32); $c2=(C 255 9 20 17); $emRect=New-Object System.Drawing.Rectangle 150,346,620,400; $fill=(New-Object System.Drawing.Drawing2D.LinearGradientBrush($emRect,(C 255 122 222 150),(C 255 38 156 122),60.0)); $eye=(New-Object System.Drawing.SolidBrush (C 255 12 24 20)) }
  default { $c1=(C 255 26 140 92); $c2=(C 255 17 104 68); $fill=(New-Object System.Drawing.SolidBrush (C 255 255 255 255)); $eye=(New-Object System.Drawing.SolidBrush (C 255 20 120 80)) }
}
$g.FillRectangle((New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect,$c1,$c2,90.0)), $rect)
$g.TranslateTransform(512.0,512.0); $g.ScaleTransform(1.16,1.16); $g.TranslateTransform(-452.0,-528.0)
Draw-Chameleon $g $fill $eye
$g.ResetTransform()
$g.Dispose()
$out = Join-Path (Split-Path $PSScriptRoot -Parent) "assets\icon.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "saved $out (style $Style)"
