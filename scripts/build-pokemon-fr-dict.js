// scripts/build-pokemon-fr-dict.js
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Où écrire le dictionnaire
const outDir = path.resolve(__dirname, "../translations");
const outFile = path.join(outDir, "cards-fr.json");

// Petit helper: attente
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// Normalise la clé EN telle que tu l’utilises (Majuscule 1ère lettre, garde ponctuation)
function normalizeEnglishName(name) {
  if (!name) return name;
  // PokéAPI renvoie souvent la bonne casse déjà; on met juste une majuscule initiale si besoin
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Récupère toutes les espèces (20000 = large)
async function fetchAllSpecies() {
  const url = "https://pokeapi.co/api/v2/pokemon-species?limit=20000";
  const { data } = await axios.get(url, { timeout: 30000 });
  return data.results; // [{name, url}]
}

// Récupère les noms localisés pour 1 espèce
async function fetchSpeciesNames(speciesUrl) {
  const { data } = await axios.get(speciesUrl, { timeout: 30000 });
  // data.names = [{language:{name:'en'}, name:'Bulbasaur'}, {language:{name:'fr'}, name:'Bulbizarre'}, ...]
  const names = data.names || [];
  const findName = (lang) =>
    names.find(n => n.language?.name?.toLowerCase() === lang)?.name;

  const fr = findName("fr");
  const en = findName("en") || normalizeEnglishName(data.name);

  return { en, fr };
}

async function main() {
  console.log("📥 Récupération de la liste des espèces...");
  const species = await fetchAllSpecies();
  console.log(`➡️  ${species.length} espèces trouvées`);

  // Respecte l’API: on fait par petits lots
  const dict = {};
  let done = 0;

  for (const s of species) {
    try {
      const { en, fr } = await fetchSpeciesNames(s.url);
      if (en && fr) {
        dict[normalizeEnglishName(en)] = fr;
      }
    } catch (e) {
      console.warn("⚠️  Échec sur", s.name, "-", e.message);
    }

    done++;
    if (done % 50 === 0) {
      console.log(`… ${done}/${species.length}`);
      await sleep(200); // mini pause pour être gentil avec l’API
    } else {
      await sleep(50);
    }
  }

  // Trie par clé pour un fichier lisible
  const sorted = Object.fromEntries(
    Object.entries(dict).sort((a, b) => a[0].localeCompare(b[0]))
  );

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(sorted, null, 2), "utf-8");

  console.log(`✅ Fichier généré: ${outFile}`);
  console.log(`ℹ️  ${Object.keys(sorted).length} traductions écrites (EN → FR)`);
}

main().catch(err => {
  console.error("❌ Erreur:", err);
  process.exit(1);
});
