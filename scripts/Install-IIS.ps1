#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Installs Data Nexus Bridge Service on IIS.

.DESCRIPTION
    This script automates the deployment of the Data Nexus Bridge Service
    (Django + React) to IIS on Windows Server.

    Prerequisites:
    - Windows Server 2016+ or Windows 10/11 with IIS
    - PowerShell 5.1 or later
    - Internet connection (for downloading Python, packages)
    - SQL Server instance (local or remote)
    - SSL certificate already installed on the server

    The script can be run in two ways:
    1. From within the repository: .\Install-IIS.ps1
    2. One-liner from GitHub (downloads the repo automatically):
       & ([scriptblock]::Create((irm https://raw.githubusercontent.com/hinkers/data-nexus-bridge-service/master/scripts/Install-IIS.ps1)))

.PARAMETER ConfigFile
    Optional path to a JSON configuration file for unattended installs.

.PARAMETER Branch
    Git branch to use when downloading from GitHub. Default: master

.EXAMPLE
    .\Install-IIS.ps1

.EXAMPLE
    .\Install-IIS.ps1 -ConfigFile .\install-config.json

.EXAMPLE
    # One-liner install from GitHub (recommended)
    & ([scriptblock]::Create((irm https://raw.githubusercontent.com/hinkers/data-nexus-bridge-service/master/scripts/Install-IIS.ps1)))

.EXAMPLE
    # Alternative: Download and run
    $script = irm https://raw.githubusercontent.com/hinkers/data-nexus-bridge-service/master/scripts/Install-IIS.ps1; Invoke-Expression $script

.NOTES
    Author: Data Nexus Bridge
    Version: 1.1.0
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$ConfigFile,

    [Parameter(Mandatory = $false)]
    [string]$Branch = "master"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Ensure Branch has a default value (needed when running via iex)
if ([string]::IsNullOrWhiteSpace($Branch)) {
    $Branch = "master"
}

# Script constants
$SCRIPT_VERSION = "1.1.0"
$PYTHON_VERSION = "3.11.9"
$PYTHON_DOWNLOAD_URL = "https://www.python.org/ftp/python/$PYTHON_VERSION/python-$PYTHON_VERSION-amd64.exe"
$NODE_VERSION = "20.11.0"
$NODE_DOWNLOAD_URL = "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-x64.msi"
$GIT_VERSION = "2.43.0"
$GIT_DOWNLOAD_URL = "https://github.com/git-for-windows/git/releases/download/v$GIT_VERSION.windows.1/Git-$GIT_VERSION-64-bit.exe"
$GITHUB_REPO = "hinkers/data-nexus-bridge-service"
$GITHUB_ZIP_URL = "https://github.com/$GITHUB_REPO/archive/refs/heads/$Branch.zip"

# Colors for output
function Write-Step { param($Message) Write-Host "`n>> $Message" -ForegroundColor Cyan }
function Write-Success { param($Message) Write-Host "   [OK] $Message" -ForegroundColor Green }
function Write-Warning { param($Message) Write-Host "   [!] $Message" -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host "   [X] $Message" -ForegroundColor Red }
function Write-Info { param($Message) Write-Host "   $Message" -ForegroundColor Gray }

# Banner
function Show-Banner {
    Write-Host @"

    =====================================================
     Data Nexus Bridge Service - IIS Installer v$SCRIPT_VERSION
    =====================================================

"@ -ForegroundColor Magenta
}

# Prompt for user input with default value
function Read-PromptWithDefault {
    param(
        [string]$Prompt,
        [string]$Default
    )
    $displayDefault = if ($Default) { " [$Default]" } else { "" }
    $response = Read-Host "$Prompt$displayDefault"
    if ([string]::IsNullOrWhiteSpace($response)) {
        return $Default
    }
    return $response
}

# Prompt for secure string (passwords)
function Read-SecurePrompt {
    param([string]$Prompt)
    $secure = Read-Host $Prompt -AsSecureString
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    return [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
}

# Prompt for yes/no
function Read-YesNo {
    param(
        [string]$Prompt,
        [bool]$Default = $true
    )
    $defaultText = if ($Default) { "Y/n" } else { "y/N" }
    $response = Read-Host "$Prompt [$defaultText]"
    if ([string]::IsNullOrWhiteSpace($response)) {
        return $Default
    }
    return $response -match "^[Yy]"
}

# Check if running as administrator
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Gather configuration from user
function Get-InstallConfiguration {
    Write-Host "`nPlease provide the following configuration details:`n" -ForegroundColor White

    $config = @{}

    # Site configuration
    Write-Host "--- IIS Site Configuration ---" -ForegroundColor Yellow
    $config.SiteName = Read-PromptWithDefault -Prompt "IIS Site Name" -Default "DataNexusBridge"
    $config.SitePort = Read-PromptWithDefault -Prompt "HTTPS Port" -Default "443"
    $config.HostHeader = Read-PromptWithDefault -Prompt "Host Header (domain name, leave empty for any)" -Default ""

    # Paths
    Write-Host "`n--- Installation Paths ---" -ForegroundColor Yellow
    $config.InstallPath = Read-PromptWithDefault -Prompt "Installation directory" -Default "C:\inetpub\DataNexusBridge"
    $config.PythonPath = Read-PromptWithDefault -Prompt "Python installation directory" -Default "C:\Python311"

    # Database configuration
    Write-Host "`n--- SQL Server Configuration ---" -ForegroundColor Yellow
    $config.DbServer = Read-PromptWithDefault -Prompt "SQL Server hostname" -Default "localhost"
    $config.DbName = Read-PromptWithDefault -Prompt "Database name" -Default "DataNexusBridge"
    $config.DbUser = Read-PromptWithDefault -Prompt "Database username" -Default "datanexus_user"
    $config.DbPassword = Read-SecurePrompt -Prompt "Database password"

    # Application settings
    Write-Host "`n--- Application Settings ---" -ForegroundColor Yellow
    $config.SecretKey = Read-PromptWithDefault -Prompt "Django SECRET_KEY (leave empty to generate)" -Default ""
    if ([string]::IsNullOrWhiteSpace($config.SecretKey)) {
        $config.SecretKey = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 50 | ForEach-Object { [char]$_ })
        Write-Info "Generated new SECRET_KEY"
    }

    $config.AllowedHosts = Read-PromptWithDefault -Prompt "Allowed hosts (comma-separated)" -Default "localhost,$($config.HostHeader)"
    $config.Debug = Read-YesNo -Prompt "Enable DEBUG mode (not recommended for production)" -Default $false

    # Affinda configuration
    Write-Host "`n--- Affinda API Configuration ---" -ForegroundColor Yellow
    $config.AffindaApiKey = Read-PromptWithDefault -Prompt "Affinda API Key (leave empty to configure later)" -Default ""
    $config.AffindaApiUrl = Read-PromptWithDefault -Prompt "Affinda API URL" -Default "https://api.affinda.com/v3"

    # SSL Certificate
    Write-Host "`n--- SSL Certificate ---" -ForegroundColor Yellow
    Write-Info "Available certificates in LocalMachine\My store:"

    $certs = Get-ChildItem -Path Cert:\LocalMachine\My | Where-Object { $_.HasPrivateKey }
    if ($certs.Count -eq 0) {
        Write-Warning "No certificates with private keys found!"
        Write-Warning "Please install an SSL certificate before running this script."
        $config.CertThumbprint = ""
    } else {
        $i = 1
        foreach ($cert in $certs) {
            Write-Host "   $i. $($cert.Subject) (Expires: $($cert.NotAfter.ToString('yyyy-MM-dd')))" -ForegroundColor White
            Write-Host "      Thumbprint: $($cert.Thumbprint)" -ForegroundColor Gray
            $i++
        }
        $certIndex = Read-PromptWithDefault -Prompt "Select certificate number" -Default "1"
        $selectedCert = $certs[[int]$certIndex - 1]
        $config.CertThumbprint = $selectedCert.Thumbprint
    }

    # App Pool configuration
    Write-Host "`n--- Application Pool ---" -ForegroundColor Yellow
    $config.AppPoolName = Read-PromptWithDefault -Prompt "Application Pool name" -Default "$($config.SiteName)AppPool"

    # Admin User configuration
    Write-Host "`n--- Admin User ---" -ForegroundColor Yellow
    $config.AdminUsername = Read-PromptWithDefault -Prompt "Admin username" -Default "admin"
    $config.AdminEmail = Read-PromptWithDefault -Prompt "Admin email (optional)" -Default ""

    # Read password securely with confirmation
    $passwordMatch = $false
    while (-not $passwordMatch) {
        $adminPassword = Read-Host "Admin password" -AsSecureString
        $confirmPassword = Read-Host "Confirm password" -AsSecureString

        # Convert to plain text for comparison
        $bstr1 = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminPassword)
        $plain1 = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr1)
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr1)

        $bstr2 = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmPassword)
        $plain2 = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr2)
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr2)

        if ($plain1 -eq $plain2) {
            if ([string]::IsNullOrWhiteSpace($plain1)) {
                Write-Warning "Password cannot be empty. Please try again."
            } else {
                $passwordMatch = $true
                $config.AdminPassword = $plain1
            }
        } else {
            Write-Warning "Passwords do not match. Please try again."
        }

        # Clear temp variables
        $plain1 = $null
        $plain2 = $null
    }

    # Summary
    Write-Host "`n" -NoNewline
    Write-Host "==================== Configuration Summary ====================" -ForegroundColor Cyan
    Write-Host "Site Name:        $($config.SiteName)"
    Write-Host "Port:             $($config.SitePort)"
    Write-Host "Host Header:      $(if ($config.HostHeader) { $config.HostHeader } else { '(any)' })"
    Write-Host "Install Path:     $($config.InstallPath)"
    Write-Host "Python Path:      $($config.PythonPath)"
    Write-Host "Database Server:  $($config.DbServer)"
    Write-Host "Database Name:    $($config.DbName)"
    Write-Host "Debug Mode:       $($config.Debug)"
    Write-Host "SSL Thumbprint:   $(if ($config.CertThumbprint) { $config.CertThumbprint.Substring(0,8) + '...' } else { '(not set)' })"
    Write-Host "Admin Username:   $($config.AdminUsername)"
    Write-Host "===============================================================" -ForegroundColor Cyan

    if (-not (Read-YesNo -Prompt "`nProceed with installation?" -Default $true)) {
        Write-Host "Installation cancelled." -ForegroundColor Yellow
        exit 0
    }

    return $config
}

