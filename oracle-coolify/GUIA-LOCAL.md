# Guía local: VM Always Free en Oracle Cloud + Coolify

Guía completa y autocontenida para hacerlo **desde tu máquina local**, desde cero
hasta tener Coolify funcionando. Tienes dos caminos:

- **Camino A (rápido):** ejecutar el script `provision.sh` de este repo. → [ir](#camino-a-script-automatico)
- **Camino B (manual):** ejecutar cada comando de OCI CLI tú mismo, para entender
  y controlar cada paso. → [ir](#camino-b-paso-a-paso-manual)

> **Qué vas a crear:** una VM `VM.Standard.A1.Flex` (ARM Ampere A1) con
> **4 OCPU + 24 GB RAM + 50 GB disco**, Ubuntu 22.04 — el tope de la capa
> *Always Free* de Oracle — con Coolify instalado.

---

## 0. Requisitos previos

### 0.1 Cuenta de Oracle Cloud
- Cuenta creada en <https://cloud.oracle.com> (aunque tengas la de pago, los
  recursos *Always Free* no cuestan).

### 0.2 Instalar OCI CLI (si no lo tienes)

**macOS / Linux:**
```bash
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"
```

**Windows (PowerShell):**
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.ps1'))"
```

Verifica:
```bash
oci --version
```

### 0.3 Instalar jq (lo usa el script)
```bash
# macOS
brew install jq
# Ubuntu/Debian
sudo apt install -y jq
# Windows (winget)
winget install jqlang.jq
```

### 0.4 Configurar el OCI CLI

```bash
oci setup config
```

Te preguntará:
- **User OCID** → consola OCI → arriba a la derecha (tu avatar) → *My profile* →
  copia el OCID.
- **Tenancy OCID** → menú → *Tenancy details* → copia el OCID.
- **Region** → p. ej. `us-ashburn-1`, `sa-saopaulo-1`, `eu-madrid-1`, etc.
- Deja que genere un **nuevo par de llaves de API** (RSA). Anota la ruta
  (por defecto `~/.oci/`).

Después, **sube la llave pública a tu usuario en OCI**:
1. Consola OCI → *My profile* → *API keys* → *Add API key*.
2. Elige *Paste public key* y pega el contenido de:
   ```bash
   cat ~/.oci/oci_api_key_public.pem
   ```
3. Guarda.

Prueba que la autenticación funciona:
```bash
oci iam region list --output table
```
Si devuelve la tabla de regiones, ya estás autenticado. ✅

---

## Camino A: script automático

```bash
# 1. Clona el repo (o haz git pull si ya lo tienes)
git clone https://github.com/duvanjamid/spider.git
cd spider
git checkout claude/oracle-coolify-setup-mosqdl
cd oracle-coolify

# 2. Ejecuta
./provision.sh
```

Si sale **"Out of host capacity"** (muy común con ARM gratis), reintenta
automáticamente cada minuto hasta conseguir hueco:
```bash
CAPACITY_RETRIES=100 RETRY_WAIT=60 ./provision.sh
```

Al terminar imprime la IP, el comando SSH y la URL del panel. Salta a
[Después de crear la VM](#4-despues-de-crear-la-vm).

---

## Camino B: paso a paso manual

Ejecuta estos comandos en orden. Cada uno guarda su resultado en una variable
para usarlo en el siguiente (usa **bash/zsh**; en Windows usa Git Bash o WSL).

### B.1 Variables base

```bash
# Tu compartment: para la capa gratis usa el tenancy raíz.
export COMPARTMENT_ID=$(grep '^tenancy=' ~/.oci/config | cut -d= -f2)
echo "Compartment: $COMPARTMENT_ID"

export DISPLAY_NAME="coolify"
```

### B.2 Llave SSH para entrar a la VM

```bash
ssh-keygen -t ed25519 -f ~/.ssh/oci_coolify -N "" -C "coolify@oci"
export SSH_PUB_KEY=$(cat ~/.ssh/oci_coolify.pub)
```

### B.3 Imagen Ubuntu ARM más reciente

```bash
export IMAGE_ID=$(oci compute image list \
  --compartment-id "$COMPARTMENT_ID" \
  --operating-system "Canonical Ubuntu" \
  --operating-system-version "22.04" \
  --shape "VM.Standard.A1.Flex" \
  --sort-by TIMECREATED --sort-order DESC \
  --query 'data[0].id' --raw-output)
echo "Imagen: $IMAGE_ID"
```

### B.4 Red: VCN + Internet Gateway + ruta + puertos

```bash
# VCN
export VCN_ID=$(oci network vcn create \
  --compartment-id "$COMPARTMENT_ID" \
  --display-name "${DISPLAY_NAME}-vcn" \
  --cidr-blocks '["10.0.0.0/16"]' \
  --wait-for-state AVAILABLE --query 'data.id' --raw-output)

# Internet Gateway
export IG_ID=$(oci network internet-gateway create \
  --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" \
  --is-enabled true --display-name "${DISPLAY_NAME}-ig" \
  --wait-for-state AVAILABLE --query 'data.id' --raw-output)

# Ruta por defecto -> Internet
export RT_ID=$(oci network vcn get --vcn-id "$VCN_ID" \
  --query 'data."default-route-table-id"' --raw-output)
oci network route-table update --rt-id "$RT_ID" --force \
  --route-rules "[{\"cidrBlock\":\"0.0.0.0/0\",\"networkEntityId\":\"$IG_ID\"}]" \
  --wait-for-state AVAILABLE

# Abrir puertos 22, 80, 443, 8000 en la security list por defecto
export SL_ID=$(oci network vcn get --vcn-id "$VCN_ID" \
  --query 'data."default-security-list-id"' --raw-output)
oci network security-list update --security-list-id "$SL_ID" --force \
  --egress-security-rules '[{"destination":"0.0.0.0/0","protocol":"all","isStateless":false}]' \
  --ingress-security-rules '[
    {"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":22,"max":22}}},
    {"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":80,"max":80}}},
    {"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":443,"max":443}}},
    {"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":8000,"max":8000}}}
  ]' --wait-for-state AVAILABLE

