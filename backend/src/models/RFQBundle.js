const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RFQBundle = sequelize.define('RFQBundle', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    rfq_number: {
      type: DataTypes.STRING(50),
      allowNull: false
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
    total_quantity: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      comment: 'Overall quantity (optional)'
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    need_materials_before: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: 'Deadline for materials'
    },
    status: {
      type: DataTypes.ENUM('draft', 'sent', 'quoted', 'accepted', 'rejected'),
      defaultValue: 'draft'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'companies',
        key: 'id'
      }
    },
    instructions: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Array of instruction strings shown on RFQ PDF'
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
    tableName: 'rfq_bundles',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return RFQBundle;
};
