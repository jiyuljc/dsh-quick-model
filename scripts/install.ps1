<#
.SYNOPSIS
    Install dsh-quick-model into a DSH profile.

.DESCRIPTION
    A thin, embeddable wrapper around the one command that actually installs a
    DSH plugin:

        dsh plugin --profile <profile> add <source>

    It adds what a caller embedding this in a larger installer wants: a clear
    failure when `dsh` is missing, an optional post-install verification using
    the package's own contract checks, and the restart reminder that a bundle
    install requires (a profile's bundle list is a boot-time snapshot, so a new
    bundle is never hot-mounted).

    A caller that also drives the browser must force a page reload after the
    restart: the client module list is read from the page's __DSH_BOOT__ wire at
    load time, so an already-open tab keeps running the previous module set.

.PARAMETER Profile
    DSH profile name. Defaults to `web`.

.PARAMETER Source
    Anything `pnpm add` accepts. Defaults to the npm package name.
      npm      dsh-quick-model
      GitHub   github:jiyuljc/dsh-quick-model
               git+https://github.com/jiyuljc/dsh-quick-model.git
      local    D:\path\to\dsh-quick-model  or  .\dsh-quick-model-1.0.1.tgz
    A GitHub Release tarball URL also works, but only once a Release exists —
    this repository currently has no tags, so such a URL is a 404.

.PARAMETER SkipVerify
    Skip the post-install contract check. Use when `scripts/validate.mjs` is
    not shipped alongside this script.

.EXAMPLE
    .\install.ps1
    .\install.ps1 -Profile web -Source github:jiyuljc/dsh-quick-model

.NOTES
    Exit codes: 0 installed, 1 the install failed, 2 `dsh` is not on PATH,
    3 installed but the contract check failed.
#>
[CmdletBinding()]
param(
    [string]$Profile = 'web',
    [string]$Source = 'dsh-quick-model',
    [switch]$SkipVerify
)

$ErrorActionPreference = 'Stop'

function Fail([int]$Code, [string]$Message) {
    Write-Error $Message
    exit $Code
}

if (-not (Get-Command dsh -ErrorAction SilentlyContinue)) {
    Fail 2 "dsh is not on PATH. Install the DeepSeek Harness CLI first, then re-run."
}

# DSH_HOME wins; a profile under the legacy ~/.dsh is the fallback.
$home_ = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$profileDir = Join-Path $home_ "profiles\$Profile"

Write-Host "dsh-quick-model: installing '$Source' into profile '$Profile'"
& dsh plugin --profile $Profile add $Source
if ($LASTEXITCODE -ne 0) {
    Fail 1 "dsh plugin add failed with exit code $LASTEXITCODE."
}

$validator = Join-Path $PSScriptRoot 'validate.mjs'
if ($SkipVerify -or -not (Test-Path $validator)) {
    if (-not $SkipVerify) {
        Write-Warning "validate.mjs not found next to this script; skipping the contract check."
    }
} else {
    Write-Host 'dsh-quick-model: verifying the installed package'
    & node $validator $profileDir 'dsh-quick-model'
    if ($LASTEXITCODE -ne 0) {
        Fail 3 "the package installed but failed its contract check. Run 'dsh plugin --profile $Profile remove dsh-quick-model' to back out."
    }
}

Write-Host ''
Write-Host "Installed. RESTART DSH to activate it - a profile's bundle list is read at"
Write-Host "boot, so a newly added bundle is not hot-mounted."
Write-Host ''
Write-Host "Then open Settings -> Models. To remove it later:"
Write-Host "  dsh plugin --profile $Profile remove dsh-quick-model"
exit 0
