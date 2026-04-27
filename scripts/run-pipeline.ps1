# Run the full Bangladesh -> Japan promo pipeline end-to-end on Windows
# PowerShell. Auto-discovers the source video in public/ so most invocations
# need no arguments. Each step is skippable so you can resume from where you
# left off.
#
# Usage examples:
#   .\scripts\run-pipeline.ps1                          # auto-pick source from public/
#   .\scripts\run-pipeline.ps1 -Src "public/foo.MP4"    # explicit override
#   .\scripts\run-pipeline.ps1 -ViralOnly               # re-run only 5b
#   .\scripts\run-pipeline.ps1 -SkipViral               # JapanPromo only
#   .\scripts\run-pipeline.ps1 -SkipPolish -SkipTranscribe   # resume mid-run
#
# Defaults: runs steps 1 -> 5a (JapanPromo) -> 5b (ImasFrontierViralCut).

[CmdletBinding()]
param(
    # Path to the raw interview video. If omitted, auto-discovered: the
    # script picks the largest video file in public/ that is NOT one of
    # the pipeline-generated outputs.
    [string]$Src,

    # Source video duration in seconds. Auto-detected via ffmpeg if omitted.
    [double]$Duration = 0,

    # silencedetect noise threshold (dB). Auto-detected via loudnorm input_thresh
    # if omitted.
    [double]$Threshold = 0,

    [switch]$SkipSilenceDetect,
    [switch]$SkipPolish,
    [switch]$SkipEnhance,
    [switch]$SkipTranscribe,
    [switch]$SkipTranslate,
    [switch]$SkipJapanPromo,
    [switch]$SkipViral,
    [switch]$ViralOnly,             # only re-run 5b
    [switch]$NoRender               # build assets but don't run remotion render
)

$ErrorActionPreference = "Stop"
# Note: $PSNativeCommandUseErrorActionPreference is PS 7.3+ only; PS 5.1
# silently ignores it, so we check exit codes manually below.

# Resolve to project root (parent of scripts/)
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Invoke-Native {
    # Run a native exe and throw if it returns non-zero. Avoids PS 5.1's
    # "2>&1 wraps stderr as ErrorRecord and breaks $?" trap.
    param(
        [Parameter(Mandatory = $true)][string]$Exe,
        [string[]]$Args = @()
    )
    & $Exe @Args
    if ($LASTEXITCODE -ne 0) {
        throw "$Exe exited with code $LASTEXITCODE"
    }
}

function Invoke-Ffmpeg {
    # ffmpeg writes informational/warning text to stderr, and PS 5.1 with
    # ErrorActionPreference=Stop treats every stderr line of a native command
    # as a fatal NativeCommandError, ABORTING THE SCRIPT before `2> file`
    # redirection can do its job. Workaround: locally suspend the Stop
    # preference, redirect stderr to a file, swallow stdout, then return
    # the real exit code so the caller can decide what's fatal.
    param(
        [Parameter(Mandatory = $true)][string[]]$ArgList,
        [Parameter(Mandatory = $true)][string]$StderrPath
    )
    if (Test-Path $StderrPath) { Remove-Item $StderrPath -Force }
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $FfmpegExe @ArgList 2> $StderrPath > $null
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
}

# Locate system ffmpeg. The project already requires it for polish-audio.mjs
# (uses agate / afftdn / dynaudnorm filters not present in the Remotion-bundled
# build), so insist on it being on PATH.
$FfmpegCmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $FfmpegCmd) {
    throw "ffmpeg not found on PATH. Install it (winget install Gyan.FFmpeg) and reopen the terminal."
}
$FfmpegExe = $FfmpegCmd.Source

# ---------------------------------------------------------------------------
# Auto-discover source video in public/ if -Src wasn't passed
# ---------------------------------------------------------------------------
$GeneratedNames = @(
    "main-enhanced.mp4",
    "main-polished.mp4",
    "viral-cut.mp4"
)
$VideoExts = @(".mp4", ".mov", ".mkv", ".m4v", ".avi", ".webm")

