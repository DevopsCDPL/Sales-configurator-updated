const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const NewDocument = sequelize.define('NewDocument', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    entity_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        isIn: [['project', 'part', 'inventory', 'procurement']],
      },
    },
    entity_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    document_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    file_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    r2_key: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    version: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'latest',
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'new_documents',
    timestamps: false,
  });

  return NewDocument;
};
