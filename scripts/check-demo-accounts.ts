import { compare } from "bcryptjs";
import { config } from "dotenv";
import pg from "pg";

const demoPassword = "rednote123";
const demoAccounts = [
  {
    email: "admin@rednote.local",
    handle: "admin",
    role: "SUPER_ADMIN",
  },
  {
    email: "alan@rednote.local",
    handle: "alan",
    role: "USER",
  },
  {
    email: "taro@rednote.local",
    handle: "taro",
    role: "USER",
  },
  {
    email: "nanqiao@rednote.local",
    handle: "nanqiao",
    role: "USER",
  },
] as const;

const requiredUserColumns = ["email", "handle", "password_hash", "role", "status"];

async function checkDemoAccounts(client: pg.Client) {
  const failures = [];
  const existingColumns = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = ANY($1)
    `,
    [requiredUserColumns],
  );
  const existingColumnNames = new Set(existingColumns.rows.map((row) => row.column_name));
  const missingColumns = requiredUserColumns.filter((column) => !existingColumnNames.has(column));

  if (missingColumns.length) {
    failures.push(`users table missing columns: ${missingColumns.join(", ")}`);
  }

  for (const account of demoAccounts) {
    if (missingColumns.length) {
      break;
    }

    const result = await client.query<{
      handle: string;
      password_hash: string;
      role: string;
      status: string;
    }>(
      `
        SELECT handle, password_hash, role, status
        FROM users
        WHERE email = $1
      `,
      [account.email],
    );
    const user = result.rows[0];

    if (!user) {
      failures.push(`${account.email}: missing`);
      continue;
    }

    if (user.handle !== account.handle) {
      failures.push(`${account.email}: expected handle ${account.handle}, got ${user.handle}`);
    }

    if (user.role !== account.role) {
      failures.push(`${account.email}: expected role ${account.role}, got ${user.role}`);
    }

    if (user.status !== "ACTIVE") {
      failures.push(`${account.email}: expected ACTIVE status, got ${user.status}`);
    }

    const passwordOk = await compare(demoPassword, user.password_hash);

    if (!passwordOk) {
      failures.push(`${account.email}: demo password does not match`);
    }
  }

  if (failures.length) {
    console.error("Demo account check failed:");

    for (const failure of failures) {
      console.error(`- ${failure}`);
    }

    if (missingColumns.length) {
      console.error("Run `pnpm prisma:migrate` before checking seed accounts.");
    }

    return false;
  }

  console.log("Demo account check passed.");

  return true;
}

let exitCode = 0;

async function run() {
  config({ path: ".env.local" });
  config({ path: ".env" });

  const client = new pg.Client({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://rednote:rednote@localhost:5432/rednote?schema=public",
  });
  await client.connect();

  try {
    const ok = await checkDemoAccounts(client);

    exitCode = ok ? 0 : 1;
  } catch (error) {
    exitCode = 1;
    console.error(error);
  } finally {
    await client.end();
  }

  process.exit(exitCode);
}

void run();