if (-not $Src) {
    Write-Host "auto-discovering source video in public/ ..." -ForegroundColor DarkGray
    if (-not (Test-Path "public")) {
        throw "public/ directory not found. Run from project root or pass -Src explicitly."
    }
    $candidates = Get-ChildItem -Path "public" -File |
        Where-Object { $VideoExts -contains $_.Extension.ToLower() } |
        Where-Object { $GeneratedNames -notcontains $_.Name.ToLower() } |
        Sort-Object Length -Descending

    if ($candidates.Count -eq 0) {
        throw "No source video found in public/. Drop your interview MP4 there or pass -Src."
    }
    if ($candidates.Count -gt 1) {
        Write-Host "  multiple candidates found, picking largest:" -ForegroundColor DarkYellow
        foreach ($c in $candidates) {
            $sizeMB = [Math]::Round($c.Length / 1MB, 1)
            $marker = if ($c -eq $candidates[0]) { "*" } else { " " }
            Write-Host ("   {0} {1}  ({2} MB)" -f $marker, $c.Name, $sizeMB) -ForegroundColor DarkYellow
        }
        Write-Host "  (pass -Src to choose a different one)" -ForegroundColor DarkYellow
    }
    $Src = "public/" + $candidates[0].Name
    Write-Host "  -> $Src" -ForegroundColor Green
}

if (-not (Test-Path $Src)) {
    throw "Source video not found: $Src"
}

function Step($label) {
    Write-Host ""
    Write-Host ("=" * 72) -ForegroundColor DarkCyan
    Write-Host "  $label" -ForegroundColor Cyan
    Write-Host ("=" * 72) -ForegroundColor DarkCyan
}

function Skip($label, $reason = "skipped") {
    Write-Host ""
    Write-Host "-- $label  ($reason)" -ForegroundColor DarkYellow
}

if ($ViralOnly) {
    $SkipSilenceDetect = $true
    $SkipPolish        = $true
    $SkipEnhance       = $true
    $SkipTranscribe    = $true
    $SkipTranslate     = $true
    $SkipJapanPromo    = $true
}

# ---------------------------------------------------------------------------
# Auto-detect duration and threshold up front (only if needed by un-skipped steps)
# ---------------------------------------------------------------------------
$needsDuration  = -not $SkipSilenceDetect -and $Duration -eq 0
$needsThreshold = -not $SkipSilenceDetect -and $Threshold -eq 0

if ($needsDuration) {
    Step "Probing source duration (mediabunny)"
    $probeOut = & node scripts/probe-source.mjs "$Src"
    if ($LASTEXITCODE -ne 0) {
        throw "probe-source.mjs failed. Pass -Duration explicitly."
    }
    foreach ($line in $probeOut) {
        if ($line -match "^duration=(\d+(?:\.\d+)?)") {
            $Duration = [double]$Matches[1]
            Write-Host "  duration = $Duration s" -ForegroundColor Green
        }
    }
    if ($Duration -le 0) {
        throw "Could not determine duration from probe output. Pass -Duration explicitly."
    }
}

if ($needsThreshold) {
    Step "Probing loudness floor (loudnorm input_thresh)"
    # ffmpeg's loudnorm JSON goes to stderr; capture via the helper so PS 5.1
    # doesn't choke on benign warnings like "Missing key frame ...".
    $loudLog = Join-Path $env:TEMP "imas-loudnorm.log"
    $exit = Invoke-Ffmpeg -StderrPath $loudLog -ArgList @(
        "-hide_banner", "-nostats",
        "-i", "$Src",
        "-map", "0:a",
        "-af", "loudnorm=print_format=json",
        "-f", "null", "NUL"
    )
    $loud = if (Test-Path $loudLog) { Get-Content $loudLog -Raw } else { "" }
    if ($exit -ne 0) {
        throw "ffmpeg loudnorm probe exited $exit. See $loudLog."
    }
    if ($loud -match '"input_thresh"\s*:\s*"?(-?\d+(?:\.\d+)?)"?') {
        $Threshold = [Math]::Floor([double]$Matches[1])
        Write-Host "  threshold = $Threshold dB" -ForegroundColor Green
    } else {
        throw "Could not parse input_thresh from loudnorm output (see $loudLog). Pass -Threshold explicitly."
    }
}