# Subnet pública
export SUBNET_ID=$(oci network subnet create \
  --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" \
  --display-name "${DISPLAY_NAME}-subnet" --cidr-block "10.0.1.0/24" \
  --prohibit-public-ip-on-vnic false \
  --wait-for-state AVAILABLE --query 'data.id' --raw-output)
```

### B.5 Availability Domain

```bash
export AD=$(oci iam availability-domain list \
  --compartment-id "$COMPARTMENT_ID" \
  --query 'data[0].name' --raw-output)
echo "AD: $AD"
```

### B.6 cloud-init para instalar Coolify

Usa el archivo `cloud-init.yaml` de este repo (abre el firewall del SO e instala
Coolify en el primer arranque). Si estás en la carpeta `oracle-coolify`, la ruta
es `./cloud-init.yaml`.

### B.7 Lanzar la instancia (4 OCPU / 24 GB)

```bash
export INSTANCE_ID=$(oci compute instance launch \
  --compartment-id "$COMPARTMENT_ID" \
  --availability-domain "$AD" \
  --display-name "$DISPLAY_NAME" \
  --shape "VM.Standard.A1.Flex" \
  --shape-config '{"ocpus":4,"memoryInGBs":24}' \
  --image-id "$IMAGE_ID" \
  --boot-volume-size-in-gbs 50 \
  --subnet-id "$SUBNET_ID" \
  --assign-public-ip true \
  --metadata "{\"ssh_authorized_keys\":\"$SSH_PUB_KEY\"}" \
  --user-data-file "./cloud-init.yaml" \
  --wait-for-state RUNNING \
  --query 'data.id' --raw-output)
echo "Instancia: $INSTANCE_ID"
```

> Si aquí sale **`Out of host capacity`**: repite este comando cambiando el AD
> (`--availability-domain`) o inténtalo más tarde / en otra región. Es normal
> con ARM gratis. El Camino A automatiza estos reintentos.

### B.8 Obtener la IP pública

```bash
export VNIC_ID=$(oci compute instance list-vnics \
  --instance-id "$INSTANCE_ID" --query 'data[0].id' --raw-output)
export PUBLIC_IP=$(oci network vnic get --vnic-id "$VNIC_ID" \
  --query 'data."public-ip"' --raw-output)
echo "IP publica: $PUBLIC_IP"
```

---

## 4. Después de crear la VM

Coolify se instala solo en el primer arranque (tarda **3–8 min**).

**Ver la instalación en vivo:**
```bash
ssh -i ~/.ssh/oci_coolify ubuntu@$PUBLIC_IP 'sudo tail -f /var/log/coolify-install.log'
```

**Abrir el panel:** cuando el log diga que terminó, entra a:
```
http://<IP_PUBLICA>:8000
```
La primera visita te pide crear el **usuario administrador**. Listo. 🎉

### 4.1 Dominio y HTTPS
- Apunta un registro **A** de tu dominio a la IP pública.
- En Coolify: *Settings → Instance* pon tu dominio para el panel; Coolify emite
  certificado Let's Encrypt automáticamente (puerto 443 ya está abierto).

### 4.2 Endurecer seguridad (recomendado)
El puerto 8000 queda abierto a internet. Opciones:
- Restringir el 8000 a tu IP en la security list, **o**
- Cerrar el 8000 y entrar por túnel SSH:
  ```bash
  ssh -i ~/.ssh/oci_coolify -L 8000:localhost:8000 ubuntu@$PUBLIC_IP
  # luego abre http://localhost:8000
  ```

---

## 5. Problemas comunes

| Síntoma | Causa / solución |
|---|---|
| `Out of host capacity` | No hay ARM gratis en ese AD/región. Reintenta con `CAPACITY_RETRIES=100 RETRY_WAIT=60 ./provision.sh`, o prueba otra región. |
| `NotAuthenticated` / `401` | Falta subir la llave pública de API en *My profile → API keys*, o `~/.oci/config` mal. Repite `oci setup config`. |
| `LimitExceeded` sobre OCPU/memoria | Ya usaste tu cupo ARM (4 OCPU/24 GB). Borra otra VM ARM o crea una más chica: `OCPUS=2 MEMORY_GB=12 ./provision.sh`. |
| El panel no carga en `:8000` | Espera a que el log termine; verifica que la security list y el firewall del SO tengan el 8000 abierto (el cloud-init lo hace). |
| SSH pide contraseña / rechaza | Usa `-i ~/.ssh/oci_coolify` y el usuario `ubuntu`. |

---

## 6. Borrar todo (limpieza)

```bash
# Terminar la instancia (borra también su boot volume)
oci compute instance terminate --instance-id "$INSTANCE_ID" --force

# Luego, desde la consola OCI o por CLI, borra en orden:
# subnet -> internet gateway -> VCN
```
