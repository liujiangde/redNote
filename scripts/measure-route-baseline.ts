type BaselineRoute = {
  expect?: (response: Response) => boolean | Promise<boolean>;
  name: string;
  path: string;
  redirect?: RequestRedirect;
};

type RouteSample = {
  latencyMs: number;
  ok: boolean;
  status: number | string;
};

const routes: BaselineRoute[] = [
  {
    name: "home",
    path: "/",
  },
  {
    name: "search",
    path: "/search?q=%E5%92%96%E5%95%A1",
  },
  {
    name: "login",
    path: "/login",
  },
  {
    name: "register",
    path: "/register",
  },
  {
    name: "health",
    path: "/api/health",
  },
  {
    name: "admin auth redirect",
    path: "/admin",
    redirect: "manual",
    expect: expectsLoginRedirect,
  },
  {
    name: "admin audit auth redirect",
    path: "/admin/audit",
    redirect: "manual",
    expect: expectsLoginRedirect,
  },
  {
    name: "admin safety auth redirect",
    path: "/admin/safety",
    redirect: "manual",
    expect: expectsLoginRedirect,
  },
];

async function expectsLoginRedirect(response: Response) {
  const location = response.headers.get("location");

  if (
    response.status >= 300 &&
    response.status < 400 &&
    Boolean(location?.includes("/login"))
  ) {
    return true;
  }

  if (response.status !== 200) {
    return false;
  }

  const body = await response.clone().text();

  return body.includes("__next-page-redirect") && body.includes("/login");
}

function getArg(args: string[], flag: string) {
  const flagIndex = args.indexOf(flag);

  if (flagIndex === -1) {
    return undefined;
  }

  return args[flagIndex + 1];
}

function getPositiveIntegerArg(args: string[], flag: string, fallback: number) {
  const value = Number(getArg(args, flag));

  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  return fallback;
}

function getPercentageArg(args: string[], flag: string, fallback: number) {
  const value = Number(getArg(args, flag));

  if (Number.isFinite(value) && value >= 0 && value <= 100) {
    return value;
  }

  return fallback;
}

function getBaseUrl(args: string[]) {
  const value = getArg(args, "--base-url") ?? process.env.BASELINE_BASE_URL;

  return value?.replace(/\/$/, "") || "http://localhost:3000";
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (!sortedValues.length) {
    return 0;
  }

  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * percentileValue) - 1);

  return sortedValues[index] ?? 0;
}

async function measureRequest(baseUrl: string, route: BaselineRoute): Promise<RouteSample> {
  const startedAt = performance.now();

  try {
    const response = await fetch(new URL(route.path, baseUrl), {
      redirect: route.redirect ?? "follow",
    });
    const latencyMs = performance.now() - startedAt;
    const ok = route.expect ? await route.expect(response) : response.ok;

    return {
      latencyMs,
      ok,
      status: response.status,
    };
  } catch (error) {
    return {
      latencyMs: performance.now() - startedAt,
      ok: false,
      status: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runPool<T>(total: number, concurrency: number, run: () => Promise<T>) {
  const results: T[] = [];
  let started = 0;

  async function worker() {
    while (started < total) {
      started += 1;
      results.push(await run());
    }
  }

  await Promise.all(Array.from({ length: Math.min(total, concurrency) }, worker));

  return results;
}

async function measureRoute(baseUrl: string, route: BaselineRoute, requests: number, concurrency: number) {
  const startedAt = performance.now();
  const samples = await runPool(requests, concurrency, () => measureRequest(baseUrl, route));
  const durationSeconds = (performance.now() - startedAt) / 1000;
  const latencies = samples.map((sample) => sample.latencyMs).sort((a, b) => a - b);
  const failures = samples.filter((sample) => !sample.ok);
  const totalLatency = latencies.reduce((sum, latency) => sum + latency, 0);

  return {
    avgMs: totalLatency / samples.length,
    errorRate: failures.length / samples.length,
    failures,
    maxMs: latencies.at(-1) ?? 0,
    name: route.name,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    p99Ms: percentile(latencies, 0.99),
    requests: samples.length,
    rps: samples.length / durationSeconds,
  };
}

function formatMs(value: number) {
  return `${Math.round(value)}ms`;
}

function getFailureStatuses(failures: RouteSample[]) {
  return Array.from(new Set(failures.map((failure) => String(failure.status))));
}

async function main() {
  const args = process.argv.slice(2);
  const baseUrl = getBaseUrl(args);
  const requests = getPositiveIntegerArg(args, "--requests", 30);
  const concurrency = getPositiveIntegerArg(args, "--concurrency", 3);
  const maxErrorRate = getPercentageArg(args, "--max-error-rate", 0) / 100;
  const asJson = args.includes("--json");
  const results = [];

  if (!asJson) {
    console.log(`Baseline target: ${baseUrl}`);
    console.log(`Requests per route: ${requests}; concurrency: ${concurrency}`);
  }

  for (const route of routes) {
    results.push(await measureRoute(baseUrl, route, requests, concurrency));
  }

  const failedResults = results.filter((result) => result.errorRate > maxErrorRate);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          concurrency,
          failedRoutes: failedResults.map((result) => result.name),
          maxErrorRate,
          requestsPerRoute: requests,
          results: results.map((result) => ({
            avgMs: result.avgMs,
            errorRate: result.errorRate,
            failureStatuses: getFailureStatuses(result.failures),
            maxMs: result.maxMs,
            name: result.name,
            p50Ms: result.p50Ms,
            p95Ms: result.p95Ms,
            p99Ms: result.p99Ms,
            requests: result.requests,
            rps: result.rps,
          })),
          target: baseUrl,
        },
        null,
        2,
      ),
    );

    if (failedResults.length) {
      process.exit(1);
    }

    return;
  }

  console.log("route | requests | rps | avg | p50 | p95 | p99 | max | errors");
  console.log("--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:");

  for (const result of results) {
    console.log(
      [
        result.name,
        result.requests,
        result.rps.toFixed(1),
        formatMs(result.avgMs),
        formatMs(result.p50Ms),
        formatMs(result.p95Ms),
        formatMs(result.p99Ms),
        formatMs(result.maxMs),
        `${(result.errorRate * 100).toFixed(1)}%`,
      ].join(" | "),
    );
  }

  if (failedResults.length) {
    for (const result of failedResults) {
      const statuses = getFailureStatuses(result.failures);

      console.error(`${result.name} exceeded error threshold: ${statuses.join(", ")}`);
    }

    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export {};
