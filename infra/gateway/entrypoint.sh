#!/bin/sh
# Sustituye los tokens __…__ del nginx.conf con las variables de entorno
# (upstreams como URL completa, y puerto) y arranca nginx. Local usa los
# valores por defecto; Render los sobrescribe con las URLs públicas.
set -e

: "${PORT:=80}"
: "${ADMIN_FRONTEND:=http://admin-frontend:80}"
: "${ADMIN_BACKEND:=http://admin-backend:8080}"

CONF=/etc/nginx/nginx.conf
# '|' como separador de sed porque las URLs llevan '/'.
sed -i \
  -e "s|__PORT__|${PORT}|g" \
  -e "s|__ADMIN_FRONTEND__|${ADMIN_FRONTEND}|g" \
  -e "s|__ADMIN_BACKEND__|${ADMIN_BACKEND}|g" \
  "$CONF"

exec nginx -g 'daemon off;'
