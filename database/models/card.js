// database/models/card.js
import { Model } from 'sequelize';

export default (sequelize, DataTypes) => {
  class Card extends Model {
    static associate(models) {
      Card.belongsToMany(models.User, {
        through: 'UserCard',
        foreignKey: 'card_id',
        otherKey: 'user_id',
      });
    }
  }

  Card.init(
    {
      id: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
        unique: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      image: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isUrl: true,
        },
      },
      // ⚠️ on enlève la validation isIn pour ne pas devoir l’actualiser à chaque set
      packSet: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      rarity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1,
          max: 5,
        },
      },
    },
    {
      sequelize,
      modelName: 'Card',
    }
  );

  return Card;
};
