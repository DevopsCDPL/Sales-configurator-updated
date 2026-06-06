const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Client = sequelize.define('Client', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    client_name: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    poc_name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    poc_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    poc_phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    tax_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    payment_terms: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: 'Net 30'
    },
    position: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    cc_list: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false,
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
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    },
    deleted_by: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null
    }
  }, {
    tableName: 'clients',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return Client;
};
