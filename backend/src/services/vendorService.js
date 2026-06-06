const { Vendor, Company, User, VendorMaterial, VendorRFQ, VendorPO, RFQBundle, RFQBundleItem, VendorPurchaseOrder, VendorPOItem, ActivityTimeline, sequelize } = require('../models');
const { Op } = require('sequelize');
const auditLogService = require('./auditLogService');

class VendorService {
  /**
   * Get vendors filtered by role:
   * - main_admin: all vendors
   * - admin: vendors in their company only
   * - sales: vendors in their company only (read-only access)
   */
  async getAllVendors(filters = {}, requestingUser = null) {
    const where = { deleted_at: null };
    
    if (filters.search) {
      where[Op.or] = [
        { vendor_name: { [Op.iLike]: `%${filters.search}%` } },
        { contact_person: { [Op.iLike]: `%${filters.search}%` } },
        { contact_email: { [Op.iLike]: `%${filters.search}%` } }
      ];
    }

    // Tenant isolation: scope by company_id for non-platform_admin
    if (requestingUser) {
      if (requestingUser.role !== 'platform_admin' && requestingUser.company_id) {
        where.company_id = requestingUser.company_id;
      } else if (requestingUser.role !== 'platform_admin' && !requestingUser.company_id) {
        // Non-platform user with no company_id: show records with null company_id only
        where.company_id = null;
      }
      // platform_admin: no company filter, sees all
    }

    const vendors = await Vendor.findAll({
      where,
      include: [
        { model: Company, as: 'company', attributes: ['id', 'name'], required: false },
        { model: User, as: 'creator', attributes: ['id', 'name'], required: false },
        { model: VendorMaterial, as: 'vendorMaterials', required: false }
      ],
      order: [['vendor_name', 'ASC']]
    });

    return vendors;
  }

  async getVendorById(id, requestingUser = null) {
    const vendor = await Vendor.findByPk(id, {
      include: [
        { model: Company, as: 'company', attributes: ['id', 'name'], required: false },
        { model: User, as: 'creator', attributes: ['id', 'name'], required: false },
        { model: VendorMaterial, as: 'vendorMaterials', required: false }
      ]
    });
    if (!vendor) {
      throw new Error('Vendor not found');
    }

    // Enforce company-level access
    if (requestingUser && requestingUser.role !== 'platform_admin') {
      if (requestingUser.company_id && vendor.company_id && vendor.company_id !== requestingUser.company_id) {
        throw new Error('You do not have access to this vendor');
      }
    }

    return vendor;
  }

  async createVendor(vendorData, requestingUser = null) {
    // Access control: user role cannot create vendors
    if (requestingUser && requestingUser.role === 'user') {
      throw new Error('You do not have permission to create vendors');
    }

    // Get vendor name from either field
    const vendorName = vendorData.company_name || vendorData.vendor_name;
    
    if (!vendorName) {
      throw new Error('Vendor name is required');
    }

    // Determine company_id
    let companyId = vendorData.company_id || null;
    if (requestingUser) {
      if (requestingUser.role === 'platform_admin') {
        // platform_admin can assign to any company via request body
        companyId = vendorData.company_id || null;
      } else if (requestingUser.company_id) {
        // All other roles: always scope to their own company
        companyId = requestingUser.company_id;
      }
    }

    const vendor = await Vendor.create({
      vendor_name: vendorName,
      address: vendorData.address,
      contact_person: vendorData.contact_person,
      contact_position: vendorData.position || vendorData.contact_position || null,
      contact_email: vendorData.email || vendorData.contact_email,
      contact_phone: vendorData.phone || vendorData.contact_phone,
      service_categories: vendorData.service_categories || [],
      rating: vendorData.rating || 0,
      tax_id: vendorData.tax_id,
      notes: vendorData.notes,
      cc_list: Array.isArray(vendorData.cc_list) ? vendorData.cc_list : [],
      company_id: companyId,
      created_by: requestingUser ? requestingUser.id : null
    });

    // Save vendor materials if provided
    if (Array.isArray(vendorData.materials) && vendorData.materials.length > 0) {
      const materialRows = vendorData.materials
        .filter(m => m.part_description || m.material_grade || m.dimension)
        .map(m => ({
          vendor_id: vendor.id,
          part_description: m.part_description || '',
          material_grade: m.material_grade || '',
          dimension: m.dimension || '',
        }));
      if (materialRows.length > 0) {
        await VendorMaterial.bulkCreate(materialRows);
      }
    }

    // Audit log
    auditLogService.log({
      action: 'vendor_created',
      entity_type: 'vendor',
      entity_id: vendor.id,
      entity_name: vendorName,
      performed_by: requestingUser?.id,
      performer_name: requestingUser?.name,
      performer_role: requestingUser?.role,
      details: { vendor_name: vendorName },
      company_id: companyId
    });

    try {
      await ActivityTimeline.create({
        company_id: requestingUser?.company_id || vendor.company_id || null,
        user_id: requestingUser?.id || null,
        action: 'vendor_created',
        description: `Vendor "${vendorName}" created`,
        severity: 'info',
        metadata: { vendor_id: vendor.id, vendor_name: vendorName },
      });
    } catch (e) { /* ignore timeline errors */ }

    return vendor;
  }

