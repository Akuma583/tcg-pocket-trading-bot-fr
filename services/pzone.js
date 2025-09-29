// services/pzone.js
const puppeteer = require("puppeteer");

function normalizePZone(data, url) {
  const m = url.match(/players\/(\d+)\/cards/);
  const playerId = m ? m[1] : "unknown";
  const cards = data?.results || data?.cards || [];

  const normCards = cards.map((c) => ({
    card_id: c.id || c.code,
    name: c.name,
    set: typeof c.set === "object" ? c.set?.code : c.set,
    rarity: c.rarity,
    lang: c.language || "FR",
    qty: Number(c.count || c.quantity || 1),
  }));

  return { player_id: String(playerId), cards: normCards };
}

async function fetchPZone(url) {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  let jsonData = null;

  page.on("response", async (response) => {
    const reqUrl = response.url();
    if (reqUrl.includes("/api/cards/search")) {
      try {
        const ct = response.headers()["content-type"] || "";
        if (ct.includes("application/json")) {
          jsonData = await response.json();
        }
      } catch (_) {}
    }
  });

  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

  // petite marge pour que l'appel JSON arrive
  await page.waitForTimeout(3000);

  await browser.close();

  if (!jsonData) {
    throw new Error(
      "Impossible de récupérer les données (API non appelée ou captcha). Relance en non-headless si besoin."
    );
  }
  return normalizePZone(jsonData, url);
}

module.exports = { fetchPZone };
