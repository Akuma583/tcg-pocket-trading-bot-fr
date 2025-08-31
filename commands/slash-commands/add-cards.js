import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { AddRemoveOptionNames, ephemeralErrorReply, Rarities, setupEmbed } from '../command-utilities.js';

const command = {
  data: (() => {
    const builder = new SlashCommandBuilder()
      .setName('add-cards')
      .setDescription('Add one or more cards to the list of cards you want others to trade to you.')
      .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel);

    // Dynamically add string options using AddRemoveOptionNames
    AddRemoveOptionNames.forEach(optionName => {
      builder.addStringOption(option =>
        option
          .setName(optionName)
          .setDescription('Name of the card you want to add to your list of desired cards.')
          .setAutocomplete(true)
          .setRequired(optionName === AddRemoveOptionNames[0]) // Only the first card is required
      );
    });

    return builder;
  })(),

  // --- AUTOCOMPLETE: cherche sur le NOM (FR) dans le cache, affiche "Nom — Set" et renvoie l'ID ---
  async autocomplete(interaction) {
    const norm = s =>
      (s ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    const focusedRaw = interaction.options.getFocused();
    const focused = norm(focusedRaw);

    if (!focused) {
      await interaction.respond([]);
      return;
    }

    const matches = (interaction.client.cardCache ?? [])
      .filter(c => c?.name && norm(c.name).startsWith(focused))
      .slice(0, 25)
      .map(c => {
        let label = `${c.name} — ${c.setLabel ?? c.packSet ?? ''}`;
        if (label.length > 100) label = label.slice(0, 97) + '…'; // limite Discord
        return {
          name: label, // affichage (FR + set)
          value: c.id  // utilisé par execute() -> findByPk
        };
      });

    await interaction.respond(matches);
  },

  async execute(interaction) {
    const db = interaction.client.database;
    let currentUser = await db.getOrAddUser(interaction.user.id, interaction.user.username);
    if (!currentUser) {
      return ephemeralErrorReply(interaction, 'Sorry, something went wrong. Please contact the bot\'s admin to let them know.');
    }

    const cardIds = AddRemoveOptionNames
      .map(optionName => interaction.options.getString(optionName)?.trim())
      .filter(id => id !== null && id !== undefined && id?.trim() !== '');

    if (cardIds.length === 0) {
      return ephemeralErrorReply(interaction, 'You must specify at least one card to add to your desired cards list.');
    }

    const cardIdsWithCount = Array.from(new Set(cardIds)).map(a => ({
      name: a,
      count: cardIds.filter(f => f === a).length
    }));

    const embed = setupEmbed().setTitle(`Cards Added by ${currentUser.nickname}`);

    const cards = db.getModel(db.models.Card);
    let descriptionString = '';

    const addCardPromises = cardIdsWithCount.map(async ({ name: cardId, count: countToAdd }) => {
      const card = await cards.findByPk(cardId);

      if (!card) {
        descriptionString += `- Issue adding ${cardId}, no such card exists`;
        return;
      }

      // Check if the card already exists in the user's desiredCards
      const existingCards = await currentUser.getDesiredCards({
        where: { id: card.id },
      });

      if (existingCards.length > 0) {
        const userCard = existingCards[0];
        userCard.UserCard.card_count += countToAdd;
        await userCard.UserCard.save();
        console.log(`[LOG] Incremented count for card ${card.id} in user ${currentUser.nickname} (${currentUser.id}).`);
      } else {
        // If the card doesn't exist, add it to the desiredCards
        await currentUser.addDesiredCard(card);
        const newUserCard = await currentUser.getDesiredCards({
          where: { id: card.id },
        });

        if (!newUserCard || newUserCard.length === 0) {
          const totalCount = countToAdd > 1 ? 'x' + countToAdd : '';
          descriptionString += `- Issue adding [${card.name}](${card.image}) ${totalCount} ${Rarities[card.rarity - 1]} from ${card.packSet}, internal error\n`;
          console.error(`[ERROR] Something went wrong - ${card.id} not added to ${currentUser.nickname} (${currentUser.id}) despite being in desired cards list.`);
          return;
        }

        newUserCard[0].UserCard.card_count += countToAdd - 1; // New usercards are initiated with count 1
        await newUserCard[0].UserCard.save();
        console.log(`[LOG] Successfully added card ${card.id} to user ${currentUser.nickname} (${currentUser.id}).`);
      }

      const totalCount = countToAdd > 1 ? 'x' + countToAdd : '';
      descriptionString += `- Added [${card.name}](${card.image}) ${totalCount} ${Rarities[card.rarity - 1]} from ${card.packSet}\n`;
    });

    // Wait for all card additions to complete
    await Promise.all(addCardPromises);

    await currentUser.save();
    embed.setDescription(descriptionString);
    return interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  },

  cooldown: 1,
};

export default command;
