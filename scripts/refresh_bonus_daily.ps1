param(
    [string]$WindowStart = "2025-11-01 00:00:00",
    [string]$WindowEnd = "2026-03-26 00:00:00",
    [string]$FreebetsStart = "2025-11-11 00:00:00",
    [switch]$UpdateWatermark
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$ts] $message" -ForegroundColor Cyan
}

function Write-Note($message) {
    Write-Host "    $message" -ForegroundColor DarkGray
}

function Get-FileInfo($path) {
    if (-not (Test-Path $path)) {
        return $null
    }
    return Get-Item $path
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Step "Repo root: $repoRoot"
Write-Note "Run this from an activated venv so the repo dependencies are available."
Write-Note "Window end is exclusive. 2026-03-26 includes all of 2026-03-25."

$bonusBefore = Get-FileInfo "data/serving/bonus_daily.parquet"
if ($bonusBefore) {
    Write-Note "Existing bonus_daily.parquet: $($bonusBefore.LastWriteTime) | $([math]::Round($bonusBefore.Length / 1KB, 1)) KB"
}

$csvBefore = Get-FileInfo "data/serving/bonus_daily.csv"
if ($csvBefore) {
    Write-Note "Existing bonus_daily.csv:     $($csvBefore.LastWriteTime) | $([math]::Round($csvBefore.Length / 1MB, 2)) MB"
}

$bonusArgs = @(
    "-m", "src.extract.incremental_bonus",
    "--window-start", $WindowStart,
    "--window-end", $WindowEnd,
    "--freebets-start", $FreebetsStart
)

if ($UpdateWatermark) {
    $bonusArgs += "--update-watermark"
}

Write-Step "START bonus backfill extract"
$sw = [System.Diagnostics.Stopwatch]::StartNew()
python @bonusArgs
$sw.Stop()
Write-Step "DONE  bonus backfill extract in $([math]::Round($sw.Elapsed.TotalSeconds, 1))s"

Write-Step "START domain KPI rebuild"
$sw = [System.Diagnostics.Stopwatch]::StartNew()
python -m src.kpis.build_domain_kpis
$sw.Stop()
Write-Step "DONE  domain KPI rebuild in $([math]::Round($sw.Elapsed.TotalSeconds, 1))s"

Write-Step "START CSV export"
$sw = [System.Diagnostics.Stopwatch]::StartNew()
python .\scripts\export_serving_csvs.py
$sw.Stop()
Write-Step "DONE  CSV export in $([math]::Round($sw.Elapsed.TotalSeconds, 1))s"

$bonusAfter = Get-FileInfo "data/serving/bonus_daily.parquet"
if ($bonusAfter) {
    Write-Note "Updated bonus_daily.parquet: $($bonusAfter.LastWriteTime) | $([math]::Round($bonusAfter.Length / 1KB, 1)) KB"
}

$csvAfter = Get-FileInfo "data/serving/bonus_daily.csv"
if ($csvAfter) {
    Write-Note "Updated bonus_daily.csv:     $($csvAfter.LastWriteTime) | $([math]::Round($csvAfter.Length / 1MB, 2)) MB"
}

Write-Step "Run complete"
Write-Note "Next step: upload data/serving/bonus_daily.csv into Supabase when ready."
