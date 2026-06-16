import { config } from "dotenv";
import { createClient } from "redis";

const SEARCH_HOT_KEY = "rednote:search:hot:v1";
const SEARCH_CLICK_KEY = "rednote:search:clicks:v1";
const SEARCH_EXPOSURE_KEY = "rednote:search:exposures:v1";

type ScoredItem = {
  score: number;
  value: string;
};

config({ path: ".env.local" });
config({ path: ".env" });

function getPositiveIntegerArg(args: string[], flag: string, fallback: number) {
  const flagIndex = args.indexOf(flag);
  const rawValue = flagIndex === -1 ? undefined : args[flagIndex + 1];
  const value = rawValue === undefined ? Number.NaN : Number(rawValue);

  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  return fallback;
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
