const SCHEDULE_CATEGORIES = [
  "公演",
  "リリース",
  "イベント",
  "握手会",
  "メディア",
  "誕生日",
  "その他",
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ske48/today") {
      return getTodaySchedule(request, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};

async function getTodaySchedule(request, ctx) {
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method Not Allowed" }, 405);
  }

  const today = getJstDateParts();
  const dateKey = `${today.year}-${pad(today.month)}-${pad(today.day)}`;
  const origin = new URL(request.url).origin;
  const cacheKey = new Request(
    `${origin}/api/ske48/today?date=${encodeURIComponent(dateKey)}`,
    { method: "GET" }
  );

  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const monthlyUrl = `https://ske48.co.jp/schedule/list/${today.year}/${today.month}/`;
  const fallbackUrl = "https://ske48.co.jp/schedule/list/";

  try {
    let result = await fetchAndParse(monthlyUrl, today.day);

    if (!result.ok || !result.items.length) {
      result = await fetchAndParse(fallbackUrl, today.day);
    }

    if (!result.ok) {
      return json(
        {
          ok: false,
          date: dateKey,
          sourceUrl: monthlyUrl,
          error: "公式スケジュールを取得できませんでした。",
        },
        502
      );
    }

    const response = json(
      {
        ok: true,
        date: dateKey,
        year: today.year,
        month: today.month,
        day: today.day,
        weekday: today.weekdayJa,
        items: result.items,
        sourceUrl: result.sourceUrl,
        fetchedAt: new Date().toISOString(),
      },
      200,
      {
        "Cache-Control": "public, max-age=600",
      }
    );

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error("SKE48 schedule fetch failed:", error);
    return json(
      {
        ok: false,
        date: dateKey,
        sourceUrl: monthlyUrl,
        error: "公式スケジュールを取得できませんでした。",
      },
      502
    );
  }
}

async function fetchAndParse(sourceUrl, day) {
  const response = await fetch(sourceUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; MeganemaruBlog/1.0; +https://meganemaru-blog.pwtools.workers.dev/)",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ja,en;q=0.8",
    },
    cf: {
      cacheTtl: 300,
      cacheEverything: true,
    },
  });

  if (!response.ok) {
    return { ok: false, items: [], sourceUrl };
  }

  const html = await response.text();
  const items = parseScheduleForDay(html, day);
  return { ok: true, items, sourceUrl };
}

function parseScheduleForDay(html, day) {
  const cleaned = decodeEntities(
    String(html)
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(?:br|hr)\b[^>]*>/gi, "\n")
      .replace(
        /<\/(?:a|li|p|div|section|article|h[1-6]|dd|dt|tr|td|th)>/gi,
        "\n"
      )
      .replace(/<[^>]+>/g, " ")
  );

  const lines = cleaned
    .split(/\n+/)
    .map((line) => normalizeSpace(line))
    .filter(Boolean);

  const weekdays = "(?:SUN|MON|TUE|WED|THU|FRI|SAT)";
  const targetDay = new RegExp(`^${day}\\s*${weekdays}(?:\\s|$)`, "i");
  const anyDay = new RegExp(
    `^(?:[1-9]|[12]\\d|3[01])\\s*${weekdays}(?:\\s|$)`,
    "i"
  );

  const start = lines.findIndex((line) => targetDay.test(line));
  if (start < 0) return [];

  const dayLines = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (anyDay.test(lines[i])) break;
    dayLines.push(lines[i]);
  }

  const categoryPattern = SCHEDULE_CATEGORIES.map(escapeRegex).join("|");
  const inlineEvent = new RegExp(`^(${categoryPattern})\\s*(.+)$`);

  const items = [];
  for (let i = 0; i < dayLines.length; i += 1) {
    const line = dayLines[i];
    const match = line.match(inlineEvent);

    if (!match) continue;

    const category = match[1];
    let title = normalizeSpace(match[2]);

    if (!title && dayLines[i + 1] && !SCHEDULE_CATEGORIES.includes(dayLines[i + 1])) {
      title = normalizeSpace(dayLines[i + 1]);
      i += 1;
    }

    if (!title) continue;

    items.push({ category, title });
  }

  return dedupe(items);
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.category}\u0000${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getJstDateParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap = {
    Sun: "日",
    Mon: "月",
    Tue: "火",
    Wed: "水",
    Thu: "木",
    Fri: "金",
    Sat: "土",
  };

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekdayJa: weekdayMap[values.weekday] || "",
  };
}

function decodeEntities(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return value
    .replace(/&([a-zA-Z]+);/g, (all, name) => named[name] ?? all)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCodePoint(parseInt(code, 16))
    );
}

function normalizeSpace(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}
