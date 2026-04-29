/**
 * ============================================================================
 * Demo City Consumer — Connects to the fulfillment broker and listens for
 * packages on your city's queue.
 * ============================================================================
 *
 * WHAT THIS SCRIPT DOES:
 *   1. Connects via AMQPS (TLS on port 5671) to broker.iic2173.org
 *   2. Authenticates with your city's credentials (e.g. city.hgw / city.cor)
 *   3. Subscribes to your city's queue (e.g. city.hgw.q) in the "fulfillment" vhost
 *   4. Logs every received message to both the console and a file (o.log)
 *   5. Acknowledges each message so RabbitMQ removes it from the queue
 *   6. Shuts down gracefully after 5 minutes
 *
 * ============================================================================
 * PREREQUISITES — install these ONCE before running:
 * ============================================================================
 *
 *   You need Node.js v18 or higher. Check with:
 *     node --version
 *
 *   Then install the two required packages:
 *     npm install amqplib @types/amqplib
 *
 *   To compile TypeScript you also need:
 *     npm install typescript
 *
 * ============================================================================
 * HOW TO CONFIGURE — do this BEFORE running:
 * ============================================================================
 *
 *   1. Find BROKER_URL below (line ~68) and replace:
 *        <code>     → your city code in lowercase (e.g. hgw, cor, ree)
 *        <password> → your city's password (given by staff)
 *
 *      Example for Hogwarts:
 *        "amqps://city.hgw:YOUR_PASSWORD@broker.iic2173.org:5671/fulfillment"
 *
 *   2. Find QUEUE below (line ~72) and replace:
 *        <code>     → same city code as above
 *
 *      Example for Hogwarts:
 *        "city.hgw.q"
 *
 *   That's it. Do NOT change the host, port, or vhost.
 *
 * ============================================================================
 * HOW TO RUN:
 * ============================================================================
 *
 *   Option A — Compile then run (recommended):
 *     npx tsc listen-xxx.ts --esModuleInterop --module commonjs --target es2020
 *     node listen-xxx.js
 *
 *   Option B — Run directly without compiling:
 *     npx tsx listen-xxx.ts
 *
 *   Option C — Pass credentials via environment variable (no file editing):
 *     BROKER_URL="amqps://city.hgw:YOUR_PASSWORD@broker.iic2173.org:5671/fulfillment" \
 *       node listen-xxx.js
 *
 *   The script will run for 5 minutes, print every message to the console,
 *   and save them to o.log. You can stop it early with Ctrl+C.
 *
 * ============================================================================
 * COMMON ERRORS:
 * ============================================================================
 *
 *   "Error: Handshake terminated by server: 403 (ACCESS-REFUSED)"
 *     → Wrong username or password. Double-check your credentials.
 *
 *   "Error: NOT_FOUND - failed to perform operation on queue"
 *     → Wrong queue name. Make sure it matches city.<code>.q exactly.
 *
 *   "Error: getaddrinfo ENOTFOUND broker.iic2173.org"
 *     → DNS issue. Check your internet connection.
 *
 *   "Error: connect ETIMEDOUT"
 *     → Broker unreachable. Check that port 5671 is not blocked by your
 *       firewall or network.
 *
 * ============================================================================
 * UNDERSTANDING THE MESSAGES:
 * ============================================================================
 *
 *   Each message is a JSON object wrapped in a message envelope:
 *   {
 *     "type": "package-transit",     // message type
 *     "idpk": "...",                 // idempotency key (UUID)
 *     "msgId": "...",                // message ID (UUID)
 *     "timestamp": "...",            // ISO 8601 timestamp
 *     "body": {                      // the actual package
 *       "id": "...",                 // package UUID
 *       "deliveryStrategy": "direct",
 *       "maxHops": 0,                // 0 = deliver here, >0 = can redirect
 *       "originId": "central",       // who sent the package
 *       "destinationId": "hgw",      // where the package should go
 *       "metaContent": "...",        // package metadata
 *       ...
 *     }
 *   }
 *
 *   If destinationId matches YOUR city code → deliver it (it's for you)
 *   If destinationId is a DIFFERENT city   → you need to redirect it
 *   If maxHops is 0 and you can't deliver  → mark it as expired
 *
 * ============================================================================
 */

import * as amqp from "amqplib";
import * as fs from "fs";

