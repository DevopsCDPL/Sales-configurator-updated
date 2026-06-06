import api, { getBackendBaseUrl } from '../services/api';

/**
 * Rename a file using the project naming convention:
 * {project_number}_{sanitized_original_basename}_{section_name}.{ext}
 * Example: PRJ-0001_report_quality.pdf
 */
export function buildProjectFileName(projectNumber: string | undefined, file: File, sectionName: string): File {
  const projNum = (projectNumber || 'PRJ').replace(/[^a-zA-Z0-9\-]/g, '_');
  const dotIndex = file.name.lastIndexOf('.');
  const ext = dotIndex !== -1 ? file.name.slice(dotIndex) : '';
  const baseName = (dotIndex !== -1 ? file.name.slice(0, dotIndex) : file.name)
    .replace(/[^a-zA-Z0-9\-]/g, '_')
    .toLowerCase();
  const section = sectionName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return new File([file], `${projNum}_${baseName}_${section}${ext}`, { type: file.type });
}

/**
 * Extract filename from Content-Disposition header, with a fallback.
 */
export function extractFilenameFromResponse(response: any, fallback: string): string {
  try {
    const disposition = response.headers?.['content-disposition'] || '';
    const match = disposition.match(/filename="?([^";\n]+)"?/);
    if (match && match[1]) return match[1].trim();
  } catch {}
  return fallback;
}

/**
 * Views a document by fetching it with auth and opening in new tab
 * Handles authentication properly by using blob approach
 */
export async function viewDocument(documentId: string): Promise<void> {
  try {
    const response = await api.get(`/documents/${documentId}/view`, {
      responseType: 'blob',
    });
    
    // Get filename from Content-Disposition header if available
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'document';
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^";\n]+)"?/i);
      if (match) {
        filename = match[1];
      }
    }
    
    // Create blob URL and open in new tab
    const blob = new Blob([response.data], { type: response.headers['content-type'] });
    const url = URL.createObjectURL(blob);
    
    // Open in new tab
    const newWindow = window.open(url, '_blank');
    
    // Revoke URL after some time to free memory (but not immediately, browser needs time)
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
    
    if (!newWindow) {
      // Popup blocked - fall back to download
      downloadDocument(documentId);
    }
  } catch (error: any) {
    console.error('Error viewing document:', error);
    throw new Error(error.response?.data?.message || 'Failed to view document');
  }
}

/**
 * Downloads a document with proper authentication
 */
export async function downloadDocument(documentId: string, suggestedName?: string): Promise<void> {
  try {
    const response = await api.get(`/documents/${documentId}/download`, {
      responseType: 'blob',
    });
    
    // Get filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    let filename = suggestedName || 'document';
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^";\n]+)"?/i);
      if (match) {
        filename = match[1];
      }
    }
    
    // Create blob and trigger download
    const blob = new Blob([response.data], { type: response.headers['content-type'] });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Revoke URL to free memory
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  } catch (error: any) {
    console.error('Error downloading document:', error);
    throw new Error(error.response?.data?.message || 'Failed to download document');
  }
}

/**
 * Views a file directly by path (for uploaded files)
 * Opens in new tab via authenticated API call
 */
export async function viewFileByPath(filePath: string): Promise<void> {
  try {
    // Get backend base URL (without /api suffix)
    const backendBase = getBackendBaseUrl();
    
    let fullUrl = filePath;
    
    // Handle different path formats
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      // Already a full URL, use as-is
      fullUrl = filePath;
    } else {
      // Normalize the path - ensure it starts with /uploads if it's a relative path
      let normalizedPath = filePath;
      
      // Remove any leading /api/ if present (uploads are served without /api)
      normalizedPath = normalizedPath.replace(/^\/api\//, '/');
      
      // Ensure path starts with /
      if (!normalizedPath.startsWith('/')) {
        normalizedPath = '/' + normalizedPath;
      }
      
      // If path doesn't include /uploads/, add it
      if (!normalizedPath.includes('/uploads/')) {
        normalizedPath = '/uploads' + normalizedPath;
      }
      
      fullUrl = `${backendBase}${normalizedPath}`;
    }
    
    console.log('viewFileByPath: Fetching', fullUrl);
    
    // Fetch with auth
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const response = await fetch(fullUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('viewFileByPath error:', response.status, errorText);
      throw new Error(`Failed to fetch file: ${response.status}`);
    }
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    
    const newWindow = window.open(url, '_blank');
    
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
    
    if (!newWindow) {
      // Popup blocked - create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = filePath.split('/').pop() || 'file';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch (error: any) {
    console.error('Error viewing file:', error);
    throw new Error(error.message || 'Failed to view file');
  }
}

/**
 * Maps document types to friendly download names
 */
export const documentTypeNames: Record<string, string> = {
  'quotation': 'Quotation',
  'rfq': 'RFQ',
  'rfq_quotation': 'RFQ',
  'purchase_order': 'PO_from_Client',
  'vendor_po': 'PO_to_Vendor',
  'vendor_po_quotation': 'Vendor_Quotation',
  'invoice': 'Invoice',
  'proforma_invoice': 'Proforma_Invoice',
  'commercial_invoice': 'Commercial_Invoice',
  'work_order': 'Work_Order',
  'coc': 'COC',
  'certificate_of_conformance': 'COC',
  'packing_list': 'Packing_List',
  'tracking_slip': 'Tracking_Slip',
  'inspection_report': 'Inspection_Report',
  'quality_report': 'Quality_Report',
  'drawing': 'Drawing',
  'estimate': 'Estimate',
};

/**
 * Gets a friendly filename for a document type
 */
export function getFriendlyFilename(documentType: string, originalName?: string, projectRef?: string): string {
  const friendly = documentTypeNames[documentType?.toLowerCase()];
  
  if (friendly) {
    const ext = originalName?.split('.').pop() || 'pdf';
    if (projectRef) {
      return `${friendly}_${projectRef}.${ext}`;
    }
    return `${friendly}.${ext}`;
  }
  
  // For uploaded files, use original name
  return originalName || 'Document';
}
