param(
    [switch]$IncludeCasinoExtract,
    [switch]$SkipSessionsExtract,
    [switch]$SkipCsvExport
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$ts] $message" -ForegroundColor Cyan
}

function Write-Note($message) {
    Write-Host "    $message" -ForegroundColor DarkGray
}

function Get-LatestMatch($path, $filter) {
    if (-not (Test-Path $path)) {
        return $null
    }
    return Get-ChildItem $path -Filter $filter -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

function Invoke-ModuleStep {
    param(
        [Parameter(Mandatory = $true)][string]$Module,
        [Parameter(Mandatory = $true)][string]$Label,
        [string]$OutputDir,
        [string]$OutputFilter
    )

    Write-Step "START $Label"
    if ($OutputDir -and $OutputFilter) {
        $before = Get-LatestMatch $OutputDir $OutputFilter
        if ($before) {
            Write-Note "Latest matching file before run: $($before.Name) | $($before.LastWriteTime)"
        } else {
            Write-Note "No existing files matched $OutputFilter in $OutputDir"
        }
    }

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    python -m $Module
    $sw.Stop()

    Write-Step "DONE  $Label in $([math]::Round($sw.Elapsed.TotalSeconds, 1))s"
    if ($OutputDir -and $OutputFilter) {
        $after = Get-LatestMatch $OutputDir $OutputFilter
        if ($after) {
            Write-Note "Latest matching file after run:  $($after.Name) | $($after.LastWriteTime)"
        }
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Step "Repo root: $repoRoot"
Write-Note "Run this from an activated venv so the repo dependencies are available."
Write-Note "This refreshes the cross-product RFM build using users + betslips + sessions + casino raw data."

if (-not $SkipSessionsExtract) {
    Invoke-ModuleStep `
        -Module "src.extract.incremental_sessions" `
        -Label "sessions extract" `
        -OutputDir "data/raw/sessions" `
        -OutputFilter "sessions_increment_*.parquet"
} else {
    Write-Note "Skipping sessions extract (use without -SkipSessionsExtract to run it)."
}

if ($IncludeCasinoExtract) {
    Invoke-ModuleStep `
        -Module "src.extract.incremental_casino" `
        -Label "casino extract" `
        -OutputDir "data/raw/casino" `
        -OutputFilter "casino_increment_*.parquet"
} else {
    Write-Note "Skipping casino extract (use -IncludeCasinoExtract to run it)."
}

Invoke-ModuleStep `
    -Module "src.kpis.build_daily_kpis" `
    -Label "daily KPI + cross-product RFM build" `
    -OutputDir "data/serving" `
    -OutputFilter "rfm_users.parquet"

if (-not $SkipCsvExport) {
    Write-Step "START CSV export"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    python .\scripts\export_serving_csvs.py
    $sw.Stop()
    Write-Step "DONE  CSV export in $([math]::Round($sw.Elapsed.TotalSeconds, 1))s"
} else {
    Write-Note "Skipping CSV export (use without -SkipCsvExport to run it)."
}

Write-Step "Run complete"
Write-Note "Primary outputs: data/serving/daily_kpis.parquet and data/serving/rfm_users.parquet"