# Install IIS features
function Install-IISFeatures {
    Write-Step "Installing IIS features..."

    $features = @(
        "IIS-WebServerRole",
        "IIS-WebServer",
        "IIS-CommonHttpFeatures",
        "IIS-HttpErrors",
        "IIS-StaticContent",
        "IIS-DefaultDocument",
        "IIS-DirectoryBrowsing",
        "IIS-ApplicationDevelopment",
        "IIS-CGI",
        "IIS-ISAPIExtensions",
        "IIS-ISAPIFilter",
        "IIS-HealthAndDiagnostics",
        "IIS-HttpLogging",
        "IIS-RequestMonitor",
        "IIS-Security",
        "IIS-RequestFiltering",
        "IIS-Performance",
        "IIS-HttpCompressionStatic",
        "IIS-WebServerManagementTools",
        "IIS-ManagementConsole",
        "NetFx4Extended-ASPNET45",
        "IIS-NetFxExtensibility45",
        "IIS-ASPNET45"
    )

    foreach ($feature in $features) {
        $state = Get-WindowsOptionalFeature -Online -FeatureName $feature -ErrorAction SilentlyContinue
        if ($state -and $state.State -eq "Enabled") {
            Write-Info "$feature already enabled"
        } else {
            try {
                Enable-WindowsOptionalFeature -Online -FeatureName $feature -All -NoRestart | Out-Null
                Write-Success "$feature enabled"
            } catch {
                Write-Warning "Could not enable $feature - $($_.Exception.Message)"
            }
        }
    }

    # Install URL Rewrite module if not present
    $urlRewrite = Get-WebGlobalModule -Name "RewriteModule" -ErrorAction SilentlyContinue
    if (-not $urlRewrite) {
        Write-Info "URL Rewrite module not found. Please install it manually from:"
        Write-Info "https://www.iis.net/downloads/microsoft/url-rewrite"
    }
}

