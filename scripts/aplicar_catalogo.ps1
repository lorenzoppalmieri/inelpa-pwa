# ============================================================
# APLICAR EL CATALOGO DE SAP
#
# USO (desde la carpeta inelpa-pwa):
#   powershell -ExecutionPolicy Bypass -File scripts\aplicar_catalogo.ps1
#
# Busca "LISTA DE SEMI.txt" en los lugares donde suele estar, lo copia a
# docs\ y corre el importador con --aplicar.
#
# POR QUE EXISTE: la ruta del export cambia cada vez (Descargas, Escritorio,
# la carpeta de adjuntos de Claude...) y escribirla a mano ya fallo tres veces.
# ============================================================
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$destino = Join-Path $raiz 'docs\LISTA DE SEMI.txt'

if (Test-Path $destino) {
  Write-Host "Ya esta en docs\, se usa esa copia." -ForegroundColor Green
} else {
  $lugares = @(
    "$env:USERPROFILE\Downloads",
    "$env:USERPROFILE\Desktop",
    "$env:USERPROFILE\Documents",
    "$env:APPDATA\Claude",
    "$env:LOCALAPPDATA\Packages"
  ) | Where-Object { Test-Path $_ }

  $f = Get-ChildItem -Path $lugares -Filter 'LISTA DE SEMI.txt' -Recurse -File -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1

  if (-not $f) {
    Write-Host ""
    Write-Host "NO SE ENCONTRO 'LISTA DE SEMI.txt'." -ForegroundColor Red
    Write-Host "Arrastralo a esta carpeta y volve a correr el script:" -ForegroundColor Yellow
    Write-Host "  $(Join-Path $raiz 'docs')" -ForegroundColor Yellow
    exit 1
  }

  Write-Host "Encontrado: $($f.FullName)" -ForegroundColor Cyan
  New-Item -ItemType Directory -Force -Path (Join-Path $raiz 'docs') | Out-Null
  Copy-Item $f.FullName $destino -Force
}

node scripts/importar_catalogo.mjs $destino --aplicar
