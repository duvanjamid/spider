#!/usr/bin/env bash
#
# provision.sh — Crea una VM Always Free en Oracle Cloud (OCI) con el MAXIMO
# de recursos gratuitos (ARM Ampere A1: 4 OCPU + 24 GB RAM) e instala Coolify.
#
# Requisitos:
#   - OCI CLI instalado y configurado  ->  `oci setup config`  (crea ~/.oci/config)
#   - Que tu tenancy tenga cuota Always Free disponible
#
# Uso basico (usa el compartment raiz y crea toda la red automaticamente):
#   ./provision.sh
#
# El script es idempotente: si la red o las llaves ya existen, las reutiliza.
# Ver README.md para todas las variables configurables.
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuracion (todo se puede sobreescribir con variables de entorno)
# ---------------------------------------------------------------------------
DISPLAY_NAME="${DISPLAY_NAME:-coolify}"          # Nombre de la instancia
OCPUS="${OCPUS:-4}"                              # Max Always Free ARM: 4 OCPU
MEMORY_GB="${MEMORY_GB:-24}"                     # Max Always Free ARM: 24 GB
BOOT_VOL_GB="${BOOT_VOL_GB:-50}"                 # Disco (Always Free: hasta 200 GB total)
SHAPE="${SHAPE:-VM.Standard.A1.Flex}"            # Shape ARM Always Free
OS_NAME="${OS_NAME:-Canonical Ubuntu}"
OS_VERSION="${OS_VERSION:-22.04}"

VCN_CIDR="${VCN_CIDR:-10.0.0.0/16}"
SUBNET_CIDR="${SUBNET_CIDR:-10.0.1.0/24}"

SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/oci_coolify}"   # Sin extension; genera .pub
CLOUD_INIT_FILE="${CLOUD_INIT_FILE:-$(dirname "$0")/cloud-init.yaml}"

# Reintentos ante "Out of host capacity" (muy comun con ARM Always Free).
CAPACITY_RETRIES="${CAPACITY_RETRIES:-0}"        # 0 = no reintentar; N = intentos por AD
RETRY_WAIT="${RETRY_WAIT:-60}"                   # Segundos entre reintentos

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

command -v oci >/dev/null || die "OCI CLI no encontrado. Instala y ejecuta: oci setup config"
command -v jq  >/dev/null || die "jq no encontrado. Instalalo (brew install jq / apt install jq)."
[ -f "$CLOUD_INIT_FILE" ] || die "No encuentro cloud-init: $CLOUD_INIT_FILE"

# ---------------------------------------------------------------------------
# 1. Identidad: tenancy / compartment
# ---------------------------------------------------------------------------
TENANCY_OCID="$(oci iam compartment list --query 'data[0]."compartment-id"' --raw-output 2>/dev/null || true)"
[ -n "${TENANCY_OCID:-}" ] || TENANCY_OCID="$(grep -E '^tenancy=' ~/.oci/config | head -1 | cut -d= -f2)"
COMPARTMENT_ID="${OCI_COMPARTMENT_ID:-$TENANCY_OCID}"
[ -n "$COMPARTMENT_ID" ] || die "No pude determinar el compartment. Exporta OCI_COMPARTMENT_ID."
log "Compartment: $COMPARTMENT_ID"

# ---------------------------------------------------------------------------
# 2. Llave SSH
# ---------------------------------------------------------------------------
if [ ! -f "${SSH_KEY_PATH}.pub" ]; then
  log "Generando par de llaves SSH en ${SSH_KEY_PATH}"
  mkdir -p "$(dirname "$SSH_KEY_PATH")"
  ssh-keygen -t ed25519 -N "" -f "$SSH_KEY_PATH" -C "coolify@oci"
else
  log "Reutilizando llave SSH ${SSH_KEY_PATH}.pub"
fi
SSH_PUB_KEY="$(cat "${SSH_KEY_PATH}.pub")"

