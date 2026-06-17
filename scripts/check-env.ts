import { config } from "dotenv";

import { formatEnvironmentValidation, validateAppEnvironment } from "../src/lib/env-validation";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

function getModeArg(args: string[]) {
  const modeIndex = args.indexOf("--mode");

  if (modeIndex === -1) {
    return undefined;
  }

  return args[modeIndex + 1];
}

const args = process.argv.slice(2);
const result = validateAppEnvironment(process.env, {
  mode: getModeArg(args),
});

if (args.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(formatEnvironmentValidation(result));
}

if (!result.ok) {
  process.exit(1);
}
