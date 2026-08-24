# Coolify en Oracle Cloud Always Free (ARM Ampere A1)

Automatiza la creación de una VM en la **capa gratuita de Oracle Cloud (OCI)** con
el **máximo de recursos Always Free** e instala **Coolify** de forma desatendida.

## ¿Qué crea?

La instancia usa el shape **`VM.Standard.A1.Flex`** (ARM Ampere A1), que es el
tope de lo *Always Free*:

| Recurso  | Valor            | Nota                                            |
|----------|------------------|-------------------------------------------------|
| OCPU     | **4**            | Todo el cupo ARM gratuito en una sola VM        |
| RAM      | **24 GB**        | Tope Always Free                                |
| Disco    | **50 GB**        | Ajustable (Always Free permite hasta 200 GB)    |
| SO       | Ubuntu 22.04 ARM | Imagen oficial de Canonical                     |
| Red      | VCN + subnet pública | Puertos 22, 80, 443, 8000 abiertos          |

> El cupo ARM Always Free total es 4 OCPU / 24 GB. Esta VM lo usa completo, así
> que no podrás crear otra VM ARM en paralelo sin reducir estos valores.

## Requisitos

1. **OCI CLI** instalado y configurado:
   ```bash
   oci setup config      # crea ~/.oci/config con tus llaves de API
   oci iam region list   # prueba que responde
   ```
2. **jq** (`brew install jq` / `sudo apt install jq`).
3. Cupo Always Free disponible en tu tenancy.

## Uso

```bash
cd oracle-coolify
./provision.sh
```

El script:
1. Detecta tu tenancy/compartment desde `~/.oci/config`.
2. Genera una llave SSH en `~/.ssh/oci_coolify` (si no existe).
3. Busca la imagen Ubuntu ARM más reciente.
4. Crea (o reutiliza) la red: VCN, Internet Gateway, ruta y security list con
   los puertos abiertos, y una subnet pública.
5. Lanza la instancia probando cada Availability Domain.
6. Pasa `cloud-init.yaml` para que la VM instale Coolify sola en el primer arranque.
7. Imprime la IP pública, el comando SSH y la URL del panel.

Al terminar verás algo así:

```
 IP publica: 140.238.x.x
 SSH       : ssh -i ~/.ssh/oci_coolify ubuntu@140.238.x.x
 Panel     : http://140.238.x.x:8000
```

Espera **3–8 minutos** (el primer arranque actualiza el SO e instala Docker +
Coolify) y abre `http://<IP>:8000` para crear tu usuario administrador.

Para seguir la instalación en vivo:
```bash
ssh -i ~/.ssh/oci_coolify ubuntu@<IP> 'sudo tail -f /var/log/coolify-install.log'
```

## "Out of host capacity" (muy común con ARM gratuito)

La capacidad ARM Always Free se agota seguido. Si ves ese error, reintenta
automáticamente cada minuto hasta conseguir un hueco:

```bash
CAPACITY_RETRIES=100 RETRY_WAIT=60 ./provision.sh
```

Consejos: prueba en distintos momentos del día o cambia de región
(`oci setup config` o editando `~/.oci/config`). Algunas regiones tienen más
capacidad ARM que otras.

## Variables configurables

Todas se pasan como variables de entorno:

| Variable             | Default                | Descripción                              |
|----------------------|------------------------|------------------------------------------|
| `DISPLAY_NAME`       | `coolify`              | Nombre de la instancia y de la red       |
| `OCPUS`              | `4`                    | vCPUs (máx Always Free: 4)               |
| `MEMORY_GB`          | `24`                   | RAM en GB (máx Always Free: 24)          |
| `BOOT_VOL_GB`        | `50`                   | Tamaño del disco                         |
| `OS_VERSION`         | `22.04`                | Versión de Ubuntu                        |
| `OCI_COMPARTMENT_ID` | tenancy raíz           | OCID del compartment donde crear la VM   |
| `OCI_SUBNET_ID`      | *(crea red nueva)*     | Usa una subnet existente en vez de crearla |
| `SSH_KEY_PATH`       | `~/.ssh/oci_coolify`   | Ruta de la llave SSH (sin extensión)     |
| `CAPACITY_RETRIES`   | `0`                    | Reintentos por falta de capacidad        |
| `RETRY_WAIT`         | `60`                   | Segundos entre reintentos                |

Ejemplo con una VM más chica (para dejar cupo ARM libre):
```bash
OCPUS=2 MEMORY_GB=12 ./provision.sh
```

## Después de crear la VM

- **DNS y HTTPS**: apunta un dominio a la IP pública. Coolify puede emitir
  certificados Let's Encrypt automáticamente en el puerto 443 (ya abierto).
- **Panel en el 8000**: es HTTP. Para exponerlo con HTTPS configura un dominio
  para el propio Coolify desde su interfaz (Settings → Instance).
- **Seguridad**: considera restringir el puerto 8000 a tu IP en la security
  list una vez configurado, o accede vía túnel SSH:
  `ssh -i ~/.ssh/oci_coolify -L 8000:localhost:8000 ubuntu@<IP>`.

## Limpieza

Para borrar todo lo creado, elimina la instancia desde la consola de OCI o:
```bash
oci compute instance terminate --instance-id <OCID> --force
```
Luego borra la subnet, la VCN y sus gateways si ya no los usas.