  async updateVendor(id, updateData, requestingUser = null) {
    const vendor = await Vendor.findByPk(id);
    if (!vendor) {
      throw new Error('Vendor not found');
    }

    // Access control
    if (requestingUser) {
      if (requestingUser.role === 'user') {
        throw new Error('You do not have permission to update vendors');
      }
      if (requestingUser.role === 'admin') {
        if (vendor.company_id && vendor.company_id !== requestingUser.company_id) {
          throw new Error('You can only edit vendors in your own company');
        }
      }
    }

    // Map frontend field names to backend field names
    const updates = {
      vendor_name: updateData.company_name || updateData.vendor_name || vendor.vendor_name,
      address: updateData.address !== undefined ? updateData.address : vendor.address,
      contact_person: updateData.contact_person !== undefined ? updateData.contact_person : vendor.contact_person,
      contact_position: updateData.position || updateData.contact_position || vendor.contact_position,
      contact_email: updateData.email || updateData.contact_email || vendor.contact_email,
      contact_phone: updateData.phone || updateData.contact_phone || vendor.contact_phone,
      service_categories: updateData.service_categories !== undefined ? updateData.service_categories : vendor.service_categories,
      rating: updateData.rating !== undefined ? updateData.rating : vendor.rating,
      tax_id: updateData.tax_id !== undefined ? updateData.tax_id : vendor.tax_id,
      notes: updateData.notes !== undefined ? updateData.notes : vendor.notes,
      cc_list: updateData.cc_list !== undefined ? (Array.isArray(updateData.cc_list) ? updateData.cc_list : []) : vendor.cc_list
    };

    // main_admin can reassign company
    if (requestingUser && requestingUser.role === 'main_admin' && updateData.company_id !== undefined) {
      updates.company_id = updateData.company_id;
    }

    await vendor.update(updates);

    // Update vendor materials if provided
    if (Array.isArray(updateData.materials)) {
      // Remove existing materials and replace with new ones
      await VendorMaterial.destroy({ where: { vendor_id: id } });
      const materialRows = updateData.materials
        .filter(m => m.part_description || m.material_grade || m.dimension)
        .map(m => ({
          vendor_id: id,
          part_description: m.part_description || '',
          material_grade: m.material_grade || '',
          dimension: m.dimension || '',
        }));
      if (materialRows.length > 0) {
        await VendorMaterial.bulkCreate(materialRows);
      }
    }

    return vendor;
  }

  /**
   * Get ALL vendor materials across all vendors (for Estimation dropdown).
   * Returns: [{ id, vendor_id, part_description, material_grade, dimension, vendor: { id, vendor_name } }]
   */
  async getAllVendorMaterials(requestingUser = null) {
    const where = {};

    // Role-based company filtering via vendor
    const vendorWhere = {};
    if (requestingUser) {
      if (requestingUser.role === 'user' || requestingUser.role === 'admin') {
        if (requestingUser.company_id) {
          vendorWhere.company_id = requestingUser.company_id;
        } else {
          return [];
        }
      }
    }

    const materials = await VendorMaterial.findAll({
      where,
      include: [
        {
          model: Vendor,
          as: 'vendor',
          attributes: ['id', 'vendor_name'],
          where: Object.keys(vendorWhere).length > 0 ? vendorWhere : undefined,
          required: true,
        }
      ],
      order: [['part_description', 'ASC']]
    });

    return materials;
  }

  async deleteVendor(id, requestingUser = null) {
    const vendor = await Vendor.findByPk(id);
    if (!vendor) {
      throw new Error('Vendor not found');
    }

    // Access control
    if (requestingUser) {
      if (requestingUser.role === 'user') {
        throw new Error('You do not have permission to delete vendors');
      }
      if (requestingUser.role === 'admin') {
        if (vendor.company_id && vendor.company_id !== requestingUser.company_id) {
          throw new Error('You can only delete vendors in your own company');
        }
      }
    }

    // Soft delete - move to recycle bin
    const deletedBy = requestingUser ? requestingUser.id : null;
    await vendor.update({ deleted_at: new Date(), deleted_by: deletedBy });

    try {
      await ActivityTimeline.create({
        company_id: requestingUser?.company_id || vendor.company_id || null,
        user_id: deletedBy,
        action: 'vendor_deleted',
        description: `Vendor "${vendor.vendor_name}" moved to recycle bin`,
        severity: 'warning',
        metadata: { vendor_id: vendor.id, vendor_name: vendor.vendor_name },
      });
    } catch (e) { /* ignore timeline errors */ }

    return { message: 'Vendor moved to recycle bin' };
  }
}

module.exports = new VendorService();
