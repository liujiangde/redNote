export type AppEnvironmentMode = "development" | "test" | "production";

type EnvironmentInput = Record<string, string | undefined>;

export type EnvironmentValidationResult = {
  mode: AppEnvironmentMode;
  missing: string[];
  ok: boolean;
  unsafeDefaults: string[];
  warnings: string[];
};

const productionRequiredVariables = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "REDIS_URL",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET",
  "OPENAI_API_KEY",
] as const;

const developmentRecommendedVariables = ["DATABASE_URL", "NEXTAUTH_SECRET", "NEXTAUTH_URL", "S3_ENDPOINT"] as const;

const productionUnsafeDefaults: Record<string, string[]> = {
  DATABASE_URL: ["postgresql://rednote:rednote@localhost:5432/rednote?schema=public"],
  REDIS_URL: ["redis://localhost:6379"],
  S3_ACCESS_KEY_ID: ["rednote"],
  S3_BUCKET: ["rednote-dev"],
  S3_SECRET_ACCESS_KEY: ["rednote-secret"],
};

function normalizeMode(mode: string | undefined): AppEnvironmentMode {
  if (mode === "production" || mode === "test") {
    return mode;
  }

  return "development";
}

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}

export function validateAppEnvironment(
  env: EnvironmentInput,
  options: { mode?: string } = {},
): EnvironmentValidationResult {
  const mode = normalizeMode(options.mode ?? env.NODE_ENV);
  const missing =
    mode === "production"
      ? productionRequiredVariables.filter((name) => !hasValue(env[name]))
      : [];
  const unsafeDefaults =
    mode === "production"
      ? Object.entries(productionUnsafeDefaults)
          .filter(([name, defaults]) => defaults.includes(env[name]?.trim() ?? ""))
          .map(([name]) => name)
      : [];
  const warnings =
    mode === "production"
      ? []
      : developmentRecommendedVariables
          .filter((name) => !hasValue(env[name]))
          .map((name) => `${name} is not set; local development may fall back to defaults.`);

  return {
    mode,
    missing,
    ok: missing.length === 0 && unsafeDefaults.length === 0,
    unsafeDefaults,
    warnings,
  };
}

export function formatEnvironmentValidation(result: EnvironmentValidationResult) {
  const lines = [`Environment check (${result.mode})`];

  if (result.ok) {
    lines.push("OK: required environment variables are present.");
  }

  if (result.missing.length) {
    lines.push(`Missing required variables: ${result.missing.join(", ")}`);
  }

  if (result.unsafeDefaults.length) {
    lines.push(`Production variables still using local defaults: ${result.unsafeDefaults.join(", ")}`);
  }

  for (const warning of result.warnings) {
    lines.push(`Warning: ${warning}`);
  }

  return lines.join("\n");
}