# ---------------------------------------------------------------------------
# Step 1 -- silencedetect -> silences.ts
# ---------------------------------------------------------------------------
if (-not $SkipSilenceDetect) {
    Step "Step 1 -- silencedetect"
    $log = Join-Path $env:TEMP "imas-silences.log"
    $exit = Invoke-Ffmpeg -StderrPath $log -ArgList @(
        "-hide_banner", "-nostats",
        "-i", "$Src",
        "-map", "0:a",
        "-af", "silencedetect=noise=$($Threshold)dB:d=0.5",
        "-f", "null", "NUL"
    )
    if ($exit -ne 0) {
        throw "ffmpeg silencedetect exited $exit. See $log."
    }
    Invoke-Native -Exe "node" -Args @("scripts/parse-silences.mjs", "$log", "$Duration")
} else { Skip "Step 1 -- silencedetect" }

# ---------------------------------------------------------------------------
# Step 2 -- polish (silence-stripped, denoised) -> main-polished.mp4 + cutmap.ts
# ---------------------------------------------------------------------------
if (-not $SkipPolish) {
    Step "Step 2 -- polish-audio"
    & node scripts/polish-audio.mjs
} else { Skip "Step 2 -- polish-audio" }

# ---------------------------------------------------------------------------
# Step 2b -- enhanced full-length file for Whisper (silences kept)
# ---------------------------------------------------------------------------
if (-not $SkipEnhance) {
    Step "Step 2b -- main-enhanced.mp4 (Whisper input)"
    & ffmpeg -y -i "$Src" -map 0:v -map 0:a `
        -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -r 30 `
        -c:a aac -b:a 192k `
        -af "highpass=f=80,lowpass=f=14000,afftdn=nr=12,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,loudnorm=I=-14:TP=-1.5:LRA=8,alimiter=limit=0.89" `
        public/main-enhanced.mp4
} else { Skip "Step 2b -- main-enhanced.mp4" }

# ---------------------------------------------------------------------------
# Step 3 -- transcribe (faster-whisper large-v3 + mozilla-ai/whisper-large-v3-bn)
# ---------------------------------------------------------------------------
if (-not $SkipTranscribe) {
    Step "Step 3 -- transcribe"
    $env:PYTHONIOENCODING = "utf-8"
    if (-not $env:WHISPER_MODEL) { $env:WHISPER_MODEL = "large-v3" }
    if (-not $env:BN_MODEL)      { $env:BN_MODEL      = "mozilla-ai/whisper-large-v3-bn" }
    & python scripts/transcribe.py public/main-enhanced.mp4
} else { Skip "Step 3 -- transcribe" }

# ---------------------------------------------------------------------------
# Step 4 -- translate (NLLB-200 / Transformers.js)
# ---------------------------------------------------------------------------
if (-not $SkipTranslate) {
    Step "Step 4 -- translate-nllb"
    & node scripts/translate-nllb.mjs
} else { Skip "Step 4 -- translate-nllb" }

# ---------------------------------------------------------------------------
# Step 5a -- JapanPromo: build-captions + lint + render
# ---------------------------------------------------------------------------
if (-not $SkipJapanPromo) {
    Step "Step 5a -- JapanPromo build + render"
    & node scripts/build-captions.mjs
    & npm run lint
    if (-not $NoRender) {
        & npx remotion render JapanPromo
    } else { Write-Host "  -NoRender set, skipping remotion render" -ForegroundColor DarkYellow }
} else { Skip "Step 5a -- JapanPromo" }

# ---------------------------------------------------------------------------
# Step 5b -- ImasFrontierViralCut: pick + concat + render
# Requires `ollama serve` to be running with gemma4:e4b pulled.
# ---------------------------------------------------------------------------
if (-not $SkipViral) {
    Step "Step 5b -- ImasFrontierViralCut build + render"
    Write-Host "  (requires `ollama serve` running with gemma4:e4b)" -ForegroundColor DarkGray
    & npm run build:viral
    if (-not $NoRender) {
        & npm run render:viral
    } else { Write-Host "  -NoRender set, skipping remotion render" -ForegroundColor DarkYellow }
} else { Skip "Step 5b -- ImasFrontierViralCut" }

Write-Host ""
Write-Host ("=" * 72) -ForegroundColor Green
Write-Host "  Pipeline complete." -ForegroundColor Green
Write-Host ("=" * 72) -ForegroundColor Green
if (-not $SkipJapanPromo -and -not $NoRender) {
    Write-Host "  JapanPromo            -> out/japan-promo.mp4"
}
if (-not $SkipViral -and -not $NoRender) {
    Write-Host "  ImasFrontierViralCut  -> out/imas-frontier-viral.mp4"
}
