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
      return getScheduleForOffset(request, ctx, 0);
    }

    if (url.pathname === "/api/ske48/yesterday") {
      return getYesterdayDigest(request, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};

async function getScheduleForOffset(request, ctx, offsetDays) {
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method Not Allowed" }, 405);
  }

  const target = getJstDateParts(offsetDays);
  const dateKey = formatDateKey(target);
  const origin = new URL(request.url).origin;
  const cacheKey = new Request(
    `${origin}/api/ske48/today?date=${encodeURIComponent(dateKey)}&parser=3`,
    { method: "GET" }
  );

  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const result = await fetchSchedule(target);

    if (!result.ok) {
      return json(
        {
          ok: false,
          date: dateKey,
          sourceUrl: result.sourceUrl,
          error: "公式スケジュールを取得できませんでした。",
          debug: result.debug,
        },
        502
      );
    }

    const payload = {
      ok: true,
      date: dateKey,
      year: target.year,
      month: target.month,
      day: target.day,
      weekday: target.weekdayJa,
      items: result.items,
      sourceUrl: result.sourceUrl,
      fetchedAt: new Date().toISOString(),
      parserVersion: 3,
    };

    if (!result.items.length) payload.debug = result.debug;

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
        error: "公式スケジュールを取得できませんでした。",
        debug: { message: String(error?.message || error) },
      },
      502
    );
  }
}

async function getYesterdayDigest(request, ctx) {
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method Not Allowed" }, 405);
  }

  const target = getJstDateParts(-1);
  const dateKey = formatDateKey(target);
  const dottedDate = `${target.year}.${pad(target.month)}.${pad(target.day)}`;
  const origin = new URL(request.url).origin;

  const cacheKey = new Request(
    `${origin}/api/ske48/yesterday?date=${encodeURIComponent(dateKey)}&digest=1`,
    { method: "GET" }
  );

  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const [scheduleResult, newsResult, blogResult] = await Promise.all([
      fetchSchedule(target),
      fetchOfficialNews(dottedDate),
      fetchMemberBlogs(dottedDate),
    ]);

    const scheduleItems = scheduleResult.ok ? scheduleResult.items : [];
    const newsItems = newsResult.ok ? newsResult.items : [];
    const blogItems = blogResult.ok ? blogResult.items : [];

    const total =
      scheduleItems.length + newsItems.length + blogItems.length;

    const payload = {
      ok: true,
      date: dateKey,
      year: target.year,
      month: target.month,
      day: target.day,
      weekday: target.weekdayJa,
      scheduleItems,
      newsItems,
      blogItems,
      counts: {
        schedule: scheduleItems.length,
        news: newsItems.length,
        blogs: blogItems.length,
        total,
      },
      summary: buildDigestSummary(scheduleItems, newsItems, blogItems),
      sources: {
        schedule: scheduleResult.sourceUrl,
        news: newsResult.sourceUrl,
        blogs: blogResult.sourceUrl,
      },
      fetchedAt: new Date().toISOString(),
    };

    const response = json(payload, 200, {
      "Cache-Control": "public, max-age=900",
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error("SKE48 yesterday digest failed:", error);
    return json(
      {
        ok: false,
        date: dateKey,
        error: "昨日のSKE48を取得できませんでした。",
        debug: { message: String(error?.message || error) },
      },
      502
    );
  }
}

async function fetchSchedule(target) {
  const monthlyUrl = `https://ske48.co.jp/schedule/list/${target.year}/${target.month}/`;
  const fallbackUrl = "https://ske48.co.jp/schedule/list/";

  let result = await fetchAndParseSchedule(monthlyUrl, target.day);

  if (!result.ok || !result.items.length) {
    const fallback = await fetchAndParseSchedule(fallbackUrl, target.day);
    if (fallback.ok && (fallback.items.length || !result.ok)) {
      result = fallback;
    }
  }

  return result;
}

async function fetchAndParseSchedule(sourceUrl, day) {
  const response = await fetchOfficial(sourceUrl);
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    return {
      ok: false,
      items: [],
      sourceUrl,
      debug: { httpStatus: response.status, contentType },
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
      hasTargetDay: hasDayHeader(flatText, day),
      looksLikeChallenge:
        /just a moment|checking your browser|cf-chl|challenge-platform/i.test(html),
    },
  };
}

