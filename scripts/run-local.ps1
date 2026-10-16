param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("api", "web", "baileys")]
    [string]$Service
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env"

if (-not (Test-Path $envFile)) {
    throw "Missing $envFile. Copy .env.example to .env and configure local settings first."
}

foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*(#|$)') {
        continue
    }
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
        throw "Invalid .env entry. Expected KEY=VALUE."
    }

    $name = $Matches[1]
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2 -and (($value[0] -eq "'" -and $value[-1] -eq "'") -or ($value[0] -eq '"' -and $value[-1] -eq '"'))) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    Set-Item -Path "Env:$name" -Value $value
}

foreach ($requiredName in @("API_BIND", "API_PORT", "WEB_BIND", "WEB_PORT", "NEXT_PUBLIC_API_URL", "GATEWAY_TOKEN", "WEBHOOK_SECRET")) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($requiredName))) {
        throw "Set $requiredName in .env before starting local services."
    }
}

switch ($Service) {
    "api" {
        if ([string]::IsNullOrWhiteSpace($env:LOCAL_DATABASE_URL)) {
            throw "Set LOCAL_DATABASE_URL to your Laragon MySQL connection in .env."
        }
        if ([string]::IsNullOrWhiteSpace($env:WEB_ORIGIN)) {
            throw "Set WEB_ORIGIN to the browser origin in .env."
        }
        if ([string]::IsNullOrWhiteSpace($env:BAILEYS_GATEWAY_URL_LOCAL)) {
            throw "Set BAILEYS_GATEWAY_URL_LOCAL in .env."
        }
        $env:DATABASE_URL = $env:LOCAL_DATABASE_URL
        $env:BAILEYS_GATEWAY_URL = $env:BAILEYS_GATEWAY_URL_LOCAL
        $env:BIND_ADDRESS = "$($env:API_BIND):$($env:API_PORT)"
        Set-Location (Join-Path $repoRoot "backend")
        cargo run
    }
    "web" {
        Set-Location (Join-Path $repoRoot "web")
        npm run dev -- --hostname $env:WEB_BIND --port $env:WEB_PORT
    }
    "baileys" {
        if ([string]::IsNullOrWhiteSpace($env:BAILEYS_PORT) -or [string]::IsNullOrWhiteSpace($env:BACKEND_STATUS_WEBHOOK_BASE_LOCAL)) {
            throw "Set BAILEYS_PORT and BACKEND_STATUS_WEBHOOK_BASE_LOCAL in .env."
        }
        $env:BAILEYS_AUTH_DIR = Join-Path $repoRoot "baileys\auth_info"
        $env:BACKEND_STATUS_WEBHOOK_URL = "$($env:BACKEND_STATUS_WEBHOOK_BASE_LOCAL)/api/v1/webhooks/gateway/$($env:WEBHOOK_SECRET)"
        Set-Location (Join-Path $repoRoot "baileys")
        node index.js
    }
}

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
