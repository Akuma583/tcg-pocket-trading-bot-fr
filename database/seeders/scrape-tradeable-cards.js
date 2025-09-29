// database/seeders/scrape-tradeable-cards.js
import axios from 'axios';
import cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import db from '../models/index.js';
import card from '../models/card.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------
// Dicos FR (cartes + sets) avec logs
// -----------------------------
const cardsDictPath = path.resolve(__dirname, '../../translations/cards-fr.json');
const setsDictPath  = path.resolve(__dirname, '../../translations/sets-fr.json');

function loadJsonSafe(p, label) {
  if (!fs.existsSync(p)) {
    console.warn(`[TRAD] Fichier ${label} introuvable → fallback EN`);
    return {};
  }
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const obj = JSON.parse(raw);
    console.log(`[TRAD] ${label} chargé (${Object.keys(obj).length} entrées)`);
    return obj;
  } catch (e) {
    console.error(`[TRAD] Erreur JSON ${label}:`, e.message, '→ fallback EN');
    return {};
  }
}

const cardsDict = loadJsonSafe(cardsDictPath, 'cards-fr.json');
const setsDict  = loadJsonSafe(setsDictPath,  'sets-fr.json');

const missingCards = new Set();
const missingSets  = new Set();

// -----------------------------
// Traduction du nom de carte (gère suffixe "ex")
// -----------------------------
function translateCard(nameEN) {
  if (!nameEN) return nameEN;
  let base = nameEN.trim();
  let suffix = '';

  // " ex" à la fin (insensible à la casse)
  const m = base.match(/\s+ex$/i);
  if (m) {
    suffix = ' ex';
    base = base.slice(0, -m[0].length).trim();
  }

  const frBase = cardsDict[base];
  if (!frBase) missingCards.add(base);
  return (frBase ?? base) + suffix; // fallback EN si absent
}

// -----------------------------
// Traduction du set (EN -> FR) avec fallback EN
// -----------------------------
function translateSet(setEN) {
  if (!setEN) return setEN;
  const fr = setsDict[setEN];
  if (!fr) missingSets.add(setEN);
  return fr ?? setEN;
}

function absolutizeImage(src) {
  if (!src) return null;
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  return `https://pocket.limitlesstcg.com${src}`;
}

// -----------------------------
// Scrape d'une page Limitless (URL déjà construite)
// -----------------------------
async function scrapeSite(url) {
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (TCG-Pocket-Discord-Bot)' }
  });
  const $ = cheerio.load(data);

  const seen = new Set();
  const results = [];

  $('div.card-page-main').each((i, elem) => {
    const $elem = $(elem);

    const imgSrc = absolutizeImage($elem.find('img.card').attr('src')?.trim() ?? null);
    const cardNameEN = $elem.find('span.card-text-name').text().trim();

    // "NomDuSet (A? 000/000)" → on garde juste le nom du set EN
    const detailsText = $elem.find('div.prints-current-details span:first-of-type').text().trim();
    const packSetNameEN = detailsText.split('(')[0].trim();

    // Rareté (◊). 0 → 5
    let rarity = $elem.find('div.prints-current-details span:nth-of-type(2)')
      .text()
      .split('◊').length - 1;
    rarity = (rarity === 0) ? 5 : rarity;

    const cardNameFR     = translateCard(cardNameEN);
    const packSetLabelFR = translateSet(packSetNameEN);

    // id stable basé sur EN (comme à l’origine) pour ne pas casser les FK
    const id = `${cardNameEN} ${packSetNameEN} ${rarity}`;
    if (seen.has(id)) return;
    seen.add(id);

    results.push({
      id,
      cardName: cardNameFR,     // FR pour l’affichage
      packSet: packSetLabelFR,  // set FR si dispo, sinon EN (fallback)
      rarity,
      imgSrc,
    });
  });

  return results;
}

// -----------------------------
// Scrape multi-sets (plus fiable que la page globale)
// -----------------------------
// NOTE: adapte/complète les codes en fonction de Limitless.
// A1/A1a = base + mini-set ; A2/A2a/A2b ; A3/A3a/A3b ; etc.
const SET_CODES = [
  'A1', 'A1a',
  'A2', 'A2a', 'A2b',
  'A3', 'A3a', 'A3b',
  // Ajoute ici les séries suivantes quand elles sortent :
  'A4', 'A4a', 'A4b'
];

function buildUrlForSet(setCode) {
  // %21 = !, donc !set:A1 filtre précisément le set
  return `https://pocket.limitlesstcg.com/cards/?q=%21set%3A${encodeURIComponent(setCode)}+display%3Afull+sort%3Aname&show=all`;
}