# ---------------------------------------------------------------------------
# 3. Imagen Ubuntu ARM (aarch64) mas reciente compatible con el shape
# ---------------------------------------------------------------------------
log "Buscando imagen mas reciente de '$OS_NAME $OS_VERSION' para $SHAPE"
IMAGE_ID="$(oci compute image list \
  --compartment-id "$COMPARTMENT_ID" \
  --operating-system "$OS_NAME" \
  --operating-system-version "$OS_VERSION" \
  --shape "$SHAPE" \
  --sort-by TIMECREATED --sort-order DESC \
  --query 'data[0].id' --raw-output)"
[ -n "$IMAGE_ID" ] && [ "$IMAGE_ID" != "null" ] || die "No encontre imagen $OS_NAME $OS_VERSION para $SHAPE."
log "Imagen: $IMAGE_ID"

# ---------------------------------------------------------------------------
# 4. Red: reutiliza o crea VCN + subnet publica con puertos abiertos
# ---------------------------------------------------------------------------
if [ -n "${OCI_SUBNET_ID:-}" ]; then
  SUBNET_ID="$OCI_SUBNET_ID"
  log "Usando subnet existente: $SUBNET_ID"
else
  VCN_NAME="${DISPLAY_NAME}-vcn"
  VCN_ID="$(oci network vcn list --compartment-id "$COMPARTMENT_ID" \
    --display-name "$VCN_NAME" --query 'data[0].id' --raw-output 2>/dev/null || true)"

  if [ -z "${VCN_ID:-}" ] || [ "$VCN_ID" = "null" ]; then
    log "Creando VCN $VCN_NAME ($VCN_CIDR)"
    VCN_ID="$(oci network vcn create --compartment-id "$COMPARTMENT_ID" \
      --display-name "$VCN_NAME" --cidr-blocks "[\"$VCN_CIDR\"]" \
      --wait-for-state AVAILABLE --query 'data.id' --raw-output)"

    log "Creando Internet Gateway"
    IG_ID="$(oci network internet-gateway create --compartment-id "$COMPARTMENT_ID" \
      --vcn-id "$VCN_ID" --is-enabled true --display-name "${DISPLAY_NAME}-ig" \
      --wait-for-state AVAILABLE --query 'data.id' --raw-output)"

    RT_ID="$(oci network vcn get --vcn-id "$VCN_ID" \
      --query 'data."default-route-table-id"' --raw-output)"
    log "Agregando ruta 0.0.0.0/0 -> Internet Gateway"
    oci network route-table update --rt-id "$RT_ID" --force \
      --route-rules "[{\"cidrBlock\":\"0.0.0.0/0\",\"networkEntityId\":\"$IG_ID\"}]" \
      --wait-for-state AVAILABLE >/dev/null

    SL_ID="$(oci network vcn get --vcn-id "$VCN_ID" \
      --query 'data."default-security-list-id"' --raw-output)"
    log "Abriendo puertos 22, 80, 443, 8000 en la security list"
    oci network security-list update --security-list-id "$SL_ID" --force \
      --egress-security-rules '[{"destination":"0.0.0.0/0","protocol":"all","isStateless":false}]' \
      --ingress-security-rules '[
        {"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":22,"max":22}}},
        {"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":80,"max":80}}},
        {"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":443,"max":443}}},
        {"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":8000,"max":8000}}},
        {"source":"0.0.0.0/0","protocol":"1","isStateless":false,"icmpOptions":{"type":3,"code":4}}
      ]' --wait-for-state AVAILABLE >/dev/null
  else
    log "Reutilizando VCN existente: $VCN_ID"
  fi

  SUBNET_NAME="${DISPLAY_NAME}-subnet"
  SUBNET_ID="$(oci network subnet list --compartment-id "$COMPARTMENT_ID" \
    --vcn-id "$VCN_ID" --display-name "$SUBNET_NAME" \
    --query 'data[0].id' --raw-output 2>/dev/null || true)"
  if [ -z "${SUBNET_ID:-}" ] || [ "$SUBNET_ID" = "null" ]; then
    log "Creando subnet publica $SUBNET_NAME ($SUBNET_CIDR)"
    SUBNET_ID="$(oci network subnet create --compartment-id "$COMPARTMENT_ID" \
      --vcn-id "$VCN_ID" --display-name "$SUBNET_NAME" --cidr-block "$SUBNET_CIDR" \
      --prohibit-public-ip-on-vnic false \
      --wait-for-state AVAILABLE --query 'data.id' --raw-output)"
  else
    log "Reutilizando subnet existente: $SUBNET_ID"
  fi
