import assert from "node:assert/strict";
import test from "node:test";

import { validateAppEnvironment } from "./env-validation";

const productionEnv = {
  DATABASE_URL: "postgresql://prod-user:prod-pass@db.internal:5432/rednote?schema=public",
  NEXTAUTH_SECRET: "prod-nextauth-secret",
  NEXTAUTH_URL: "https://rednote.example.com",
  OPENAI_API_KEY: "sk-prod",
  REDIS_URL: "redis://redis.internal:6379",
  S3_ACCESS_KEY_ID: "prod-access-key",
  S3_BUCKET: "rednote-prod",
  S3_ENDPOINT: "https://storage.example.com",
  S3_SECRET_ACCESS_KEY: "prod-secret-key",
};

test("validateAppEnvironment requires production variables", () => {
  const result = validateAppEnvironment({}, { mode: "production" });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, [
    "DATABASE_URL",
    "NEXTAUTH_SECRET",
    "NEXTAUTH_URL",
    "REDIS_URL",
    "S3_ENDPOINT",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_BUCKET",
    "OPENAI_API_KEY",
  ]);
});

test("validateAppEnvironment rejects local defaults in production", () => {
  const result = validateAppEnvironment(
    {
      ...productionEnv,
      REDIS_URL: "redis://localhost:6379",
      S3_SECRET_ACCESS_KEY: "rednote-secret",
    },
    { mode: "production" },
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.unsafeDefaults, ["REDIS_URL", "S3_SECRET_ACCESS_KEY"]);
});

test("validateAppEnvironment allows development fallbacks with warnings", () => {
  const result = validateAppEnvironment({}, { mode: "development" });

  assert.equal(result.ok, true);
  assert.equal(result.missing.length, 0);
  assert.equal(result.warnings.length, 4);
});

test("validateAppEnvironment passes complete production configuration", () => {
  const result = validateAppEnvironment(productionEnv, { mode: "production" });

  assert.deepEqual(result, {
    missing: [],
    mode: "production",
    ok: true,
    unsafeDefaults: [],
    warnings: [],
  });
});
