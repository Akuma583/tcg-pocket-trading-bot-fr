// models/PZoneCollection.js
module.exports = (sequelize, DataTypes) => {
  const PZoneCollection = sequelize.define(
    "PZoneCollection",
    {
      userId: { type: DataTypes.STRING, primaryKey: true },
      playerId: { type: DataTypes.STRING, allowNull: false },
      payloadJson: { type: DataTypes.JSON, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      tableName: "pzone_collections",
      timestamps: false,
    }
  );
  return PZoneCollection;
};
