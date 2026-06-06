const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProcurementVendorQuote = sequelize.define('ProcurementVendorQuote', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    rfq_id: {
      type: DataTypes.UUID,
      allowNull: false,
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
    material_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'materials',
        key: 'id',
      },
    },
    price_per_unit: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    lead_time: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: 'procurement_vendor_quotes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return ProcurementVendorQuote;
};