# Install Python
function Install-Python {
    param([string]$PythonPath)

    Write-Step "Installing Python $PYTHON_VERSION..."

    $pythonExe = Join-Path $PythonPath "python.exe"

    if (Test-Path $pythonExe) {
        $version = & $pythonExe --version 2>&1
        Write-Success "Python already installed: $version"
        return
    }

    $installerPath = Join-Path $env:TEMP "python-installer.exe"

    Write-Info "Downloading Python installer..."
    Invoke-WebRequest -Uri $PYTHON_DOWNLOAD_URL -OutFile $installerPath

    Write-Info "Installing Python to $PythonPath..."
    $installArgs = @(
        "/quiet",
        "InstallAllUsers=1",
        "TargetDir=$PythonPath",
        "PrependPath=1",
        "Include_pip=1",
        "Include_test=0"
    )
    Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -NoNewWindow

    if (Test-Path $pythonExe) {
        Write-Success "Python installed successfully"
    } else {
        throw "Python installation failed"
    }

    # Clean up
    Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
}

# Install Node.js (for building frontend)
function Install-NodeJS {
    Write-Step "Checking Node.js..."

    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        $version = & node --version
        Write-Success "Node.js already installed: $version"
        return
    }

    $installerPath = Join-Path $env:TEMP "node-installer.msi"

    Write-Info "Downloading Node.js installer..."
    Invoke-WebRequest -Uri $NODE_DOWNLOAD_URL -OutFile $installerPath

    Write-Info "Installing Node.js..."
    Start-Process -FilePath "msiexec.exe" -ArgumentList "/i", $installerPath, "/quiet", "/norestart" -Wait -NoNewWindow

    # Refresh PATH
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    if ($machinePath -or $userPath) {
        $env:Path = ($machinePath, $userPath | Where-Object { $_ }) -join ";"
    }

    Write-Success "Node.js installed successfully"

    # Clean up
    Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
}

# Install Git
function Install-Git {
    Write-Step "Checking Git..."

    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($git) {
        $version = & git --version
        Write-Success "Git already installed: $version"
        return
    }

    $installerPath = Join-Path $env:TEMP "git-installer.exe"

    Write-Info "Downloading Git installer..."
    Invoke-WebRequest -Uri $GIT_DOWNLOAD_URL -OutFile $installerPath

    Write-Info "Installing Git..."
    $installArgs = @(
        "/VERYSILENT",
        "/NORESTART",
        "/NOCANCEL",
        "/SP-",
        "/CLOSEAPPLICATIONS",
        "/RESTARTAPPLICATIONS",
        "/COMPONENTS=icons,ext\reg\shellhere,assoc,assoc_sh"
    )
    Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -NoNewWindow

    # Refresh PATH
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    if ($machinePath -or $userPath) {
        $env:Path = ($machinePath, $userPath | Where-Object { $_ }) -join ";"
    }

    # Verify installation
    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($git) {
        Write-Success "Git installed successfully"
    } else {
        throw "Git installation failed"
    }

    # Clean up
    Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
}

