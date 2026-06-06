const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProcurementRFQVendor = sequelize.define('ProcurementRFQVendor', {
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
    status: {
      type: DataTypes.ENUM('Pending', 'Responded'),
      allowNull: false,
      defaultValue: 'Pending',
    },
  }, {
    tableName: 'procurement_rfq_vendors',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return ProcurementRFQVendor;
};
