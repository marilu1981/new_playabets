param(
    [switch]$IncludeSelfExclusions,
    [switch]$IncludeSessions,
    [switch]$IncludeBonusCampaignPerformance,
    [switch]$SkipCore,
    [switch]$SkipBuilds
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
        } else {
            Write-Note "Still no files matched $OutputFilter in $OutputDir"
        }
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Step "Repo root: $repoRoot"
Write-Note "Run this from an activated venv so the repo dependencies are available."
Write-Note "Core mode runs bonus, casino, first_deposits, then the two KPI builds."
Write-Note "Deferred extracts are opt-in: selfexclusions, sessions, bonus campaign performance."

if (-not $SkipCore) {
    Invoke-ModuleStep `
        -Module "src.extract.incremental_bonus" `
        -Label "bonus extract" `
        -OutputDir "data/raw/bonus" `
        -OutputFilter "bonuses_increment_*.parquet"

    Invoke-ModuleStep `
        -Module "src.extract.incremental_casino" `
        -Label "casino extract" `
        -OutputDir "data/raw/casino" `
        -OutputFilter "casino_increment_*.parquet"

    Invoke-ModuleStep `
        -Module "src.extract.incremental_first_deposits" `
        -Label "first deposits extract" `
        -OutputDir "data/raw/first_deposits" `
        -OutputFilter "first_deposits_increment_*.parquet"
}

if ($IncludeSelfExclusions) {
    Invoke-ModuleStep `
        -Module "src.extract.incremental_selfexclusions" `
        -Label "selfexclusions extract" `
        -OutputDir "data/raw/selfexclusions" `
        -OutputFilter "*.parquet"
} else {
    Write-Note "Skipping selfexclusions extract (use -IncludeSelfExclusions to run it)."
}

if ($IncludeSessions) {
    Invoke-ModuleStep `
        -Module "src.extract.incremental_sessions" `
        -Label "sessions extract" `
        -OutputDir "data/raw/sessions" `
        -OutputFilter "sessions_increment_*.parquet"
} else {
    Write-Note "Skipping sessions extract (use -IncludeSessions to run it)."
}

if ($IncludeBonusCampaignPerformance) {
    Invoke-ModuleStep `
        -Module "src.extract.incremental_bonus_campaign_performance" `
        -Label "bonus campaign performance extract" `
        -OutputDir "data/raw/bonus" `
        -OutputFilter "campaign_performance_*.parquet"
} else {
    Write-Note "Skipping bonus campaign performance extract (use -IncludeBonusCampaignPerformance to run it)."
}

if (-not $SkipBuilds) {
    Invoke-ModuleStep `
        -Module "src.kpis.build_daily_kpis" `
        -Label "daily KPI build" `
        -OutputDir "data/serving" `
        -OutputFilter "daily_kpis.parquet"

    Invoke-ModuleStep `
        -Module "src.kpis.build_domain_kpis" `
        -Label "domain KPI build" `
        -OutputDir "data/serving" `
        -OutputFilter "*.parquet"
} else {
    Write-Note "Skipping KPI builds (use without -SkipBuilds to run them)."
}

Write-Step "Run complete"
Write-Note "If all steps succeed, the next operational step is loading refreshed serving outputs into Supabase."