# Download repository from GitHub
function Get-GitHubRepository {
    param(
        [string]$TargetPath
    )

    Write-Step "Downloading repository from GitHub..."

    $tempZipPath = Join-Path $env:TEMP "datanexus-repo.zip"
    $tempExtractPath = Join-Path $env:TEMP "datanexus-extract"

    # Download the zip file
    Write-Info "Downloading from: $GITHUB_ZIP_URL"
    Invoke-WebRequest -Uri $GITHUB_ZIP_URL -OutFile $tempZipPath

    # Extract
    Write-Info "Extracting archive..."
    if (Test-Path $tempExtractPath) {
        Remove-Item $tempExtractPath -Recurse -Force
    }
    Expand-Archive -Path $tempZipPath -DestinationPath $tempExtractPath -Force

    # Find the extracted folder (GitHub adds branch name suffix)
    $extractedFolder = Get-ChildItem -Path $tempExtractPath -Directory | Select-Object -First 1
    if (-not $extractedFolder) {
        throw "Failed to find extracted repository folder"
    }

    # Create target directory if it doesn't exist
    if (-not (Test-Path $TargetPath)) {
        New-Item -ItemType Directory -Path $TargetPath -Force | Out-Null
    }

    # Move contents to target path
    Write-Info "Moving files to: $TargetPath"
    Get-ChildItem -Path $extractedFolder.FullName | Move-Item -Destination $TargetPath -Force

    # Cleanup
    Remove-Item $tempZipPath -Force -ErrorAction SilentlyContinue
    Remove-Item $tempExtractPath -Recurse -Force -ErrorAction SilentlyContinue

    Write-Success "Repository downloaded to: $TargetPath"
    return $TargetPath
}

# Detect if running from within repo or remotely
function Get-SourcePath {
    # Check if we're running from within a repository
    # $PSScriptRoot is empty when running via iex/Invoke-Expression
    $scriptRoot = $PSScriptRoot
    if (-not $scriptRoot -or [string]::IsNullOrWhiteSpace($scriptRoot)) {
        Write-Info "Running remotely - will download repository from GitHub"
        return $null
    }

    # Check if parent directory contains expected files (manage.py, requirements.txt)
    try {
        $repoRoot = Split-Path -Parent $scriptRoot -ErrorAction Stop
    } catch {
        Write-Info "Could not determine repository root - will download from GitHub"
        return $null
    }

    if (-not $repoRoot -or [string]::IsNullOrWhiteSpace($repoRoot)) {
        Write-Info "Could not determine repository root - will download from GitHub"
        return $null
    }

    $managePy = Join-Path -Path $repoRoot -ChildPath "manage.py"
    $requirements = Join-Path -Path $repoRoot -ChildPath "requirements.txt"

    if ((Test-Path -Path $managePy -ErrorAction SilentlyContinue) -and (Test-Path -Path $requirements -ErrorAction SilentlyContinue)) {
        Write-Info "Running from repository: $repoRoot"
        return $repoRoot
    }

    # Not in a valid repo
    Write-Info "Not running from repository - will download from GitHub"
    return $null
}

# Create application directory and copy files
function Install-Application {
    param(
        [string]$InstallPath,
        [string]$SourcePath
    )

    Write-Step "Installing application files..."

    # Create directory if it doesn't exist
    if (-not (Test-Path $InstallPath)) {
        New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
        Write-Success "Created directory: $InstallPath"
    }

    # Copy application files
    Write-Info "Copying application files..."
    $excludeDirs = @(".git", ".venv", "venv", "__pycache__", "node_modules", ".claude")
    $excludeFiles = @("*.pyc", "*.pyo", ".env", "db.sqlite3")

    # Use robocopy for efficient copying
    $robocopyArgs = @(
        $SourcePath,
        $InstallPath,
        "/E",
        "/XD", ($excludeDirs -join " "),
        "/XF", ($excludeFiles -join " "),
        "/NFL", "/NDL", "/NJH", "/NJS"
    )

    # Simple copy instead for better control
    Get-ChildItem -Path $SourcePath -Exclude $excludeDirs | ForEach-Object {
        if ($_.PSIsContainer) {
            if ($_.Name -notin $excludeDirs) {
                Copy-Item -Path $_.FullName -Destination $InstallPath -Recurse -Force
            }
        } else {
            if ($_.Extension -notin @(".pyc", ".pyo") -and $_.Name -notin @(".env", "db.sqlite3")) {
                Copy-Item -Path $_.FullName -Destination $InstallPath -Force
            }
        }
    }

    Write-Success "Application files copied"
}