async function scrapeOneSet(setCode) {
  const url = buildUrlForSet(setCode);
  const rows = await scrapeSite(url);
  console.log(`[DBG] ${setCode} → ${rows.length} cartes`);
  return rows;
}

// -----------------------------
// Seconde passe optionnelle: recherche par noms
// -----------------------------
const EXTRA_QUERY_NAMES = [
  // Ajoute ici des noms qui manqueraient malgré le scrape des sets
  // 'Suicune', 'Scizor', 'Lugia', 'Ho-Oh'
];

async function scrapeByNameList(names = []) {
  const results = [];
  const seen = new Set();

  for (const rawName of names) {
    const q = encodeURIComponent(`name:${rawName}`);
    const url = `https://pocket.limitlesstcg.com/cards/?q=${q}+display%3Afull+sort%3Aname&show=all`;
    try {
      const rows = await scrapeSite(url);
      for (const r of rows) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        results.push(r);
      }
      console.log(`[DBG] name:${rawName} → ${rows.length} cartes`);
      // petite pause pour rester sympa
      await new Promise(res => setTimeout(res, 250));
    } catch (e) {
      console.warn(`[DBG] Échec scrapeByName "${rawName}": ${e.message}`);
    }
  }
  console.log(`[DBG] scrapeByName total: ${results.length} cartes.`);
  return results;
}

// -----------------------------
// Mise à jour de la DB (safe pour les FK UserCards)
// -----------------------------
async function updateCards(scrapedResults) {
  const Cards = card(db.sequelize, db.Sequelize.DataTypes);
  const sequelize = db.sequelize;

  // 1) Upsert de toutes les cartes scrappées
  for (const r of scrapedResults) {
    await Cards.upsert({
      id: r.id,
      name: r.cardName,
      image: r.imgSrc,
      packSet: r.packSet,
      rarity: r.rarity,
    });
  }

  // 2) Nettoyage doux : supprimer les cartes devenues obsolètes
  //    UNIQUEMENT si elles ne sont référencées par aucun UserCards
  const idsToKeep = scrapedResults.map(r => r.id);
  await sequelize.query(
    `
    DELETE FROM "Cards" c
    WHERE c.id NOT IN (:ids)
      AND NOT EXISTS (
        SELECT 1 FROM "UserCards" uc WHERE uc.card_id = c.id
      )
    `,
    { replacements: { ids: idsToKeep } }
  );

  console.log(`[LOG] Upsert terminé : ${scrapedResults.length} cartes traitées.`);

  // 3) Logs des noms/sets manquants
  const missingDir = path.resolve(__dirname, '../../translations/_missing');
  if (!fs.existsSync(missingDir)) fs.mkdirSync(missingDir, { recursive: true });

  if (missingCards.size) {
    fs.writeFileSync(
      path.join(missingDir, 'missing-cards.txt'),
      Array.from(missingCards).sort().join('\n'),
      'utf-8'
    );
    console.log(`ℹ️  Cartes sans traduction FR: ${missingCards.size} → translations/_missing/missing-cards.txt`);
  }
  if (missingSets.size) {
    fs.writeFileSync(
      path.join(missingDir, 'missing-sets.txt'),
      Array.from(missingSets).sort().join('\n'),
      'utf-8'
    );
    console.log(`ℹ️  Sets sans traduction FR: ${missingSets.size} → translations/_missing/missing-sets.txt`);
  }
}

// -----------------------------
// Exécution (multi-sets + extras noms)
// -----------------------------
console.log('[LOG] Successfully initialized models for environment:', process.env.NODE_ENV ?? 'development');

(async () => {
  try {
    // 1) Scrape set par set
    const allBySet = [];
    for (const code of SET_CODES) {
      const rows = await scrapeOneSet(code);
      allBySet.push(...rows);
      // petite pause entre les sets
      await new Promise(r => setTimeout(r, 250));
    }

    // 2) Seconde passe optionnelle par noms (si tu en as listé)
    const extras = await scrapeByNameList(EXTRA_QUERY_NAMES);

    // 3) Merge dédoublonné
    const byId = new Map();
    for (const r of [...allBySet, ...extras]) byId.set(r.id, r);
    const merged = Array.from(byId.values());

    console.log(`[LOG] Total fusionné (tous sets + extras) : ${merged.length} cartes.`);

    // 4) Mise à jour DB
    await updateCards(merged);

    console.log('✅ Import FR (noms & sets) terminé (multi-sets).');
  } catch (err) {
    console.error('❌ Erreur scrape:', err.message);
  }
})();
