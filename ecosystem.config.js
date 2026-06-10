'use strict';

module.exports = {
  apps: [{
    name:             'adum',
    script:           'server.js',
    cwd:              '/opt/adum',
    instances:        1,
    exec_mode:        'fork',
    user:             'adum',
    env_production: {
      NODE_ENV: 'production',
    },
    // Logi seadistus
    out_file:         '/var/log/adum/out.log',
    error_file:       '/var/log/adum/error.log',
    log_date_format:  'YYYY-MM-DD HH:mm:ss',
    merge_logs:       true,
    max_size:         '50M',
    retain:           7,
    // Taaskäivitus kraaši korral
    autorestart:      true,
    max_restarts:     10,
    min_uptime:       '10s',
    restart_delay:    5000,
    // Mälu limiit — taaskäivita kui ületab 512 MB
    max_memory_restart: '512M',
    // Graceful shutdown
    kill_timeout:     5000,
    listen_timeout:   10000,
  }],
};
