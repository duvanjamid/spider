#!/bin/sh
# Sustituye los tokens __…__ del nginx.conf con las variables de entorno
# (upstreams como URL completa, y puerto) y arranca nginx. Local usa los
# valores por defecto; Render los sobrescribe con las URLs públicas.
set -e

: "${PORT:=80}"
: "${ADMIN_FRONTEND:=http://admin-frontend:80}"
: "${ADMIN_BACKEND:=http://admin-backend:8080}"
: "${GASTOS_FRONTEND:=http://gastos-frontend:80}"
: "${GASTOS_BACKEND:=http://gastos-backend:8080}"
: "${ELECTROLINERAS_FRONTEND:=http://electrolineras-frontend:80}"
: "${ELECTROLINERAS_BACKEND:=http://electrolineras-backend:8080}"
: "${ALERTAS_FRONTEND:=http://alertas-frontend:80}"
: "${ALERTAS_BACKEND:=http://alertas-backend:8080}"

CONF=/etc/nginx/nginx.conf
# '|' como separador de sed porque las URLs llevan '/'.
sed -i \
  -e "s|__PORT__|${PORT}|g" \
  -e "s|__ADMIN_FRONTEND__|${ADMIN_FRONTEND}|g" \
  -e "s|__ADMIN_BACKEND__|${ADMIN_BACKEND}|g" \
  -e "s|__GASTOS_FRONTEND__|${GASTOS_FRONTEND}|g" \
  -e "s|__GASTOS_BACKEND__|${GASTOS_BACKEND}|g" \
  -e "s|__ELECTROLINERAS_FRONTEND__|${ELECTROLINERAS_FRONTEND}|g" \
  -e "s|__ELECTROLINERAS_BACKEND__|${ELECTROLINERAS_BACKEND}|g" \
  -e "s|__ALERTAS_FRONTEND__|${ALERTAS_FRONTEND}|g" \
  -e "s|__ALERTAS_BACKEND__|${ALERTAS_BACKEND}|g" \
  "$CONF"

exec nginx -g 'daemon off;'
