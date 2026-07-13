// Configuración de PM2 para producción (VPS Namecheap).
// Uso: pm2 start ecosystem.config.js --env production
module.exports = {
  apps: [
    {
      name: 'quicktap-api',
      script: 'dist/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '400M',
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      time: true,
    },
  ],
};
