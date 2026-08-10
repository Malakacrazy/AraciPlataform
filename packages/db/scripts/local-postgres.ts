import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

// Local dev/test Postgres — no Docker or system install required. Data
// persists in packages/db/.pgdata (gitignored) between runs. Port 5433,
// not 5432, to avoid colliding with any Postgres already on the machine.
//
// This process must stay alive for Postgres to keep running: the
// embedded-postgres library shuts the server down via an exit hook when
// this Node process exits. Stop it with Ctrl+C (graceful shutdown) rather
// than killing it forcefully.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_NAME = "araci_dev";
const PORT = 5433;
const USER = "araci";
const PASSWORD = "araci_dev_password";

const DATA_DIR = path.join(__dirname, "..", ".pgdata");

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  port: PORT,
  user: USER,
  password: PASSWORD,
  persistent: true,
});

async function main() {
  // A diferença de initdb (que exige o diretório vazio) não é opcional: a
  // lib não checa sozinha se o cluster já existe, é o chamador que precisa
  // pular initialise() nesse caso (ver embedded-postgres/dist/index.js,
  // docstring de initialise()).
  const alreadyInitialised = existsSync(path.join(DATA_DIR, "PG_VERSION"));
  if (!alreadyInitialised) {
    await pg.initialise();
  }
  await pg.start();

  try {
    await pg.createDatabase(DATABASE_NAME);
  } catch {
    // já existe de uma execução anterior — persistent: true mantém os dados
  }

  const databaseUrl = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE_NAME}`;
  console.log("\nPostgres local rodando.");
  console.log(`DATABASE_URL="${databaseUrl}"`);
  console.log("\nCole isso em packages/db/.env e apps/web/.env.local.");
  console.log("Ctrl+C para parar (desligamento gracioso via exit hook).\n");

  await new Promise(() => {}); // mantém o processo vivo até Ctrl+C
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
