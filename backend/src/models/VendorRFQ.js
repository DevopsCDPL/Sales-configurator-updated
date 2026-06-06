const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const VendorRFQ = sequelize.define('VendorRFQ', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'projects',
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
    vendor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'vendors',
        key: 'id'
      }
    },
    required_quantity: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true
    },
    unit: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    quoted_price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true
    },
    lead_time: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'e.g. "5 days", "2 weeks"'
    },
    quotation_file: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'File path to uploaded quotation document'
    },
    is_selected: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'quoted', 'accepted', 'rejected'),
      defaultValue: 'pending'
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
    tableName: 'vendor_rfqs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return VendorRFQ;
};