# Create Python virtual environment and install dependencies
function Install-PythonDependencies {
    param(
        [string]$InstallPath,
        [string]$PythonPath
    )

    Write-Step "Setting up Python virtual environment..."

    $pythonExe = Join-Path -Path $PythonPath -ChildPath "python.exe"
    $venvPath = Join-Path -Path $InstallPath -ChildPath "venv"
    $venvPython = Join-Path -Path $venvPath -ChildPath "Scripts\python.exe"
    $venvPip = Join-Path -Path $venvPath -ChildPath "Scripts\pip.exe"

    # Verify Python exists
    if (-not (Test-Path -Path $pythonExe)) {
        throw "Python not found at: $pythonExe"
    }

    # Create virtual environment
    if (-not (Test-Path -Path $venvPython)) {
        Write-Info "Creating virtual environment..."
        Write-Info "Python path: $pythonExe"
        Write-Info "Venv path: $venvPath"
        $result = & $pythonExe -m venv $venvPath 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host $result -ForegroundColor Red
            throw "Failed to create virtual environment"
        }
        Write-Success "Virtual environment created"
    } else {
        Write-Info "Virtual environment already exists"
    }

    # Verify venv Python exists
    if (-not (Test-Path -Path $venvPython)) {
        throw "Virtual environment Python not found at: $venvPython"
    }

    # Upgrade pip
    Write-Info "Upgrading pip..."
    & $venvPython -m pip install --upgrade pip 2>&1 | Out-Null

    # Install requirements (prefer production requirements if available)
    $requirementsProdPath = Join-Path -Path $InstallPath -ChildPath "requirements-production.txt"
    $requirementsPath = Join-Path -Path $InstallPath -ChildPath "requirements.txt"

    if (Test-Path -Path $requirementsProdPath) {
        Write-Info "Installing production Python dependencies..."
        & $venvPip install -r $requirementsProdPath
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install production dependencies"
        }
        Write-Success "Production Python dependencies installed"
    } elseif (Test-Path -Path $requirementsPath) {
        Write-Info "Installing Python dependencies..."
        & $venvPip install -r $requirementsPath
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install dependencies"
        }
        Write-Success "Python dependencies installed"

        # Install additional IIS-specific packages if not in requirements
        Write-Info "Installing IIS deployment packages..."
        & $venvPip install wfastcgi mssql-django pyodbc
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Some IIS packages may have failed to install"
        } else {
            Write-Success "IIS packages installed"
        }
    } else {
        Write-Warning "No requirements file found at $requirementsPath"
    }

    # Enable wfastcgi (ignore errors if already enabled)
    Write-Info "Enabling wfastcgi in IIS..."
    $wfastcgiScript = Join-Path -Path $venvPath -ChildPath "Scripts\wfastcgi-enable.exe"

    # Use Start-Process to capture output without throwing exceptions
    if (Test-Path -Path $wfastcgiScript) {
        $pinfo = New-Object System.Diagnostics.ProcessStartInfo
        $pinfo.FileName = $wfastcgiScript
        $pinfo.RedirectStandardError = $true
        $pinfo.RedirectStandardOutput = $true
        $pinfo.UseShellExecute = $false
        $pinfo.CreateNoWindow = $true

        $process = New-Object System.Diagnostics.Process
        $process.StartInfo = $pinfo
        $process.Start() | Out-Null
        $process.WaitForExit()

        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $wfastcgiOutput = "$stdout $stderr"

        # Check if it succeeded or was already enabled
        if ($process.ExitCode -eq 0) {
            Write-Success "wfastcgi enabled"
        } elseif ($wfastcgiOutput -match "already" -or $wfastcgiOutput -match "enabled" -or $wfastcgiOutput -match "exists") {
            Write-Success "wfastcgi already enabled"
        } else {
            Write-Warning "wfastcgi enable output: $wfastcgiOutput"
            Write-Info "Continuing anyway - wfastcgi may be configured manually"
        }
    } else {
        # Fallback: try running wfastcgi module directly (older versions)
        try {
            $wfastcgiOutput = & $venvPython -c "import wfastcgi; wfastcgi.enable()" 2>&1
            Write-Success "wfastcgi enabled"
        } catch {
            Write-Warning "wfastcgi enable warning: $($_.Exception.Message)"
            Write-Info "Continuing - wfastcgi may already be enabled"
        }
    }

    return $venvPath
}

# Build frontend
function Build-Frontend {
    param([string]$InstallPath)

    Write-Step "Building frontend..."

    $frontendPath = Join-Path $InstallPath "frontend"

    if (-not (Test-Path $frontendPath)) {
        Write-Warning "Frontend directory not found, skipping..."
        return
    }

    # Use temp file for capturing combined output
    $outputFile = Join-Path $env:TEMP "npm-output.txt"

    try {
        # Install dependencies using cmd /c to capture output properly
        Write-Info "Installing npm dependencies..."
        $installProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm install 2>&1" -WorkingDirectory $frontendPath -NoNewWindow -Wait -PassThru -RedirectStandardOutput $outputFile

        if ($installProcess.ExitCode -ne 0) {
            Write-Host "`nnpm install output:" -ForegroundColor Yellow
            if (Test-Path $outputFile) {
                Get-Content $outputFile | ForEach-Object { Write-Host $_ -ForegroundColor Red }
            }
            throw "npm install failed with exit code $($installProcess.ExitCode)"
        }
        Write-Success "npm dependencies installed"

        # Build using cmd /c to capture output properly
        Write-Info "Building production bundle..."
        $buildProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run build 2>&1" -WorkingDirectory $frontendPath -NoNewWindow -Wait -PassThru -RedirectStandardOutput $outputFile

        if ($buildProcess.ExitCode -ne 0) {
            Write-Host "`nnpm build output:" -ForegroundColor Yellow
            if (Test-Path $outputFile) {
                Get-Content $outputFile | ForEach-Object { Write-Host $_ -ForegroundColor Red }
            }
            throw "npm build failed with exit code $($buildProcess.ExitCode)"
        }

        Write-Success "Frontend built successfully"
    } finally {
        # Cleanup temp file
        Remove-Item $outputFile -Force -ErrorAction SilentlyContinue
    }
}

