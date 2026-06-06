const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProcurementRFQ = sequelize.define('ProcurementRFQ', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    rfq_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      // Per-company unique — composite index in DB (see index.js pre-sync).
    },
    status: {
      type: DataTypes.ENUM('Draft', 'Sent', 'Quoted', 'Closed'),
      allowNull: false,
      defaultValue: 'Draft',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'companies',
        key: 'id',
      },
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
  }, {
    tableName: 'procurement_rfq',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return ProcurementRFQ;
};
