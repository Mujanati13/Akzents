#!/bin/bash

# ============================================
# Akzente Project - VPS Deployment Script
# ============================================
# Ports:
#   - Backend:      4010
#   - HeadOffice:   3010
#   - Client:       3011
#   - Merchandiser: 3012
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODE_DIR="$PROJECT_ROOT/Code"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   Akzente Project - VPS Deployment${NC}"
echo -e "${BLUE}============================================${NC}"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

if ! command_exists node; then
    echo -e "${RED}Node.js is not installed. Please install Node.js 18+ first.${NC}"
    exit 1
fi

if ! command_exists npm; then
    echo -e "${RED}npm is not installed. Please install npm first.${NC}"
    exit 1
fi

if ! command_exists pm2; then
    echo -e "${YELLOW}PM2 is not installed. Installing globally...${NC}"
    sudo npm install -g pm2
fi

if ! command_exists http-server; then
    echo -e "${YELLOW}http-server is not installed. Installing globally...${NC}"
    sudo npm install -g http-server
fi

echo -e "${GREEN}All prerequisites met!${NC}"

# ============================================
# Build Backend
# ============================================
echo -e "\n${BLUE}[1/4] Building Backend...${NC}"
cd "$CODE_DIR/Backend"

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing backend dependencies...${NC}"
    npm install --legacy-peer-deps
fi

echo -e "${YELLOW}Building backend...${NC}"
npm run build

echo -e "${GREEN}Backend build complete!${NC}"

# ============================================
# Build HeadOffice
# ============================================
echo -e "\n${BLUE}[2/4] Building HeadOffice...${NC}"
cd "$CODE_DIR/HeadOffice"

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing HeadOffice dependencies...${NC}"
    npm install --legacy-peer-deps
fi

echo -e "${YELLOW}Building HeadOffice...${NC}"
npm run build

echo -e "${GREEN}HeadOffice build complete!${NC}"

# ============================================
# Build Client
# ============================================
echo -e "\n${BLUE}[3/4] Building Client...${NC}"
cd "$CODE_DIR/Client"

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing Client dependencies...${NC}"
    npm install --legacy-peer-deps
fi

echo -e "${YELLOW}Building Client...${NC}"
npm run build

echo -e "${GREEN}Client build complete!${NC}"

# ============================================
# Build Merchandiser
# ============================================
echo -e "\n${BLUE}[4/4] Building Merchandiser...${NC}"
cd "$CODE_DIR/Merchandiser"

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing Merchandiser dependencies...${NC}"
    npm install --legacy-peer-deps
fi

echo -e "${YELLOW}Building Merchandiser...${NC}"
npm run build

echo -e "${GREEN}Merchandiser build complete!${NC}"

# ============================================
# Start PM2 Processes
# ============================================
echo -e "\n${BLUE}Starting PM2 processes...${NC}"

cd "$PROJECT_ROOT"

# Stop existing processes if running
pm2 delete ecosystem.config.js 2>/dev/null || true

# Start all processes
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

echo -e "\n${GREEN}============================================${NC}"
echo -e "${GREEN}   Deployment Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo -e "\n${YELLOW}Services running:${NC}"
echo -e "  Backend:      ${GREEN}http://localhost:4010${NC}"
echo -e "  HeadOffice:   ${GREEN}http://localhost:3010${NC}"
echo -e "  Client:       ${GREEN}http://localhost:3011${NC}"
echo -e "  Merchandiser: ${GREEN}http://localhost:3012${NC}"
echo -e "\n${YELLOW}PM2 Commands:${NC}"
echo -e "  pm2 status        - View all processes"
echo -e "  pm2 logs          - View all logs"
echo -e "  pm2 logs backend  - View backend logs"
echo -e "  pm2 restart all   - Restart all processes"
echo -e "  pm2 stop all      - Stop all processes"
echo -e "\n"