# Create environment file
function New-EnvironmentFile {
    param(
        [string]$InstallPath,
        [hashtable]$Config
    )

    Write-Step "Creating environment configuration..."

    $envPath = Join-Path $InstallPath ".env"

    $envContent = @"
# Data Nexus Bridge Service Configuration
# Generated by Install-IIS.ps1 on $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

# Django settings
DEBUG=$($Config.Debug.ToString().ToLower())
SECRET_KEY=$($Config.SecretKey)
ALLOWED_HOSTS=$($Config.AllowedHosts)

# Database settings (SQL Server)
DB_ENGINE=mssql
DB_HOST=$($Config.DbServer)
DB_NAME=$($Config.DbName)
DB_USER=$($Config.DbUser)
DB_PASSWORD=$($Config.DbPassword)

# Affinda API settings
AFFINDA_API_KEY=$($Config.AffindaApiKey)
AFFINDA_API_URL=$($Config.AffindaApiUrl)

# Static files
STATIC_ROOT=$InstallPath\staticfiles
MEDIA_ROOT=$InstallPath\media
"@

    Set-Content -Path $envPath -Value $envContent -Encoding UTF8
    Write-Success "Environment file created: $envPath"
}

# Configure IIS site
function Install-IISSite {
    param(
        [string]$InstallPath,
        [string]$VenvPath,
        [hashtable]$Config
    )

    Write-Step "Configuring IIS..."

    Import-Module WebAdministration

    $siteName = $Config.SiteName
    $appPoolName = $Config.AppPoolName
    $port = $Config.SitePort

    # Create Application Pool
    if (-not (Test-Path "IIS:\AppPools\$appPoolName")) {
        Write-Info "Creating application pool: $appPoolName"
        New-WebAppPool -Name $appPoolName
        Set-ItemProperty "IIS:\AppPools\$appPoolName" -Name processModel.identityType -Value "ApplicationPoolIdentity"
        Set-ItemProperty "IIS:\AppPools\$appPoolName" -Name managedRuntimeVersion -Value ""  # No managed code
        Write-Success "Application pool created"
    } else {
        Write-Info "Application pool already exists"
    }

    # Remove existing site if present
    if (Test-Path "IIS:\Sites\$siteName") {
        Write-Info "Removing existing site..."
        Remove-Website -Name $siteName
    }

    # Create website
    Write-Info "Creating website: $siteName"
    $bindingInfo = "*:$($port):"
    if ($Config.HostHeader) {
        $bindingInfo = "*:$($port):$($Config.HostHeader)"
    }

    New-Website -Name $siteName `
        -PhysicalPath $InstallPath `
        -ApplicationPool $appPoolName `
        -Force | Out-Null

    # Remove default binding and add HTTPS
    Remove-WebBinding -Name $siteName -BindingInformation "*:80:"

    if ($Config.CertThumbprint) {
        New-WebBinding -Name $siteName -Protocol "https" -Port $port -HostHeader $Config.HostHeader
        $binding = Get-WebBinding -Name $siteName -Protocol "https"
        $binding.AddSslCertificate($Config.CertThumbprint, "My")
        Write-Success "HTTPS binding configured with SSL certificate"
    } else {
        New-WebBinding -Name $siteName -Protocol "http" -Port 80 -HostHeader $Config.HostHeader
        Write-Warning "No SSL certificate configured - using HTTP only"
    }

    # Configure FastCGI handler for Django
    $pythonExe = Join-Path $VenvPath "Scripts\python.exe"
    $wfastcgiPath = Join-Path $VenvPath "Scripts\wfastcgi.exe"
    $wsgiPath = Join-Path $InstallPath "data_nexus_bridge\wsgi.py"

    # Create web.config
    $webConfigContent = @"
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <appSettings>
        <add key="PYTHONPATH" value="$InstallPath" />
        <add key="WSGI_HANDLER" value="data_nexus_bridge.wsgi.application" />
        <add key="DJANGO_SETTINGS_MODULE" value="data_nexus_bridge.settings" />
    </appSettings>
    <system.webServer>
        <handlers>
            <add name="Python FastCGI"
                 path="*"
                 verb="*"
                 modules="FastCgiModule"
                 scriptProcessor="$pythonExe|$wfastcgiPath"
                 resourceType="Unspecified"
                 requireAccess="Script" />
        </handlers>
        <rewrite>
            <rules>
                <!-- Serve static files directly -->
                <rule name="Static Files" stopProcessing="true">
                    <match url="^static/(.*)$" />
                    <action type="Rewrite" url="staticfiles/{R:1}" />
                </rule>
                <!-- Serve frontend (React) -->
                <rule name="Frontend" stopProcessing="true">
                    <match url="^(?!api|admin|static).*" />
                    <conditions>
                        <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
                        <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
                    </conditions>
                    <action type="Rewrite" url="frontend/dist/index.html" />
                </rule>
            </rules>
        </rewrite>
        <staticContent>
            <mimeMap fileExtension=".json" mimeType="application/json" />
            <mimeMap fileExtension=".woff" mimeType="font/woff" />
            <mimeMap fileExtension=".woff2" mimeType="font/woff2" />
        </staticContent>
    </system.webServer>
</configuration>
"@

    $webConfigPath = Join-Path $InstallPath "web.config"
    Set-Content -Path $webConfigPath -Value $webConfigContent -Encoding UTF8
    Write-Success "web.config created"

    # Register FastCGI application
    $fastCgiPath = "system.webServer/fastCgi"
    $existingApp = Get-WebConfiguration -Filter "$fastCgiPath/application[@fullPath='$pythonExe']" -PSPath "IIS:\"

    if (-not $existingApp) {
        Write-Info "Registering FastCGI application..."
        Add-WebConfiguration -Filter $fastCgiPath -PSPath "IIS:\" -Value @{
            fullPath = $pythonExe
            arguments = $wfastcgiPath
            maxInstances = 4
            idleTimeout = 300
            activityTimeout = 30
            requestTimeout = 90
            instanceMaxRequests = 10000
            protocol = "NamedPipe"
            flushNamedPipe = $false
        }
        Write-Success "FastCGI application registered"
    }

    # Set permissions
    Write-Info "Setting folder permissions..."
    $acl = Get-Acl $InstallPath
    $identity = "IIS AppPool\$appPoolName"
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        $identity,
        "ReadAndExecute,Write",
        "ContainerInherit,ObjectInherit",
        "None",
        "Allow"
    )
    $acl.AddAccessRule($rule)
    Set-Acl -Path $InstallPath -AclObject $acl
    Write-Success "Permissions configured"

    # Start the site
    Start-Website -Name $siteName
    Write-Success "Website started"
}

# Install scheduler as Windows Task
function Install-SchedulerTask {
    param(
        [string]$InstallPath,
        [string]$VenvPath,
        [string]$SiteName
    )

    Write-Step "Setting up scheduler task..."

    $pythonExe = Join-Path -Path $VenvPath -ChildPath "Scripts\python.exe"
    $managePy = Join-Path -Path $InstallPath -ChildPath "manage.py"
    $taskName = "DataNexusBridge-Scheduler"

    # Check if task already exists
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Write-Info "Removing existing scheduler task..."
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }

    # Create the action - run scheduler with --once flag (task scheduler will handle repetition)
    $action = New-ScheduledTaskAction `
        -Execute $pythonExe `
        -Argument "$managePy run_scheduler --once" `
        -WorkingDirectory $InstallPath

    # Trigger: run every minute
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 9999)

    # Settings
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
        -MultipleInstances IgnoreNew

    # Run as SYSTEM
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

    # Register the task
    Write-Info "Creating scheduler task: $taskName"
    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description "DataNexus Bridge Service - Sync Scheduler (runs every minute to check for due sync schedules)" | Out-Null

    # Start the task
    Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

    Write-Success "Scheduler task created and started"
    Write-Info "Task runs every minute to check for due sync schedules"
}

