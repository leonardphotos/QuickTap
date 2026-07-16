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
        // Asegura que el reinicio nocturno (cron_restart) sea 3am hora Venezuela sin importar la del servidor.
        TZ: 'America/Caracas',
      },
      max_memory_restart: '400M',
      // Reinicio nocturno para liberar memoria acumulada y mantener la web rápida.
      cron_restart: '0 3 * * *',
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      time: true,
    },
  ],
};
