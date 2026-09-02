#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
#  Bootstrap de Ligero para desarrollo LOCAL (fuera de Docker).
#
#  Ligero aún no está en Maven Central: hay que compilarlo desde
#  su repo y publicarlo a tu Maven local (~/.m2). Los builds de
#  Docker ya hacen esto solos (ver apps/*/backend/Dockerfile); este
#  script es solo para compilar el backend en tu máquina sin Docker.
#
#  Uso:  ./scripts/install-ligero.sh [ref]
# ══════════════════════════════════════════════════════════════
set -euo pipefail

LIGERO_REPO="${LIGERO_REPO:-https://github.com/ligero-framework/ligero}"
LIGERO_REF="${1:-${LIGERO_REF:-main}}"
WORK="$(mktemp -d)"

echo "▸ Clonando Ligero ($LIGERO_REF) …"
git clone --depth 1 --branch "$LIGERO_REF" "$LIGERO_REPO" "$WORK/ligero"

echo "▸ Publicando a Maven local (~/.m2) …"
cd "$WORK/ligero"
if [ -x ./gradlew ]; then
  ./gradlew publishToMavenLocal --no-daemon
else
  gradle publishToMavenLocal --no-daemon
fi

echo "✓ Ligero publicado en tu Maven local. Ya puedes compilar los backends."
