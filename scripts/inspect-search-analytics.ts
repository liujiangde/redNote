import { config } from "dotenv";
import { createClient } from "redis";

const SEARCH_HOT_KEY = "rednote:search:hot:v1";
const SEARCH_CLICK_KEY = "rednote:search:clicks:v1";
const SEARCH_EXPOSURE_KEY = "rednote:search:exposures:v1";

type ScoredItem = {
  score: number;
  value: string;
};

type ThresholdCheck = {
  actual: number;
  label: string;
  minimum: number;
  passed: boolean;
};

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

function getPositiveIntegerArg(args: string[], flag: string, fallback: number) {
  const flagIndex = args.indexOf(flag);
  const rawValue = flagIndex === -1 ? undefined : args[flagIndex + 1];
  const value = rawValue === undefined ? Number.NaN : Number(rawValue);

  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  return fallback;
}

function getOptionalNonNegativeNumberArg(args: string[], flag: string) {
  const flagIndex = args.indexOf(flag);
  const rawValue = flagIndex === -1 ? undefined : args[flagIndex + 1];
  const value = rawValue === undefined ? Number.NaN : Number(rawValue);

  if (Number.isFinite(value) && value >= 0) {
    return value;
  }

  return undefined;
}

function formatInteger(value: number) {
  return value.toLocaleString("zh-CN");
}

function formatPercentage(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return "0%";
  }

  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function sumScores(items: ScoredItem[]) {
  return items.reduce((total, item) => total + item.score, 0);
}

function toScoreMap(items: ScoredItem[]) {
  return new Map(items.map((item) => [item.value, item.score]));
}

function buildThresholdChecks(args: string[], totals: { clicks: number; exposures: number; searches: number }) {
  const configuredChecks = [
    {
      actual: totals.searches,
      flag: "--min-searches",
      label: "searches",
      minimum: getOptionalNonNegativeNumberArg(args, "--min-searches"),
    },
    {
      actual: totals.exposures,
      flag: "--min-exposures",
      label: "exposures",
      minimum: getOptionalNonNegativeNumberArg(args, "--min-exposures"),
    },
    {
      actual: totals.clicks,
      flag: "--min-clicks",
      label: "clicks",
      minimum: getOptionalNonNegativeNumberArg(args, "--min-clicks"),
    },
  ];

  return configuredChecks
    .filter((check): check is Omit<typeof check, "minimum"> & { minimum: number } => {
      if (check.minimum !== undefined) {
        return true;
      }

      if (args.includes(check.flag)) {
        throw new Error(`${check.flag} requires a non-negative number.`);
      }

      return false;
    })
    .map<ThresholdCheck>((check) => ({
      actual: check.actual,
      label: check.label,
      minimum: check.minimum,
      passed: check.actual >= check.minimum,
    }));
}

async function run() {
  const args = process.argv.slice(2);
  const top = getPositiveIntegerArg(args, "--top", 8);
  const asJson = args.includes("--json");
  const client = createClient({
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
  });

  client.on("error", () => {
    // connect/read errors are handled by the surrounding try/catch.
  });

  try {
    await client.connect();

    const [searchItems, clickItems, exposureItems] = await Promise.all([
      client.zRangeWithScores(SEARCH_HOT_KEY, 0, -1),
      client.zRangeWithScores(SEARCH_CLICK_KEY, 0, -1),
      client.zRangeWithScores(SEARCH_EXPOSURE_KEY, 0, -1),
    ]);
    const clickScores = toScoreMap(clickItems);
    const exposureScores = toScoreMap(exposureItems);
    const searchCount = sumScores(searchItems);
    const clickCount = sumScores(clickItems);
    const exposureCount = sumScores(exposureItems);
    const totals = {
      clicks: clickCount,
      exposures: exposureCount,
      searches: searchCount,
    };
    const checks = buildThresholdChecks(args, totals);
    const failedChecks = checks.filter((check) => !check.passed);
    const rows = searchItems
      .sort((left, right) => right.score - left.score)
      .slice(0, top)
      .map((item) => {
        const exposures = exposureScores.get(item.value) ?? 0;
        const clicks = clickScores.get(item.value) ?? 0;

        return {
          clicks,
          ctr: formatPercentage(clicks, exposures),
          exposures,
          query: item.value,
          searches: item.score,
        };
      });

    if (asJson) {
      console.log(
        JSON.stringify(
          {
            queries: rows,
            checks,
            totals: {
              clicks: clickCount,
              ctr: formatPercentage(clickCount, exposureCount),
              exposures: exposureCount,
              searches: searchCount,
            },
          },
          null,
          2,
        ),
      );

      if (failedChecks.length > 0) {
        process.exitCode = 1;
      }

      return;
    }

    console.log("Search analytics");
    console.log(`searches: ${formatInteger(searchCount)}`);
    console.log(`exposures: ${formatInteger(exposureCount)}`);
    console.log(`clicks: ${formatInteger(clickCount)}`);
    console.log(`result ctr: ${formatPercentage(clickCount, exposureCount)}`);
    console.log("");
    console.log("query | searches | exposures | clicks | ctr");
    console.log("--- | ---: | ---: | ---: | ---:");

    for (const row of rows) {
      console.log(
        [
          row.query.replace(/\|/g, "\\|"),
          formatInteger(row.searches),
          formatInteger(row.exposures),
          formatInteger(row.clicks),
          row.ctr,
        ].join(" | "),
      );
    }

    if (checks.length > 0) {
      console.log("");
      console.log("threshold checks");

      for (const check of checks) {
        const status = check.passed ? "pass" : "fail";
        console.log(
          `${status}: ${check.label} ${formatInteger(check.actual)} >= ${formatInteger(check.minimum)}`,
        );
      }
    }

    if (failedChecks.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("Failed to inspect search analytics.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    if (client.isOpen) {
      await client.disconnect();
    }
  }
}

void run();
