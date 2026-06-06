'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorSldDocument
 *
 * Stores the Single-Line-Diagram (SLD) payload for a configuration.
 * Per the PH4 PDF spec, "+ Comp", "SLD", "Preview" and "Quotation"
 * become standalone steps in the Configuration sub-flow.
 *
 * The SLD itself is structured JSON (nodes, edges, layout) plus an
 * optional rendered PDF/PNG persisted via the existing `documents`
 * table (R2-backed).
 */
module.exports = (sequelize) => {
  const ConfiguratorSldDocument = sequelize.define(
    'ConfiguratorSldDocument',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      configuration_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'configurator_configurations', key: 'id' },
        onDelete: 'CASCADE',
      },
      project_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'projects', key: 'id' },
        onDelete: 'SET NULL',
      },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      title: { type: DataTypes.STRING(200), allowNull: true },

      // Structured diagram payload (nodes, edges, layout)
      diagram: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: { nodes: [], edges: [], layout: {} },
      },

      // Optional rendered exports (PDF, PNG) stored in the documents table
      rendered_document_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'documents', key: 'id' },
        onDelete: 'SET NULL',
      },

      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      },
      deleted_at: { type: DataTypes.DATE, allowNull: true },
      deleted_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'configurator_sld_documents',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      paranoid: true,
      deletedAt: 'deleted_at',
    }
  );

  return ConfiguratorSldDocument;
};