# Run Django migrations
function Invoke-DjangoMigrations {
    param(
        [string]$InstallPath,
        [string]$VenvPath
    )

    Write-Step "Running Django migrations..."

    $pythonExe = Join-Path $VenvPath "Scripts\python.exe"
    $managePy = Join-Path $InstallPath "manage.py"

    Push-Location $InstallPath
    try {
        # Collect static files
        Write-Info "Collecting static files..."
        & $pythonExe $managePy collectstatic --noinput 2>&1 | Out-Null
        Write-Success "Static files collected"

        # Run migrations
        Write-Info "Running database migrations..."
        & $pythonExe $managePy migrate --noinput
        Write-Success "Migrations completed"
    } finally {
        Pop-Location
    }
}

# Create Django superuser
function New-DjangoSuperuser {
    param(
        [string]$InstallPath,
        [string]$VenvPath,
        [hashtable]$Config
    )

    Write-Step "Creating admin superuser..."

    $pythonExe = Join-Path $VenvPath "Scripts\python.exe"
    $managePy = Join-Path $InstallPath "manage.py"

    $username = $Config.AdminUsername
    $email = $Config.AdminEmail
    $password = $Config.AdminPassword

    if ([string]::IsNullOrWhiteSpace($username) -or [string]::IsNullOrWhiteSpace($password)) {
        Write-Warning "Admin credentials not provided. Skipping superuser creation."
        Write-Info "You can create a superuser later with: python manage.py createsuperuser"
        return
    }

    # Create superuser using Django management command with environment variables
    Push-Location $InstallPath
    try {
        $env:DJANGO_SUPERUSER_PASSWORD = $password
        $env:DJANGO_SUPERUSER_USERNAME = $username
        $env:DJANGO_SUPERUSER_EMAIL = if ($email) { $email } else { "$username@localhost" }

        $result = & $pythonExe $managePy createsuperuser --noinput 2>&1

        # Clear sensitive env vars
        Remove-Item Env:DJANGO_SUPERUSER_PASSWORD -ErrorAction SilentlyContinue
        Remove-Item Env:DJANGO_SUPERUSER_USERNAME -ErrorAction SilentlyContinue
        Remove-Item Env:DJANGO_SUPERUSER_EMAIL -ErrorAction SilentlyContinue

        if ($LASTEXITCODE -eq 0) {
            Write-Success "Superuser '$username' created successfully"
        } else {
            # Check if user already exists
            if ($result -match "already exists" -or $result -match "duplicate") {
                Write-Warning "User '$username' already exists"
            } else {
                Write-Warning "Could not create superuser: $result"
                Write-Info "You can create a superuser later with: python manage.py createsuperuser"
            }
        }
    } finally {
        # Ensure env vars are cleared
        Remove-Item Env:DJANGO_SUPERUSER_PASSWORD -ErrorAction SilentlyContinue
        Remove-Item Env:DJANGO_SUPERUSER_USERNAME -ErrorAction SilentlyContinue
        Remove-Item Env:DJANGO_SUPERUSER_EMAIL -ErrorAction SilentlyContinue
        Pop-Location
    }
}

