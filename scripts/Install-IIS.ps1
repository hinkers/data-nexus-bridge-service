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

.PARAMETER ConfigFile
    Optional path to a JSON configuration file for unattended installs.

.EXAMPLE
    .\Install-IIS.ps1

.EXAMPLE
    .\Install-IIS.ps1 -ConfigFile .\install-config.json

.NOTES
    Author: Data Nexus Bridge
    Version: 1.0.0
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$ConfigFile
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Script constants
$SCRIPT_VERSION = "1.0.0"
$PYTHON_VERSION = "3.11.9"
$PYTHON_DOWNLOAD_URL = "https://www.python.org/ftp/python/$PYTHON_VERSION/python-$PYTHON_VERSION-amd64.exe"
$NODE_VERSION = "20.11.0"
$NODE_DOWNLOAD_URL = "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-x64.msi"

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
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

    Write-Success "Node.js installed successfully"

    # Clean up
    Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
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

    $pythonExe = Join-Path $PythonPath "python.exe"
    $venvPath = Join-Path $InstallPath "venv"
    $venvPython = Join-Path $venvPath "Scripts\python.exe"
    $venvPip = Join-Path $venvPath "Scripts\pip.exe"

    # Create virtual environment
    if (-not (Test-Path $venvPython)) {
        Write-Info "Creating virtual environment..."
        & $pythonExe -m venv $venvPath
        Write-Success "Virtual environment created"
    } else {
        Write-Info "Virtual environment already exists"
    }

    # Upgrade pip
    Write-Info "Upgrading pip..."
    & $venvPython -m pip install --upgrade pip | Out-Null

    # Install requirements (prefer production requirements if available)
    $requirementsProdPath = Join-Path $InstallPath "requirements-production.txt"
    $requirementsPath = Join-Path $InstallPath "requirements.txt"

    if (Test-Path $requirementsProdPath) {
        Write-Info "Installing production Python dependencies..."
        & $venvPip install -r $requirementsProdPath
        Write-Success "Production Python dependencies installed"
    } elseif (Test-Path $requirementsPath) {
        Write-Info "Installing Python dependencies..."
        & $venvPip install -r $requirementsPath
        Write-Success "Python dependencies installed"

        # Install additional IIS-specific packages if not in requirements
        Write-Info "Installing IIS deployment packages..."
        & $venvPip install wfastcgi mssql-django pyodbc
        Write-Success "IIS packages installed"
    }

    # Enable wfastcgi
    Write-Info "Enabling wfastcgi in IIS..."
    $wfastcgiPath = Join-Path $venvPath "Scripts\wfastcgi.exe"
    & $venvPython -m wfastcgi-enable 2>&1 | Out-Null

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

    Push-Location $frontendPath
    try {
        # Install dependencies
        Write-Info "Installing npm dependencies..."
        & npm install --silent 2>&1 | Out-Null

        # Build
        Write-Info "Building production bundle..."
        & npm run build 2>&1 | Out-Null

        Write-Success "Frontend built successfully"
    } finally {
        Pop-Location
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

# Main installation function
function Install-DataNexusBridge {
    Show-Banner

    if (-not (Test-Administrator)) {
        Write-Error "This script must be run as Administrator!"
        exit 1
    }

    # Determine source path (where this script is running from)
    $sourcePath = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    if (-not $sourcePath) {
        $sourcePath = Get-Location
    }

    Write-Info "Source directory: $sourcePath"

    # Get configuration
    if ($ConfigFile -and (Test-Path $ConfigFile)) {
        Write-Info "Loading configuration from: $ConfigFile"
        $config = Get-Content $ConfigFile | ConvertFrom-Json -AsHashtable
    } else {
        $config = Get-InstallConfiguration
    }

    try {
        # Install prerequisites
        Install-IISFeatures
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
        Write-Host "Next steps:" -ForegroundColor Yellow
        Write-Host "  1. Create a superuser: cd $($config.InstallPath) && venv\Scripts\python manage.py createsuperuser"
        Write-Host "  2. Configure your Affinda API key in the .env file if not set"
        Write-Host "  3. Access the admin panel at /admin/"
        Write-Host ""

    } catch {
        Write-Host "`n" -NoNewline
        Write-Error "Installation failed: $($_.Exception.Message)"
        Write-Host $_.ScriptStackTrace -ForegroundColor Red
        exit 1
    }
}

# Run installation
Install-DataNexusBridge
