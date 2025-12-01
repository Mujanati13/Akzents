/**
 * PM2 Ecosystem Configuration
 * Akzente Project
 * 
 * Ports:
 *   - Backend:      4010
 *   - HeadOffice:   3010
 *   - Client:       3011
 *   - Merchandiser: 3012
 */

module.exports = {
  apps: [
    // ============================================
    // Backend - NestJS API
    // ============================================
    {
      name: 'backend',
      cwd: './Code/Backend',
      script: 'dist/src/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        APP_PORT: 4010,
      },
      env_production: {
        NODE_ENV: 'production',
        APP_PORT: 4010,
      },
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      merge_logs: true,
      // Restart policy
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      autorestart: true,
      // Watch (disable in production)
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'uploads'],
      // Memory management
      max_memory_restart: '1G',
    },

    // ============================================
    // HeadOffice - Angular (Admin Portal)
    // ============================================
    {
      name: 'headoffice',
      cwd: './Code/HeadOffice',
      script: 'npx',
      args: 'http-server dist/angular-boilerplate/browser -p 3010 -c-1 --cors -g',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/headoffice-error.log',
      out_file: './logs/headoffice-out.log',
      merge_logs: true,
      // Restart policy
      max_restarts: 10,
      min_uptime: '5s',
      restart_delay: 2000,
      autorestart: true,
      watch: false,
    },

    // ============================================
    // Client - Angular (Client Portal)
    // ============================================
    {
      name: 'client',
      cwd: './Code/Client',
      script: 'npx',
      args: 'http-server dist/angular-boilerplate/browser -p 3011 -c-1 --cors -g',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/client-error.log',
      out_file: './logs/client-out.log',
      merge_logs: true,
      // Restart policy
      max_restarts: 10,
      min_uptime: '5s',
      restart_delay: 2000,
      autorestart: true,
      watch: false,
    },

    // ============================================
    // Merchandiser - Angular (Mobile App)
    // ============================================
    {
      name: 'merchandiser',
      cwd: './Code/Merchandiser',
      script: 'npx',
      args: 'http-server dist/angular-boilerplate/browser -p 3012 -c-1 --cors -g',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/merchandiser-error.log',
      out_file: './logs/merchandiser-out.log',
      merge_logs: true,
      // Restart policy
      max_restarts: 10,
      min_uptime: '5s',
      restart_delay: 2000,
      autorestart: true,
      watch: false,
    },
  ],
};
