param(
  [string]$Version = (Get-Date -Format "yyyyMMdd-HHmmss"),
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\artifacts"),
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

Push-Location (Join-Path $projectRoot "frontend")
try {
  if (-not $SkipInstall) {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci frontend gagal" }
  }
  $previousApiBase = $env:VITE_API_BASE_URL
  try {
    $env:VITE_API_BASE_URL = ""
    npm run lint
    if ($LASTEXITCODE -ne 0) { throw "lint frontend gagal" }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "build frontend gagal" }

    $builtCssFiles = Get-ChildItem -LiteralPath (Join-Path (Get-Location) "dist\assets") -File -Filter "*.css"
    if (-not $builtCssFiles) { throw "Build frontend tidak menghasilkan stylesheet" }
    $invalidCss = $builtCssFiles | Select-String -Pattern 'fonts\.googleapis\.com|display=swap["'']'
    if ($invalidCss) {
      throw "Build frontend masih memuat atau menyisakan potongan Google Fonts yang tidak valid"
    }
  } finally {
    $env:VITE_API_BASE_URL = $previousApiBase
  }
} finally {
  Pop-Location
}

Push-Location (Join-Path $projectRoot "backend")
try {
  if (-not $SkipInstall) {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci backend gagal" }
  }
  $files = Get-ChildItem -LiteralPath (Get-Location) -Recurse -File -Filter "*.js" |
    Where-Object { $_.FullName -notmatch "[\\/]node_modules[\\/]" }
  foreach ($file in $files) {
    node --check $file.FullName
    if ($LASTEXITCODE -ne 0) { throw "Pemeriksaan sintaks backend gagal: $($file.FullName)" }
  }
} finally {
  Pop-Location
}

$archive = Join-Path $outputPath "kms-release-$Version.tar.gz"
if (Test-Path -LiteralPath $archive) { throw "Arsip release sudah ada: $archive" }

Push-Location $projectRoot
try {
  tar -czf $archive `
    --exclude=backend/node_modules `
    --exclude=backend/uploads `
    --exclude=backend/.env `
    --exclude=frontend/node_modules `
    --exclude=frontend/.env `
    --exclude=frontend/.env.local `
    --exclude=deploy/artifacts `
    backend frontend/dist deploy README.md
  if ($LASTEXITCODE -ne 0) { throw "Pembuatan arsip release gagal" }
} finally {
  Pop-Location
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
$manifest = Join-Path $outputPath "kms-release-$Version.sha256"
# Manifest checksum dikonsumsi server Linux. Tulis LF secara eksplisit agar
# `sha256sum --check` tidak membaca karakter CR sebagai bagian nama file.
$manifestLine = "$hash  $(Split-Path -Leaf $archive)`n"
[System.IO.File]::WriteAllText($manifest, $manifestLine, [System.Text.Encoding]::ASCII)
Write-Host "Release siap: $archive"
Write-Host "SHA-256: $hash"
