type SmokeRoute = {
  expect: (response: Response) => boolean;
  method?: "GET" | "HEAD";
  name: string;
  path: string;
  redirect?: RequestRedirect;
};

const routes: SmokeRoute[] = [
  {
    name: "home",
    path: "/",
    expect: (response) => response.ok,
  },
  {
    name: "search",
    path: "/search?q=%E5%92%96%E5%95%A1",
    expect: (response) => response.ok,
  },
  {
    name: "login",
    path: "/login",
    expect: (response) => response.ok,
  },
  {
    name: "register",
    path: "/register",
    expect: (response) => response.ok,
  },
  {
    name: "health",
    path: "/api/health",
    expect: (response) => response.ok,
  },
  {
    name: "admin auth redirect",
    path: "/admin",
    redirect: "manual",
    expect: (response) =>
      response.status >= 300 &&
      response.status < 400 &&
      Boolean(response.headers.get("location")?.includes("/login")),
  },
];

function getBaseUrl(args: string[]) {
  const flagIndex = args.indexOf("--base-url");
  const value = flagIndex === -1 ? process.env.SMOKE_BASE_URL : args[flagIndex + 1];

  return value?.replace(/\/$/, "") || "http://localhost:3000";
}

async function checkRoute(baseUrl: string, route: SmokeRoute) {
  const startedAt = Date.now();
  const response = await fetch(new URL(route.path, baseUrl), {
    method: route.method ?? "GET",
    redirect: route.redirect ?? "follow",
  });
  const latencyMs = Date.now() - startedAt;
  const ok = route.expect(response);

  return {
    latencyMs,
    location: response.headers.get("location"),
    name: route.name,
    ok,
    status: response.status,
  };
}

async function main() {
  const baseUrl = getBaseUrl(process.argv.slice(2));
  const results = [];

  for (const route of routes) {
    try {
      results.push(await checkRoute(baseUrl, route));
    } catch (error) {
      results.push({
        latencyMs: 0,
        location: null,
        name: route.name,
        ok: false,
        status: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const result of results) {
    const status = result.ok ? "ok" : "fail";
    const location = result.location ? ` -> ${result.location}` : "";

    console.log(`${status} ${result.name}: ${result.status}${location} (${result.latencyMs}ms)`);
  }

  if (results.some((result) => !result.ok)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export {};
