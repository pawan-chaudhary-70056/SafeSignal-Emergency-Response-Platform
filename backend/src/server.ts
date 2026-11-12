import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { app } from "./app.js";
import { initRealtime } from "./realtime/index.js";

if (
  !process.env.DATABASE_URL &&
  typeof process.loadEnvFile === "function" &&
  existsSync(".env")
) {
  process.loadEnvFile(".env");
}

const port = Number(process.env.PORT ?? 4000);
const server = createServer(app);

initRealtime(server);

server.listen(port, () => {
  console.log(`SafeSignal API listening on http://localhost:${port}/api/v1`);
  console.log(`Socket.IO ready on ws://localhost:${port}/socket.io`);
});
