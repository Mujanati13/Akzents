#!/bin/bash

# ============================================
# Stop Script - Stop all services
# ============================================

echo "Stopping all Akzente Project services..."

pm2 stop all

echo "All services stopped."
pm2 status
