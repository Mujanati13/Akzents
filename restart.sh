#!/bin/bash

# ============================================
# Restart Script - Restart all services
# ============================================

echo "Restarting all Akzente Project services..."

pm2 restart all

echo "All services restarted."
pm2 status