# Main installation function
function Install-DataNexusBridge {
    Show-Banner

    if (-not (Test-Administrator)) {
        Write-Error "This script must be run as Administrator!"
        exit 1
    }

    # Determine source path (where this script is running from or download from GitHub)
    $sourcePath = Get-SourcePath
    $downloadedRepo = $false

    # Get configuration first (we need InstallPath before downloading)
    if (-not [string]::IsNullOrWhiteSpace($ConfigFile) -and (Test-Path -Path $ConfigFile -ErrorAction SilentlyContinue)) {
        Write-Info "Loading configuration from: $ConfigFile"
        $config = Get-Content -Path $ConfigFile | ConvertFrom-Json -AsHashtable
    } else {
        $config = Get-InstallConfiguration
    }

    # If no local source, download from GitHub to a temp location
    if (-not $sourcePath) {
        $tempSourcePath = Join-Path $env:TEMP "datanexus-source"
        if (Test-Path $tempSourcePath) {
            Remove-Item $tempSourcePath -Recurse -Force
        }
        $sourcePath = Get-GitHubRepository -TargetPath $tempSourcePath
        $downloadedRepo = $true
    }

    Write-Info "Source directory: $sourcePath"

    try {
        # Install prerequisites
        Install-IISFeatures
        Install-Git
        Install-Python -PythonPath $config.PythonPath
        Install-NodeJS

        # Install application
        Install-Application -InstallPath $config.InstallPath -SourcePath $sourcePath
        $venvPath = Install-PythonDependencies -InstallPath $config.InstallPath -PythonPath $config.PythonPath

        # Configure
        New-EnvironmentFile -InstallPath $config.InstallPath -Config $config
        Build-Frontend -InstallPath $config.InstallPath

        # Setup IIS
        Install-IISSite -InstallPath $config.InstallPath -VenvPath $venvPath -Config $config

        # Run migrations
        Invoke-DjangoMigrations -InstallPath $config.InstallPath -VenvPath $venvPath

        # Setup scheduler task
        Install-SchedulerTask -InstallPath $config.InstallPath -VenvPath $venvPath -SiteName $config.SiteName

        # Create superuser
        New-DjangoSuperuser -InstallPath $config.InstallPath -VenvPath $venvPath -Config $config

        Write-Host "`n" -NoNewline
        Write-Host "============================================" -ForegroundColor Green
        Write-Host "  Installation completed successfully!" -ForegroundColor Green
        Write-Host "============================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Your application is available at:" -ForegroundColor White
        if ($config.CertThumbprint) {
            Write-Host "  https://$($config.HostHeader):$($config.SitePort)/" -ForegroundColor Cyan
        } else {
            Write-Host "  http://$($config.HostHeader):80/" -ForegroundColor Cyan
        }
        Write-Host ""
        Write-Host "Scheduler:" -ForegroundColor Yellow
        Write-Host "  A Windows Task 'DataNexusBridge-Scheduler' has been created to run sync schedules."
        Write-Host "  View/manage it in Task Scheduler or run: Get-ScheduledTask -TaskName 'DataNexusBridge-Scheduler'"
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Yellow
        Write-Host "  1. Configure your Affinda API key in the .env file if not set"
        Write-Host "  2. Access the admin panel at /admin/"
        Write-Host ""

        # Cleanup downloaded repo if we downloaded it
        if ($downloadedRepo -and (Test-Path $sourcePath)) {
            Write-Info "Cleaning up temporary source files..."
            Remove-Item $sourcePath -Recurse -Force -ErrorAction SilentlyContinue
        }

    } catch {
        Write-Host "`n" -NoNewline
        Write-Error "Installation failed: $($_.Exception.Message)"
        Write-Host ""
        Write-Host "Error details:" -ForegroundColor Red
        Write-Host $_.Exception.ToString() -ForegroundColor Red
        Write-Host ""
        Write-Host "Stack trace:" -ForegroundColor Red
        Write-Host $_.ScriptStackTrace -ForegroundColor Red

        # Cleanup on failure too
        if ($downloadedRepo -and (Test-Path $sourcePath)) {
            Remove-Item $sourcePath -Recurse -Force -ErrorAction SilentlyContinue
        }

        Write-Host ""
        Write-Host "Press any key to exit..." -ForegroundColor Yellow
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        exit 1
    }
}

# Run installation
Install-DataNexusBridge
