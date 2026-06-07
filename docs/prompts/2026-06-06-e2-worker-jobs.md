# Session: 2026-04-29 — E2-Workers y Jobs
**Agente:** Gemini 1.5 Pro
**Owner:** Joaquín Salas
**Branch:** feature/E2 - Workers y Jobs 

## Prompt

Actúa como un Arquitecto de Software Lead y Agente Autónomo experto en sistemas distribuidos y mensajería asíncrona. Estamos desarrollando **CityExpress**, una red de mensajería dimensional distribuida. Este repositorio es el **backend en NestJS + TypeScript**, gestionado con **pnpm**.

---

### PASO 0 — Lectura obligatoria antes de escribir código

Lee **todos** los archivos `.md` dentro de `/docs`. Ahí están la arquitectura, milestones, roadmap y convenciones del proyecto. No escribas ni propongas código hasta haber leído esos archivos. Si algún `.md` contradice este prompt, los `.md` tienen prioridad.

---

### Contexto del sistema

Somos una ciudad del ecosistema CityExpress. Nuestra ciudad tiene un `cityId` (code de 3 letras, ej: `RNC`). Nos comunicamos con otras ciudades y con una `central` mediante **colas RabbitMQ** usando el binding `city.{cityId}`.


---

### Schema base de mensajes

Todo mensaje intercambiado tiene esta estructura mínima:

```json
{
  "idpk": "uuid",        // llave de idempotencia
  "msgId": "uuid",       // ID único del mensaje (aleatorio)
  "type": "...",         // tipo del mensaje
  "timestamp": "ISO8601",
  "cityId": "RNC"        // incluir cuando nosotros enviamos
}

    idpk garantiza idempotencia: reintentos del mismo msgId deben tener el mismo idpk. Debe diferir de msgId.

    ACK: confirmar recepción de una petición → { type: "ack", ... }

    NACK: mensaje malformado → { type: "nack", ... }. No se hacen ACK de ACK.

Rutas y tabla de distancias (Evolución a Microservicio de Enrutamiento)

Al iniciar el servicio, se solicita la tabla de distancias a la central. Sin embargo, el cálculo de las rutas óptimas multicriterio (por distancia y por precio) ya no se realiza de forma estática o aleatoria en este backend. Se delega de manera asíncrona a un Microservicio externo (Job Master + Workers distribuídos con BullMQ).

La respuesta base de distancias crudas se procesa desde parsed.data.data.distances y se mapea usando la propiedad estricta transportCost para evitar discrepancias de tipado en TypeScript.
Lógica de tránsito de paquetes

Los paquetes llegan a nuestra cola con type: "package-transit". Al recibir un paquete, el flujo de decisión consume el método getNextHop(destinationId, criteria) expuesto por nuestro servicio de enrutamiento:

    ¿El paquete es para nuestra ciudad? Delivery inmediato o persistencia si no ha vencido deliverNotBefore.

    ¿No es para nosotros?

        Si maxHops === 0 → Expirado.

        Si maxHops > 0 → Reducción de maxHops en 1 y consulta de getNextHop.

            Si retorna un Next Hop válido: Se despacha a la siguiente ciudad intermedia o destino final según el criterio óptimo (price o distance).

            Si retorna null: Significa que las tablas de enrutamiento procesadas por los workers aún no están listas o el nodo es inalcanzable. El paquete se almacena de forma persistente en la cola de pendientes.

Output

    - DistanceTableService Refactorizado: Incorporación del estado en memoria computedRoutes con soporte para tipado estricto multicriterio (byDistance y byPrice). Implementación real del método síncrono getNextHop(destinationId, criteria) para remover stubs temporales.

    - RoutingOrchestratorService (Nuevo en src/routing/): Orquestador de infraestructura distribuida encargado de traducir el mapa de red actual, construir el grafo compatible y despachar las solicitudes pesadas de procesamiento mediante un POST /job hacia el microservicio.

    - Motor de Sondeo Asíncrono (Polling): Mecanismo de reintentos lineales integrado en el Orquestador para consultar de manera periódica (GET /job/:id) el estado del Job en Redis, esperando la resolución exitosa (completed) por parte de los Workers de BullMQ antes de mutar el estado en memoria de la aplicación.

    - Corrección de Mapeos de Datos: Corrección de la desestructuración de payloads anidados en Zod (parsed.data.data.distances) y unificación de la propiedad financiera bajo el nombre tipado de transportCost.

    - Suite de Testing Modernizada:

        distance-table.service.spec.ts: Actualizado para inyectar de forma correcta el nuevo mock del RoutingOrchestratorService cumpliendo con las firmas del constructor de NestJS.

        package.service.spec.ts: Reescritura total del mock de DistanceTableService, sustituyendo las aserciones basadas en aleatoriedad y rutas estáticas por simulaciones deterministas de getNextHop() para validar de forma limpia los flujos de tránsito directo, redirección y encolamiento por falta de rutas.

Decisión

    - Desacoplamiento de Cómputo mediante Workers: Externalizar algoritmos de caminos mínimos para salvaguardar el event-loop principal de NestJS, delegando la carga pesada al clúster de workers distribuidos.

    - Estrategia de Comunicación por Sondeo (Polling): Utilizar consultas HTTP asíncronas controladas con límite de reintentos hacia el Job Master para asimilar las respuestas del Worker, evitando la sobreingeniería de implementar WebSockets o canales dedicados bidireccionales en esta fase del MVP.

    - Persistencia Unificada de Rutas Pendientes: Si los Workers de BullMQ aún no han retornado un resultado para el grafo actual, el sistema asume de forma segura un retorno null en getNextHop, forzando al paquete a resguardarse en la base de datos hasta la próxima ventana de convergencia.


Tradeoffs

    - Latencia de Red vs Carga de CPU: Delegar el cálculo a un microservicio externo e interactuar mediante HTTP Polling (1s de delay por intento) introduce una penalización de tiempo imperceptible en el tránsito dimensional de paquetes, pero libera por completo la memoria y procesamiento del servidor de la aplicación.

    - Acoplamiento al Job Master: Si el microservicio de BullMQ experimenta una caída total, el backend continuará operando y recibiendo paquetes de forma resiliente, pero encolará todas las transferencias inter-ciudades como "pendientes" hasta que el clúster de Workers vuelva a estar en línea.