async function fetchOfficialNews(dottedDate) {
  const sourceUrl = "https://ske48.co.jp/news/29/";
  const response = await fetchOfficial(sourceUrl);

  if (!response.ok) {
    return { ok: false, items: [], sourceUrl };
  }

  const html = await response.text();
  const anchors = parseAnchors(html, sourceUrl);

  const items = anchors
    .map((anchor) => {
      const match = anchor.text.match(
        /^(.+?)\s+(\d{4}\.\d{2}\.\d{2})\s+(?:NEW\s+)?(.+)$/
      );
      if (!match || match[2] !== dottedDate) return null;

      return {
        category: normalizeSpace(match[1]),
        title: normalizeSpace(match[3]),
        url: anchor.url,
      };
    })
    .filter(Boolean);

  return {
    ok: true,
    items: dedupeBy(items, (item) => `${item.category}\u0000${item.title}`),
    sourceUrl,
  };
}

async function fetchMemberBlogs(dottedDate) {
  const sourceUrl = "https://ske48.co.jp/blog/list/3/0/";
  const response = await fetchOfficial(sourceUrl);

  if (!response.ok) {
    return { ok: false, items: [], sourceUrl };
  }

  const html = await response.text();
  const anchors = parseAnchors(html, sourceUrl);

  const items = anchors
    .map((anchor) => {
      const match = anchor.text.match(
        /^(.+?)\s+(\d{4}\.\d{2}\.\d{2})\s+(.+)$/
      );
      if (!match || match[2] !== dottedDate) return null;

      return {
        member: normalizeSpace(match[1]),
        title: normalizeSpace(match[3]),
        url: anchor.url,
      };
    })
    .filter(Boolean);

  return {
    ok: true,
    items: dedupeBy(items, (item) => `${item.member}\u0000${item.title}`),
    sourceUrl,
  };
}

function buildDigestSummary(scheduleItems, newsItems, blogItems) {
  const total =
    scheduleItems.length + newsItems.length + blogItems.length;

  if (!total) {
    return "確認できた範囲では、大きな動きは少なめでした。";
  }

  const parts = [];
  if (scheduleItems.length) {
    parts.push(`公式スケジュール${scheduleItems.length}件`);
  }
  if (newsItems.length) {
    parts.push(`公式ニュース${newsItems.length}件`);
  }
  if (blogItems.length) {
    parts.push(`メンバーブログ${blogItems.length}件`);
  }

  let text = `${parts.join("、")}を確認しました。`;

  const stage = scheduleItems.find((item) => item.category === "公演");
  if (stage) {
    text += ` 劇場では「${stage.title}」が行われました。`;
  } else if (scheduleItems[0]) {
    text += ` スケジュールでは「${scheduleItems[0].title}」などがありました。`;
  }

  if (newsItems[0]) {
    text += ` 公式ニュースでは「${newsItems[0].title}」が掲載されています。`;
  }

  if (blogItems[0]) {
    text += ` メンバーブログでは${blogItems[0].member}さんの「${blogItems[0].title}」などが更新されました。`;
  }

  return text;
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

  return dedupeBy(items, (item) => `${item.category}\u0000${item.title}`);
}

function parseAnchors(html, baseUrl) {
  const anchors = [];
  const pattern =
    /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;

  let match;
  while ((match = pattern.exec(String(html))) !== null) {
    const href = decodeEntities(match[2]);
    const text = htmlToFlatText(match[3]);
    if (!href || !text) continue;

    try {
      anchors.push({
        text,
        url: new URL(href, baseUrl).href,
      });
    } catch {
      // Ignore malformed links.
    }
  }

  return anchors;
}

async function fetchOfficial(url) {
  return fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.8",
    },
  });
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

function getJstDateParts(offsetDays = 0) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const nowParts = formatter.formatToParts(new Date());
  const now = Object.fromEntries(
    nowParts.map((part) => [part.type, part.value])
  );

  const base = Date.UTC(
    Number(now.year),
    Number(now.month) - 1,
    Number(now.day)
  );

  const target = new Date(base + offsetDays * 86400000);
  const weekdayMap = ["日", "月", "火", "水", "木", "金", "土"];

  return {
    year: target.getUTCFullYear(),
    month: target.getUTCMonth() + 1,
    day: target.getUTCDate(),
    weekdayJa: weekdayMap[target.getUTCDay()],
  };
}

function formatDateKey(target) {
  return `${target.year}-${pad(target.month)}-${pad(target.day)}`;
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

  return String(value)
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
