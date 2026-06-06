// PM2 Ecosystem Configuration
// Used to manage the backend Node.js process
module.exports = {
  apps: [
    {
      name: 'forgedas-backend',
      script: 'src/index.js',
      cwd: '/var/www/forgedas/backend',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/www/forgedas/logs/backend-error.log',
      out_file: '/var/www/forgedas/logs/backend-out.log',
      merge_logs: true,
      // Restart policy
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