fi

# ---------------------------------------------------------------------------
# 5. Lanzar la instancia, probando cada Availability Domain (con reintentos)
# ---------------------------------------------------------------------------
mapfile -t ADS < <(oci iam availability-domain list --compartment-id "$COMPARTMENT_ID" \
  --query 'data[].name' --raw-output | jq -r '.[]')
[ "${#ADS[@]}" -gt 0 ] || die "No pude listar Availability Domains."
log "Availability Domains: ${ADS[*]}"

launch_instance() {
  local ad="$1"
  oci compute instance launch \
    --compartment-id "$COMPARTMENT_ID" \
    --availability-domain "$ad" \
    --display-name "$DISPLAY_NAME" \
    --shape "$SHAPE" \
    --shape-config "{\"ocpus\":$OCPUS,\"memoryInGBs\":$MEMORY_GB}" \
    --image-id "$IMAGE_ID" \
    --boot-volume-size-in-gbs "$BOOT_VOL_GB" \
    --subnet-id "$SUBNET_ID" \
    --assign-public-ip true \
    --metadata "{\"ssh_authorized_keys\":\"$SSH_PUB_KEY\"}" \
    --user-data-file "$CLOUD_INIT_FILE" \
    --wait-for-state RUNNING \
    --query 'data.id' --raw-output
}

INSTANCE_ID=""
attempt=0
while :; do
  for ad in "${ADS[@]}"; do
    log "Lanzando instancia en $ad (intento $((attempt+1)))..."
    if INSTANCE_ID="$(launch_instance "$ad" 2>/tmp/oci_launch_err)"; then
      log "Instancia creada: $INSTANCE_ID"
      break 2
    fi
    if grep -qi 'Out of host capacity\|LimitExceeded\|capacity' /tmp/oci_launch_err; then
      warn "Sin capacidad en $ad. $(head -1 /tmp/oci_launch_err)"
    else
      cat /tmp/oci_launch_err >&2
      die "Fallo al lanzar la instancia (error no relacionado con capacidad)."
    fi
  done
  attempt=$((attempt+1))
  if [ "$CAPACITY_RETRIES" -eq 0 ] || [ "$attempt" -gt "$CAPACITY_RETRIES" ]; then
    die "Sin capacidad ARM Always Free en ningun AD. Reintenta mas tarde o usa CAPACITY_RETRIES=50."
  fi
  warn "Reintentando en ${RETRY_WAIT}s (intento $attempt/$CAPACITY_RETRIES)..."
  sleep "$RETRY_WAIT"
done

# ---------------------------------------------------------------------------
# 6. IP publica y resumen
# ---------------------------------------------------------------------------
VNIC_ID="$(oci compute instance list-vnics --instance-id "$INSTANCE_ID" \
  --query 'data[0].id' --raw-output)"
PUBLIC_IP="$(oci network vnic get --vnic-id "$VNIC_ID" \
  --query 'data."public-ip"' --raw-output)"

printf '\033[1;32m========================================================\033[0m\n'
cat <<EOF
 VM Always Free creada e instalando Coolify.
--------------------------------------------------------
 Instancia : $DISPLAY_NAME  ($OCPUS OCPU / ${MEMORY_GB}GB / ${BOOT_VOL_GB}GB)
 IP publica: $PUBLIC_IP
 SSH       : ssh -i $SSH_KEY_PATH ubuntu@$PUBLIC_IP
 Panel     : http://$PUBLIC_IP:8000   (espera 3-8 min al primer arranque)
--------------------------------------------------------
 Seguir la instalacion de Coolify:
   ssh -i $SSH_KEY_PATH ubuntu@$PUBLIC_IP \\
     'sudo tail -f /var/log/coolify-install.log'
EOF
printf '\033[1;32m========================================================\033[0m\n'
