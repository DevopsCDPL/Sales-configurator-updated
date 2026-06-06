const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProcurementPO = sequelize.define('ProcurementPO', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    po_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      // Per-company unique — composite index in DB (see index.js pre-sync).
    },
    rfq_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'procurement_rfq',
        key: 'id',
      },
    },
    vendor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'vendors',
        key: 'id',
      },
    },
    status: {
      type: DataTypes.ENUM('Draft', 'Issued', 'Received'),
      allowNull: false,
      defaultValue: 'Draft',
    },
    total_value: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
      defaultValue: 0,
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
    tableName: 'procurement_po',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return ProcurementPO;
};
