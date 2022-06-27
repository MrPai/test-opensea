module.exports = {
  apps: [
    {
      name: 'stake-client-claim',
      script: './node_modules/.bin/ts-node',
      args: 'src/main.ts claim',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'stake-client-sync',
      script: './node_modules/.bin/ts-node',
      args: 'src/main.ts sync',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
}
