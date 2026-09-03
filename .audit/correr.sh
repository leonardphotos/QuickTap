#!/bin/bash
# Corrida limpia: la API guarda el limitador de peticiones en memoria, así que reiniciarla
# lo vacía y el simulador puede volver a usar los endpoints públicos.
cd /Users/leonardoperez/Documents/QuickTap
pkill -f "ts-node-dev" 2>/dev/null
sleep 3
npm run dev > /tmp/api_audit.log 2>&1 &
for i in $(seq 1 20); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api/v1/ping)" = "200" ] && break
  sleep 3
done
node .audit/setup.js > /dev/null 2>&1
node .audit/sim.js 2>/dev/null
