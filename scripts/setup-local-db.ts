import { Client } from "pg";

const databaseUrl =
  process.env.POSTGRES_ADMIN_URL ??
  `postgresql://${process.env.USER ?? "postgres"}@localhost:5432/postgres`;

const client = new Client({ connectionString: databaseUrl });

async function main() {
  await client.connect();

  const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [
    "rednote",
  ]);

  if (role.rowCount === 0) {
    await client.query(`CREATE ROLE rednote WITH LOGIN PASSWORD 'rednote' CREATEDB`);
  } else {
    await client.query(`ALTER ROLE rednote WITH LOGIN PASSWORD 'rednote' CREATEDB`);
  }

  const database = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
    "rednote",
  ]);

  if (database.rowCount === 0) {
    await client.query(`CREATE DATABASE rednote OWNER rednote`);
  }

  await client.end();
}

main().catch(async (error) => {
  console.error(error);
  await client.end();
  process.exit(1);
});

