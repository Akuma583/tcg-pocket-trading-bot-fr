// commands/sync_pzone.js
const { fetchPZone } = require("../services/pzone");

module.exports = {
  name: "sync_pzone",
  usage: "!sync_pzone <url_pokemon_zone_cards>",
  description: "Synchronise ta collection depuis Pokémon Zone",
  run: async (client, message, args) => {
    const url = args[0];
    if (!url || !url.includes("/players/") || !url.includes("/cards")) {
      return message.reply("❌ Donne l’URL Pokémon Zone des cartes. Ex: `!sync_pzone https://www.pokemon-zone.com/players/123/cards/`");
    }

    const { sequelize } = client; // ou où tu exposes ton instance Sequelize
    const PZoneCollection = sequelize.model("PZoneCollection");

    await message.reply("⏳ Récupération en cours…");

    try {
      const clean = await fetchPZone(url);

      await PZoneCollection.upsert({
        userId: message.author.id,
        playerId: clean.player_id,
        payloadJson: clean,
        updatedAt: new Date(),
      });

      const uniques = clean.cards.length;
      const total = clean.cards.reduce((s, c) => s + (Number(c.qty) || 0), 0);

      await message.reply(`✅ Import OK pour **${clean.player_id}** — ${uniques} uniques / ${total} exemplaires.`);
    } catch (e) {
      await message.reply(`❌ ${e.message}`);
    }
  },
};
