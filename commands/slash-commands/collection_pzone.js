// commands/collection_pzone.js
module.exports = {
  name: "collection_pzone",
  usage: "!collection_pzone",
  description: "Résumé rapide de ta collection P-Zone",
  run: async (client, message) => {
    const { sequelize } = client;
    const PZoneCollection = sequelize.model("PZoneCollection");

    const row = await PZoneCollection.findByPk(message.author.id);
    if (!row) return message.reply("Pas de collection. Lance `!sync_pzone <url>` d’abord.");

    const payload = row.payloadJson;
    const uniques = payload.cards.length;
    const total = payload.cards.reduce((s, c) => s + (Number(c.qty) || 0), 0);

    await message.reply(`**${payload.player_id}** — ${uniques} uniques / ${total} exemplaires (maj: ${row.updatedAt.toISOString()})`);
  },
};
