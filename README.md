# Entrega 0: QuackPackage

- **Framework Web (Master):** Nest.js (TypeScript), elegido por su arquitectura modular limpia que permite un crecimiento ordenado y escalable.
- **Microservicio Conector (Connector):** Node.js puro usando `amqplib` y `axios` para consumo ligero y envío rápido de eventos a Master.
- **Base de datos:** PostgreSQL.
- **ORM:** Prisma v7 con adapter de PostgreSQL, aprovechando su sólido soporte de migración y validación transaccional por TypeScript.
- **Entorno en la nube:** AWS EC2 (Servidor Ubuntu LTS) con NGINX como **Reverse Proxy**.
- **Infraestructura orquestada:** Todo el stack de base de datos, servicio connector y master corren aislados y comunicados internamente en Docker-Compose por la network `quack-net`.

---

## 🧩 Resolución de las Entregas y Puntajes

A continuación, marco el estatus de todos los requisitos de acuerdo a la implementación realizada:

### Requisitos Funcionales (Parte mínima) (10p)

- ✅ **RF1 (3p) Esencial:** La API ofrece la lista de los paquetes reportados con todos los campos recuperados del body y aplanados en el schema ORM.
- ✅ **RF2 (1p) Esencial:** Se ofrece endpoint `GET /packages/:id` para mostrar el detalle de cada paquete específico por ID.
- ✅ **RF3 (2p) Esencial:** Endpoint de lista está paginado por defecto de a 25 registros empleando los `queryParams` de `page` y `limit` (mediante las operaciones *skip* y *take* de Prisma).
- ✅ **RF4 (4p) Esencial:** El endpoint de lista permite filtrar por todas sus variantes (`payment`, `originId`, `deliveryStrategy` y los registros según fecha desde `createdAt`).

### Requisitos No Funcionales (20p)

- ✅ **RNF1 (5p) Esencial:** Módulo `connector` funcionando 100% independiente para conectarse al `observer.XX.q` en RabbitMQ y consumiendo los JSONs (`type: package-received`) para enviarlos mediante solicitudes POST a la API web.
- ✅ **RNF2 (4p) Esencial:** Servicio web en `master` recibe en su ruta POST los datos para registrarlos en la DB.
- ✅ **RNF3 (3p):** Uso de proxy inverso **NGINX** instalado puramente sobre la máquina EC2 y redirigiendo hacia el puerto **3000** del contenedor web.
- ✅ **RNF4 (2p):** Servidor con el dominio `e0-quackpackage-vruizz22.tech`.
- ✅ **RNF5 (2p) Esencial:** Servidor corriendo y hosteado en AWS EC2 (Free Tier `t3.micro`).
- ✅ **RNF6 (4p):** Contenedor de la base de datos de persistencia en PostgreSQL administrada mediante el orquestador sin costo de RDS externo.

### Docker-Compose (15p)

- ✅ **RNF1 (5p):** App `master` se lanza empaquetada en una imagen `node:20-alpine` pre-poblada con las migraciones Prisma en su init.
- ✅ **RNF2 (5p):** DB `db` empaquetada usando `postgres:15-alpine` y volúmenes internos de Docker (storage en `pgdata`).
- ✅ **RNF3 (5p):** Servicio de cola `connector` orquestado esperando a que primero compile `master`, comunicándose con este localmente sin exponer puertos expuestos hacia el host (sólo mediante internal network `quack-net`).

### Parte Variable

He optado por **HTTPS (25% - 15p)**:

- ✅ **RNF1:** El tráfico está asegurado correctamente con SSL utilizando Let's Encrypt (Certbot).
- ✅ **RNF2:** Todas las peticiones HTTP convencionales en el puerto 80 son redirigidas a HTTPS en el puerto 443 a nivel NGINX.
- ✅ **RNF3:** El chequeo automático de expiración de Certbot se enlista y ejecuta periódicamente 2 veces al día empleando nativamente los cronjobs/timers de Ubuntu.

---

## 📚 Arquitectura de Base de Datos y DBML

El diseño de la base aplanó los registros anidados recibidos del broker para maximizar y facilitar su filtrado:

```sql
Project quackpackage {
  database_type: 'PostgreSQL'
  Note: 'Modelo de datos para los paquetes recibidos (QuackPackage)'
}

Table package_event {
  idpk             varchar     [pk, not null, note: 'UUIDv4 - Primary Key']
  type             varchar     [not null]
  packageId        varchar     [not null]
  deliveryStrategy varchar     [not null]
  maxHops          int         [not null]
  createdAt        timestamptz [not null]
  deliverNotBefore timestamptz
  originId         varchar     [not null]
  destinationId    varchar     [not null]
  metaContent      varchar
  isMetaEncrypted  boolean     [not null]
  constraints      json
  priorityClass    varchar     [not null]
  payment          float       [not null]
}
```

---

## 📁 Archivos y Configuración Relevante

### Nombre del dominio

El servidor web expuesto y funcionando está en la URL: **[https://e0-quackpackage-vruizz22.tech/packages](https://e0-quackpackage-vruizz22.tech/packages)**, la ip de la instancia EC2 es `100.48.21.91` y el dominio está registrado en Namecheap apuntando a esta IP.

## Ejecución local

La ejecución local se realiza mediante Docker-Compose, el cual levanta los servicios de base de datos, master y connector en una red interna aislada. Para iniciar el entorno, simplemente ejecutar:

```bash
docker-compose up -d
```

Con prisma realizaremos las migraciones y luego podremos consumir los endpoints de la API en `http://localhost:3000/packages` para listar los paquetes registrados. El servicio connector se encargará de consumir los eventos del broker y enviar los datos a master automáticamente.

```bash
pnpx prisma migrate dev --name init
```

Donde init es el nombre de la migración, el cual se puede cambiar a algo más descriptivo si se desea. Sobretodo para futuras migraciones.

### ENV

Las variables de entorno se configuran en el archivo `.env` en la raíz del proyecto, el cual es cargado automáticamente por Docker-Compose y Prisma. Asegúrate de configurar correctamente las credenciales de la base de datos y del broker RabbitMQ para que el sistema funcione correctamente.

El env de ejemplo se encuentra ubicado en la ruta [`./.example.env`](./.example.env) y se debe renombrar a `.env` para su uso.
