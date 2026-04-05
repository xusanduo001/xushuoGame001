module.exports = {
  apps: [
    {
      name: 'xushuoGame001',
      script: 'npx',
      args: 'tsx server.ts',
      cwd: '/var/www/xushuoGame001',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