// ── Configuration ──────────────────────────────────────────────────
//
// BROKER_URL format: amqps://<username>:<password>@<host>:<port>/<vhost>
//   - Protocol:  amqps (AMQP over TLS — the broker ONLY accepts TLS)
//   - Username:  city.<code> (e.g. city.hgw, city.cor, city.lsn)
//   - Password:  provided per city by staff
//   - Host:      broker.iic2173.org (do NOT change this)
//   - Port:      5671 (AMQPS standard port, do NOT change this)
//   - Vhost:     fulfillment (do NOT change this)
//
// *** REPLACE <code> and <password> with your actual values ***
const BROKER_URL =
    process.env.BROKER_URL ||
    "amqps://city.<code>:<password>@broker.iic2173.org:5671/fulfillment";

// Your city's queue. The broker routes messages here via the fulfillment.x
// topic exchange using the routing key city.<code>.
//
// *** REPLACE <code> with your city code (lowercase) ***
const QUEUE = "city.<code>.q";

// Log file — messages are appended, so you can run multiple sessions
const LOG_FILE = "o.log";

// How long to listen before shutting down (milliseconds)
// Change this if you want a longer or shorter session
const DURATION_MS = 5 * 60 * 1000; // 5 minutes

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Creates a logger that writes timestamped lines to both console and file.
 */
function createLogger(logStream: fs.WriteStream) {
    return (msg: string) => {
        const line = `[${new Date().toISOString()}] ${msg}`;
        console.log(line);
        logStream.write(line + "\n");
    };
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
    const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
    const log = createLogger(logStream);

    // Mask the password in log output so it doesn't leak
    log(`Connecting to ${BROKER_URL.replace(/:[^:@]+@/, ":***@")}...`);

    // ── Step 1: Connect to the broker over TLS ─────────────────────
    //
    // servername is required for TLS SNI (Server Name Indication) so the
    // broker presents the correct SSL certificate for broker.iic2173.org.
    const connection = await amqp.connect(BROKER_URL, {
        servername: "broker.iic2173.org",
    });

    // ── Step 2: Create a channel ───────────────────────────────────
    //
    // A channel is a lightweight session multiplexed over the TCP connection.
    // You send and receive messages through channels, not the connection itself.
    const channel = await connection.createChannel();

    // ── Step 3: Set prefetch ───────────────────────────────────────
    //
    // Prefetch = how many unacknowledged messages the broker sends at once.
    // With prefetch(10), the broker delivers up to 10 messages before waiting
    // for you to acknowledge them. This prevents your app from being flooded
    // if the queue has thousands of messages waiting.
    await channel.prefetch(10);

    log(`Connected. Consuming from ${QUEUE} for ${DURATION_MS / 1000}s...`);

    // ── Step 4: Start consuming ────────────────────────────────────
    //
    // channel.consume() registers a callback that fires every time the broker
    // delivers a message from the queue. Messages arrive one at a time.
    channel.consume(QUEUE, (msg) => {
        // msg is null if the consumer was cancelled by the broker (rare)
        if (!msg) return;

        // The message body is a Buffer. Convert to string, then parse as JSON.
        try {
            const payload = JSON.parse(msg.content.toString());
            log(`[${payload.type}] ${JSON.stringify(payload)}`);
        } catch {
            // If the message isn't valid JSON, log the raw content
            log(`[raw] ${msg.content.toString()}`);
        }

        // ── Step 5: Acknowledge the message ────────────────────────
        //
        // channel.ack(msg) tells RabbitMQ: "I've processed this message,
        // you can remove it from the queue."
        //
        // If you DON'T ack, RabbitMQ keeps the message and will redeliver
        // it when you reconnect. This is useful for reliability — if your
        // app crashes mid-processing, the message isn't lost.
        //
        // If you want to reject a message (e.g. it's malformed), use:
        //   channel.nack(msg, false, false)  — discard it
        //   channel.nack(msg, false, true)   — requeue it for retry
        channel.ack(msg);
    });

    // ── Step 6: Shut down after duration ───────────────────────────
    setTimeout(async () => {
        log("Duration elapsed. Closing.");
        await channel.close();
        await connection.close();
        logStream.end();
        process.exit(0);
    }, DURATION_MS);
}

// ── Entry point ────────────────────────────────────────────────────
//
// If the connection fails (wrong password, broker down, network issue),
// the error is caught here and printed before exiting.
main().catch((err) => {
    console.error("Fatal:", err.message || err);
    process.exit(1);
});
