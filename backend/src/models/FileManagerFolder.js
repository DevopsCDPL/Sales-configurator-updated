const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const FileManagerFolder = sequelize.define('FileManagerFolder', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    parent_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    folder_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'category',
    },
    module_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'project / procurement / inventory / part_master',
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    part_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    reference_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Generic FK: rfq_id, po_id, stock_id, etc.',
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'companies', key: 'id' },
    },
    path: {
      type: DataTypes.STRING(500),
      allowNull: false,
      // unique constraint replaced by two partial indexes — see pre-sync SQL in index.js
    },
  }, {
    tableName: 'file_manager_folders',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return FileManagerFolder;
};
