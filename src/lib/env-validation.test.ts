import assert from "node:assert/strict";
import test from "node:test";

import { validateAppEnvironment } from "./env-validation";

const productionEnv = {
  DATABASE_URL: "postgresql://prod:secret@db.example.com:5432/rednote?schema=public",
  NEXTAUTH_SECRET: "prod-secret",
  NEXTAUTH_URL: "https://rednote.example.com",
  OPENAI_API_KEY: "sk-prod",
  REDIS_URL: "redis://cache.example.com:6379",
  S3_ACCESS_KEY_ID: "prod-access-key",
  S3_BUCKET: "rednote-prod",
  S3_ENDPOINT: "https://s3.example.com",
  S3_SECRET_ACCESS_KEY: "prod-secret-key",
};

test("validateAppEnvironment accepts a complete production environment", () => {
  const result = validateAppEnvironment(productionEnv, {
    mode: "production",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.unsafeDefaults, []);
});

test("validateAppEnvironment rejects missing production variables", () => {
  const result = validateAppEnvironment(
    {
      ...productionEnv,
      OPENAI_API_KEY: undefined,
      S3_ENDPOINT: "",
    },
    {
      mode: "production",
    },
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["S3_ENDPOINT", "OPENAI_API_KEY"]);
});

test("validateAppEnvironment rejects production local defaults", () => {
  const result = validateAppEnvironment(
    {
      ...productionEnv,
      S3_BUCKET: "rednote-dev",
      S3_SECRET_ACCESS_KEY: "rednote-secret",
    },
    {
      mode: "production",
    },
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.unsafeDefaults, ["S3_BUCKET", "S3_SECRET_ACCESS_KEY"]);
});

test("validateAppEnvironment warns about development fallbacks without failing", () => {
  const result = validateAppEnvironment({}, { mode: "development" });

  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 4);
});
