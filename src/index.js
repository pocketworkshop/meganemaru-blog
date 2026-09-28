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
    `${origin}/api/ske48/today?date=${encodeURIComponent(dateKey)}&parser=3`,
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
      const fallback = await fetchAndParse(fallbackUrl, today.day);
      if (fallback.ok && (fallback.items.length || !result.ok)) {
        result = fallback;
      }
    }

    if (!result.ok) {
      return json(
        {
          ok: false,
          date: dateKey,
          sourceUrl: monthlyUrl,
          error: "公式スケジュールを取得できませんでした。",
          debug: result.debug,
        },
        502
      );
    }

    const payload = {
      ok: true,
      date: dateKey,
      year: today.year,
      month: today.month,
      day: today.day,
      weekday: today.weekdayJa,
      items: result.items,
      sourceUrl: result.sourceUrl,
      fetchedAt: new Date().toISOString(),
      parserVersion: 3,
    };

    if (!result.items.length) {
      payload.debug = result.debug;
    }

    const response = json(payload, 200, {
      "Cache-Control": "public, max-age=300",
    });

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
        debug: {
          message: String(error?.message || error),
        },
      },
      502
    );
  }
}

async function fetchAndParse(sourceUrl, day) {
  const response = await fetch(sourceUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.8",
    },
  });

  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    return {
      ok: false,
      items: [],
      sourceUrl,
      debug: {
        httpStatus: response.status,
        contentType,
      },
    };
  }

  const html = await response.text();
  const flatText = htmlToFlatText(html);
  const items = parseFlatSchedule(flatText, day);

  return {
    ok: true,
    items,
    sourceUrl,
    debug: {
      httpStatus: response.status,
      contentType,
      htmlLength: html.length,
      textLength: flatText.length,
      hasScheduleHeading: /SCHEDULE/i.test(flatText),
      hasTargetDay: hasDayHeader(flatText, day),
      hasTokaiRadio: flatText.includes("TOKAI RADIO"),
      hasMediaLabel: flatText.includes("メディア"),
      looksLikeChallenge:
        /just a moment|checking your browser|cf-chl|challenge-platform/i.test(html),
    },
  };
}

function parseFlatSchedule(flatText, day) {
  const dayPattern =
    `(?:^|\\s)${Number(day)}\\s*(?:SUN|MON|TUE|WED|THU|FRI|SAT)(?=\\s)`;
  const startMatch = new RegExp(dayPattern, "i").exec(flatText);

  if (!startMatch) return [];

  const start = startMatch.index + startMatch[0].length;
  const after = flatText.slice(start);

  const nextDayMatch = new RegExp(
    "(?:^|\\s)(?:[1-9]|[12]\\d|3[01])\\s*(?:SUN|MON|TUE|WED|THU|FRI|SAT)(?=\\s)",
    "i"
  ).exec(after);

  const segment = normalizeSpace(
    nextDayMatch ? after.slice(0, nextDayMatch.index) : after
  );

  const categoryPattern = SCHEDULE_CATEGORIES.map(escapeRegex).join("|");
  const eventPattern = new RegExp(
    `(?:^|\\s)(${categoryPattern})\\s+(.+?)(?=\\s+(?:${categoryPattern})\\s+|$)`,
    "g"
  );

  const items = [];
  let match;

  while ((match = eventPattern.exec(segment)) !== null) {
    const category = normalizeSpace(match[1]);
    const title = normalizeSpace(match[2]);
    if (category && title) items.push({ category, title });
  }

  return dedupe(items);
}

function htmlToFlatText(html) {
  return normalizeSpace(
    decodeEntities(
      String(html)
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function hasDayHeader(text, day) {
  return new RegExp(
    `(?:^|\\s)${Number(day)}\\s*(?:SUN|MON|TUE|WED|THU|FRI|SAT)(?=\\s)`,
    "i"
  ).test(text);
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
