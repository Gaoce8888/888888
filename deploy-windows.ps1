# 企业级客服系统 - Windows 11 一键部署脚本
# 需要以管理员权限运行 PowerShell

param(
    [string]$Environment = "production",
    [switch]$SkipDependencies = $false,
    [switch]$SkipBuild = $false,
    [switch]$AutoStart = $false
)

$ErrorActionPreference = "Stop"
$projectName = "Enterprise Customer Service System"
$nodeVersion = "18.0.0"

Write-Host "====================================" -ForegroundColor Cyan
Write-Host " $projectName " -ForegroundColor Yellow
Write-Host " Windows 11 部署脚本 " -ForegroundColor Yellow
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否以管理员权限运行
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
    Write-Host "❌ 请以管理员权限运行此脚本！" -ForegroundColor Red
    Write-Host "右键点击 PowerShell，选择'以管理员身份运行'" -ForegroundColor Yellow
    exit 1
}

# 检查系统要求
Write-Host "🔍 检查系统要求..." -ForegroundColor Green

# 检查 Windows 版本
$os = Get-CimInstance Win32_OperatingSystem
if ($os.Version -lt "10.0.22000") {
    Write-Host "❌ 需要 Windows 11 或更高版本" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Windows 版本: $($os.Caption)" -ForegroundColor Green

# 安装 Chocolatey（如果未安装）
if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "📦 安装 Chocolatey 包管理器..." -ForegroundColor Yellow
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
}

if (-not $SkipDependencies) {
    Write-Host ""
    Write-Host "📦 安装依赖..." -ForegroundColor Green
    
    # 安装 Node.js
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "安装 Node.js $nodeVersion..." -ForegroundColor Yellow
        choco install nodejs --version=$nodeVersion -y
    } else {
        $currentNodeVersion = node --version
        Write-Host "✅ Node.js 已安装: $currentNodeVersion" -ForegroundColor Green
    }
    
    # 安装 Git
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Host "安装 Git..." -ForegroundColor Yellow
        choco install git -y
    } else {
        Write-Host "✅ Git 已安装" -ForegroundColor Green
    }
    
    # 安装 PM2
    if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
        Write-Host "安装 PM2 进程管理器..." -ForegroundColor Yellow
        npm install -g pm2
        npm install -g pm2-windows-startup
        pm2-startup install
    } else {
        Write-Host "✅ PM2 已安装" -ForegroundColor Green
    }
    
    # 刷新环境变量
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# 创建项目目录
$installPath = "C:\CustomerServiceApp"
if (-not (Test-Path $installPath)) {
    Write-Host ""
    Write-Host "📁 创建项目目录..." -ForegroundColor Green
    New-Item -ItemType Directory -Path $installPath -Force | Out-Null
}
Set-Location $installPath

# 复制项目文件
Write-Host ""
Write-Host "📋 复制项目文件..." -ForegroundColor Green
$sourcePath = $PSScriptRoot
if ($sourcePath -ne $installPath) {
    Copy-Item -Path "$sourcePath\*" -Destination $installPath -Recurse -Force -Exclude @("node_modules", "build", ".git")
}

# 安装项目依赖
Write-Host ""
Write-Host "📦 安装项目依赖..." -ForegroundColor Green
if (Test-Path "customer-service-app") {
    Set-Location "customer-service-app"
}

# 清理旧的依赖
if (Test-Path "node_modules") {
    Write-Host "清理旧的依赖..." -ForegroundColor Yellow
    Remove-Item -Path "node_modules" -Recurse -Force
}

# 安装依赖
npm cache clean --force
npm install

# 配置环境变量
Write-Host ""
Write-Host "⚙️ 配置环境变量..." -ForegroundColor Green

# 根据环境复制相应的配置文件
if ($Environment -eq "production") {
    if (Test-Path ".env.production") {
        Copy-Item ".env.production" ".env" -Force
        Write-Host "✅ 使用生产环境配置" -ForegroundColor Green
    }
} else {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env" -Force
        Write-Host "✅ 使用开发环境配置" -ForegroundColor Green
    }
}

# 构建项目
if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "🔨 构建项目..." -ForegroundColor Green
    npm run build
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 构建失败！" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ 构建成功！" -ForegroundColor Green
}

# 配置 Windows 防火墙
Write-Host ""
Write-Host "🔥 配置防火墙规则..." -ForegroundColor Green
$ruleName = "CustomerServiceApp"
$ports = @(3000, 6006)

foreach ($port in $ports) {
    $existingRule = Get-NetFirewallRule -DisplayName "$ruleName-$port" -ErrorAction SilentlyContinue
    if (-not $existingRule) {
        New-NetFirewallRule -DisplayName "$ruleName-$port" `
            -Direction Inbound `
            -Protocol TCP `
            -LocalPort $port `
            -Action Allow `
            -Profile Domain,Private,Public | Out-Null
        Write-Host "✅ 开放端口: $port" -ForegroundColor Green
    }
}

# 创建 PM2 配置文件
Write-Host ""
Write-Host "📝 创建 PM2 配置..." -ForegroundColor Green
@"
module.exports = {
  apps: [{
    name: 'customer-service-app',
    script: 'serve',
    env: {
      PM2_SERVE_PATH: './build',
      PM2_SERVE_PORT: 3000,
      PM2_SERVE_SPA: 'true',
      PM2_SERVE_HOMEPAGE: '/index.html'
    },
    instances: 'max',
    exec_mode: 'cluster',
    max_memory_restart: '500M',
    error_file: './logs/error.log',
    out_file: './logs/output.log',
    log_file: './logs/combined.log',
    time: true
  }]
}
"@ | Out-File -FilePath "ecosystem.config.js" -Encoding UTF8

# 创建日志目录
if (-not (Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs" -Force | Out-Null
}

# 创建 Windows 服务（可选）
Write-Host ""
Write-Host "🔧 配置自动启动..." -ForegroundColor Green

# 使用 PM2 启动应用
if ($AutoStart) {
    Write-Host "启动应用..." -ForegroundColor Yellow
    pm2 delete customer-service-app 2>$null
    pm2 start ecosystem.config.js
    pm2 save
    Write-Host "✅ 应用已启动" -ForegroundColor Green
}

# 创建快捷方式
Write-Host ""
Write-Host "🔗 创建快捷方式..." -ForegroundColor Green
$WScriptShell = New-Object -ComObject WScript.Shell
$Shortcut = $WScriptShell.CreateShortcut("$env:USERPROFILE\Desktop\客服系统.lnk")
$Shortcut.TargetPath = "http://localhost:3000"
$Shortcut.IconLocation = "C:\Windows\System32\SHELL32.dll,13"
$Shortcut.Save()

# 显示部署信息
Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host " ✅ 部署完成！" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📁 安装路径: $installPath" -ForegroundColor Yellow
Write-Host "🌐 访问地址: http://localhost:3000" -ForegroundColor Yellow
Write-Host ""
Write-Host "常用命令:" -ForegroundColor Cyan
Write-Host "  启动应用: pm2 start ecosystem.config.js" -ForegroundColor White
Write-Host "  停止应用: pm2 stop customer-service-app" -ForegroundColor White
Write-Host "  查看状态: pm2 status" -ForegroundColor White
Write-Host "  查看日志: pm2 logs" -ForegroundColor White
Write-Host ""

# 询问是否立即打开
$response = Read-Host "是否立即打开应用？(Y/N)"
if ($response -eq 'Y' -or $response -eq 'y') {
    Start-Process "http://localhost:3000"
}