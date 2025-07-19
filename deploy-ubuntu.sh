#!/bin/bash

# 企业级客服系统 - Ubuntu 一键部署脚本
# 支持 Ubuntu 20.04 LTS 及以上版本

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 默认配置
ENVIRONMENT="production"
SKIP_DEPENDENCIES=false
SKIP_BUILD=false
AUTO_START=false
INSTALL_PATH="/opt/customer-service-app"
NODE_VERSION="18"
PM2_USER="www-data"

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --skip-deps)
            SKIP_DEPENDENCIES=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --auto-start)
            AUTO_START=true
            shift
            ;;
        --help)
            echo "用法: $0 [选项]"
            echo "选项:"
            echo "  --env <环境>      设置环境 (development/production) 默认: production"
            echo "  --skip-deps       跳过依赖安装"
            echo "  --skip-build      跳过构建步骤"
            echo "  --auto-start      自动启动应用"
            echo "  --help           显示帮助信息"
            exit 0
            ;;
        *)
            echo -e "${RED}未知选项: $1${NC}"
            exit 1
            ;;
    esac
done

# 显示横幅
echo -e "${CYAN}===================================="
echo -e " 企业级客服系统"
echo -e " Ubuntu 部署脚本"
echo -e "====================================${NC}"
echo ""

# 检查是否为 root 用户
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}❌ 此脚本必须以 root 权限运行${NC}"
   echo -e "${YELLOW}请使用: sudo $0${NC}"
   exit 1
fi

# 检查系统版本
echo -e "${GREEN}🔍 检查系统要求...${NC}"
if ! command -v lsb_release &> /dev/null; then
    echo -e "${RED}❌ 无法检测系统版本${NC}"
    exit 1
fi

DISTRO=$(lsb_release -i | cut -f2)
VERSION=$(lsb_release -r | cut -f2)

if [[ "$DISTRO" != "Ubuntu" ]]; then
    echo -e "${RED}❌ 此脚本仅支持 Ubuntu${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 系统版本: $DISTRO $VERSION${NC}"

# 更新系统
echo ""
echo -e "${GREEN}📦 更新系统包...${NC}"
apt-get update -qq
apt-get upgrade -y -qq

# 安装基础依赖
if [ "$SKIP_DEPENDENCIES" = false ]; then
    echo ""
    echo -e "${GREEN}📦 安装系统依赖...${NC}"
    
    # 安装必要的包
    apt-get install -y -qq \
        curl \
        wget \
        git \
        build-essential \
        software-properties-common \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release \
        nginx \
        certbot \
        python3-certbot-nginx \
        ufw
    
    # 安装 Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${YELLOW}安装 Node.js $NODE_VERSION...${NC}"
        curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
        apt-get install -y nodejs
    else
        NODE_CURRENT=$(node --version)
        echo -e "${GREEN}✅ Node.js 已安装: $NODE_CURRENT${NC}"
    fi
    
    # 安装 PM2
    if ! command -v pm2 &> /dev/null; then
        echo -e "${YELLOW}安装 PM2 进程管理器...${NC}"
        npm install -g pm2
        pm2 startup systemd -u $PM2_USER --hp /home/$PM2_USER
    else
        echo -e "${GREEN}✅ PM2 已安装${NC}"
    fi
    
    # 安装 serve（用于静态文件服务）
    npm install -g serve
fi