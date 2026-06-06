const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const VendorPO = sequelize.define('VendorPO', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    po_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'projects',
        key: 'id'
      }
    },
    vendor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'vendors',
        key: 'id'
      }
    },
    material_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'materials',
        key: 'id'
      }
    },
    rfq_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'vendor_rfqs',
        key: 'id'
      }
    },
    quantity: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false
    },
    unit: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    unit_price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    },
    total_price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    },
    delivery_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    payment_terms: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('draft', 'sent', 'acknowledged', 'delivered', 'cancelled'),
      defaultValue: 'draft'
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'companies',
        key: 'id'
      }
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'vendor_pos',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return VendorPO;
};
