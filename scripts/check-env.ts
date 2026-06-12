import { config } from "dotenv";

import { formatEnvironmentValidation, validateAppEnvironment } from "../src/lib/env-validation";

config({ path: ".env.local" });
config({ path: ".env" });

function getModeArg(args: string[]) {
  const modeIndex = args.indexOf("--mode");

  if (modeIndex === -1) {
    return undefined;
  }

  return args[modeIndex + 1];
}

const result = validateAppEnvironment(process.env, {
  mode: getModeArg(process.argv.slice(2)),
});

console.log(formatEnvironmentValidation(result));

if (!result.ok) {
  process.exit(1);
}
