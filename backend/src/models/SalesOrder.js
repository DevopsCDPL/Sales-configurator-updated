const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SalesOrder = sequelize.define('SalesOrder', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: 'projects',
        key: 'id'
      }
    },
    sales_order_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      // Per-company unique — composite index in DB (see index.js pre-sync).
    },
    customer_po_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    customer_po_file: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    accepted_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    delivery_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'companies', key: 'id' }
    }
  }, {
    tableName: 'sales_orders',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return SalesOrder;
};
