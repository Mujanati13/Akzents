#!/bin/bash

# ============================================
# Quick Start Script - Start all services
# ============================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting Akzente Project with PM2..."

cd "$PROJECT_ROOT"

# Delete existing processes
pm2 delete ecosystem.config.js 2>/dev/null || true

# Start all
pm2 start ecosystem.config.js

# Show status
pm2 status

echo ""
echo "Services running:"
echo "  Backend:      http://localhost:4010"
echo "  HeadOffice:   http://localhost:3010"
echo "  Client:       http://localhost:3011"
echo "  Merchandiser: http://localhost:3012"
echo ""
