import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Snackbar,
  CircularProgress,
  Divider,
  Paper,
  Chip,
  alpha,
  Select,
  MenuItem,
  FormControl,
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Preview as PreviewIcon,
} from '@mui/icons-material';
import api from 'services/api';

const PRIMARY = '#00c8ff';
const CATEGORY_COLORS: Record<string, string> = {
  project_flow: '#3b82f6',
  material_system: '#10b981',
  linked_references: '#f59e0b',
};

const labelSx = {
  fontSize: '0.6rem',
  fontWeight: 700,
  color: 'var(--text-muted, #9ab0d0)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  mb: '2px',
  lineHeight: 1,
  whiteSpace: 'nowrap',
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 1.5,
    fontSize: '0.78rem',
    color: 'var(--text-primary, #f8fbff)',
    bgcolor: 'var(--bg-input, #080e1a)',
    '& fieldset': { borderColor: 'rgba(0,200,255,0.12)' },
    '&:hover fieldset': { borderColor: 'rgba(0,200,255,0.35)' },
    '&.Mui-focused fieldset': { borderColor: '#00c8ff', borderWidth: '1.5px' },
  },
  '& .MuiOutlinedInput-input': { py: '5px', px: '8px' },
};

const saveBtnSx = {
  bgcolor: '#00c8ff',
  color: '#03121a',
  '&:hover': { bgcolor: '#33d4ff' },
  textTransform: 'none',
  fontWeight: 700,
  borderRadius: 1.5,
  px: 2,
  py: '4px',
  fontSize: '0.75rem',
  boxShadow: 'none',
  minWidth: 72,
  height: 30,
};

interface NumberingConfig {
  prefix: string;
  current_counter: number;
  increment_step: number;
  suffix: string;
  number_length: number;
}

interface DocumentType {
  type: string;
  label: string;
  config: NumberingConfig;
  readonly?: boolean;
}

interface CategoryConfigs {
  project_flow: DocumentType[];
  material_system: DocumentType[];
  linked_references: DocumentType[];
}

// Map doc.type to system_module_config.section_name
const DOC_TYPE_TO_SECTION: Record<string, string> = {
  project_number: 'project_id',
  quotation_number: 'quotation',
  client_po_number: 'po',
  vendor_po_number: 'rfq',
  work_order_number: 'work_order',
  production_traveler_number: 'production_traveler',
  coc_number: 'quality',
  packing_list_number: 'logistics',
  commercial_invoice_number: 'invoice',
  tax_invoice_number: 'invoice',
  proforma_invoice_number: 'invoice',
};

// Sections that support the module dropdown
const MODULE_SECTIONS = new Set(['work_order', 'production_traveler', 'quality']);

const DocumentNumberingPanel: React.FC = () => {
  const [configs, setConfigs] = useState<CategoryConfigs | null>(null);
  const [editingConfigs, setEditingConfigs] = useState<Record<string, NumberingConfig>>({});
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [moduleConfigs, setModuleConfigs] = useState<Record<string, { module_key: string; module_label: string }>>({});

  /** Live preview: computed purely from editing state — no server round-trip */
  const previewData = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [type, cfg] of Object.entries(editingConfigs)) {
      const padded = String(cfg.current_counter).padStart(cfg.number_length || 1, '0');
      out[type] = `${cfg.prefix}${padded}${cfg.suffix}`;
    }
    return out;
  }, [editingConfigs]);

  /** Fetch configs from server, optionally triggering auto-init first */
  const fetchConfigs = useCallback(async (autoInit = false) => {
    try {
      setLoading(true);
      setFetchError(null);

      if (autoInit) {
        try { await api.post('/document-numbering/initialize'); } catch { /* ignore */ }
      }

      const response = await api.get('/document-numbering');
      if (response.data.success) {
        setConfigs(response.data.data);
        const editing: Record<string, NumberingConfig> = {};
        Object.values(response.data.data).forEach((docs: unknown) => {
          (docs as DocumentType[]).forEach((doc) => {
            editing[doc.type] = { ...doc.config };
          });
        });
        setEditingConfigs(editing);
      } else {
        setFetchError(response.data.message || 'Server returned an unsuccessful response');
      }
    } catch (error: any) {
      console.error('Error fetching document numbering configs:', error);
      console.info('API base URL:', api.defaults.baseURL);
      const msg = error.response?.data?.message
        || error.response?.statusText
        || error.message
        || 'Network error — unable to reach server';
      const status = error.response?.status;
      setFetchError(status ? `${status}: ${msg}` : msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch system_module_config from DB
  const fetchSystemConfig = useCallback(async () => {
    try {
      const res = await api.get('/system-config');
      console.log('Fetching Config Data:', res.data);
      if (res.data.success && Array.isArray(res.data.data)) {
        const mc: Record<string, { module_key: string; module_label: string }> = {};
        res.data.data.forEach((row: any) => {
          if (row.section_name) {
            mc[row.section_name] = {
              module_key: row.module_key || 'machining_industry',
              module_label: row.module_label || 'Machining Industry',
            };
          }
        });
        console.log('Loaded Config:', mc);
        setModuleConfigs(mc);
      }
    } catch (err) {
      console.error('Failed to fetch system config:', err);
    }
  }, []);

  // Initial load — fetch document numbering and system config in parallel
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      
      // Fetch both APIs in parallel for faster loading
      const [docRes, sysRes] = await Promise.allSettled([
        api.get('/document-numbering'),
        api.get('/system-config'),
      ]);
      
      // Process document numbering
      if (docRes.status === 'fulfilled' && docRes.value.data?.success) {
        const data = docRes.value.data.data;
        setConfigs(data);
        const editing: Record<string, NumberingConfig> = {};
        Object.values(data).forEach((docs: unknown) => {
          (docs as DocumentType[]).forEach((doc) => {
            editing[doc.type] = { ...doc.config };
          });
        });
        setEditingConfigs(editing);
      } else {
        // Auto-init fallback if fetch failed
        try {
          await api.post('/document-numbering/initialize');
          const retryRes = await api.get('/document-numbering');
          if (retryRes.data?.success) {
            setConfigs(retryRes.data.data);
            const editing: Record<string, NumberingConfig> = {};
            Object.values(retryRes.data.data).forEach((docs: unknown) => {
              (docs as DocumentType[]).forEach((doc) => {
                editing[doc.type] = { ...doc.config };
              });
            });
            setEditingConfigs(editing);
          }
        } catch (e) {
          console.error('Document numbering init failed:', e);
          setFetchError('Failed to load document numbering configuration');
        }
      }
      
      // Process system config
      if (sysRes.status === 'fulfilled' && sysRes.value.data?.success && Array.isArray(sysRes.value.data.data)) {
        const mc: Record<string, { module_key: string; module_label: string }> = {};
        sysRes.value.data.data.forEach((row: any) => {
          if (row.section_name) {
            mc[row.section_name] = {
              module_key: row.module_key || 'machining_industry',
              module_label: row.module_label || 'Machining Industry',
            };
          }
        });
        setModuleConfigs(mc);
      }
      
      setLoading(false);
    };
    init();
  }, []);

  // Update a field in the editing config
  const handleConfigChange = (documentType: string, field: keyof NumberingConfig, value: any) => {
    setEditingConfigs((prev) => {
      let parsed = value;
      if (field !== 'prefix' && field !== 'suffix') {
        parsed = parseInt(value, 10);
        if (isNaN(parsed)) parsed = 0;
      }
      return {
        ...prev,
        [documentType]: {
          ...prev[documentType],
          [field]: parsed,
        },
      };
    });
  };

  // Save a single document type configuration
  const handleSaveConfig = async (documentType: string) => {
    try {
      setSavingType(documentType);
      console.log('SAVE CLICKED - Production Traveler');
      const config = editingConfigs[documentType];

      // Validate
      if (!config.prefix.trim()) {
        setMessage({ type: 'error', text: 'Prefix cannot be empty' });
        return;
      }

      await api.put(`/document-numbering/${documentType}`, {
        prefix: config.prefix,
        current_counter: config.current_counter,
        increment_step: config.increment_step,
        suffix: config.suffix,
        number_length: config.number_length,
      });

      // Also save to system_module_config
      const sectionName = DOC_TYPE_TO_SECTION[documentType];
      if (sectionName) {
        const payload: any = {
          section_name: sectionName,
          numbering_prefix: config.prefix,
          numbering_start: config.current_counter,
          numbering_increment: config.increment_step,
          numbering_suffix: config.suffix,
        };
        if (MODULE_SECTIONS.has(sectionName)) {
          const mc = moduleConfigs[sectionName];
          console.log('Selected Module:', mc?.module_key);
          payload.module_key = mc?.module_key || 'machining_industry';
          payload.module_label = mc?.module_label || 'Machining Industry';
        }
        console.log('Sending API Request:', payload);
        try {
          await api.post('/system-config', payload);
          console.log('Module config saved successfully for section:', sectionName);
        } catch (err) {
          console.error('Failed to save module config:', err);
          setMessage({ type: 'error', text: 'Failed to save module configuration' });
          return;
        }
      }

      setMessage({
        type: 'success',
        text: `Configuration saved successfully!`,
      });

      // Re-fetch so UI stays consistent with DB
      await fetchConfigs();
      await fetchSystemConfig();
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Failed to save configuration',
      });
    } finally {
      setSavingType(null);
    }
  };

  // Preview is now live via useMemo — no manual generation needed

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!configs || fetchError) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Alert severity="error" sx={{ mb: 2, justifyContent: 'center', textAlign: 'left' }}>
          <strong>Failed to load configurations</strong>
          {fetchError && (
            <Typography sx={{ fontSize: '0.8rem', mt: 0.5, color: 'inherit' }}>{fetchError}</Typography>
          )}
        </Alert>
        <Button variant="contained" onClick={() => fetchConfigs(true)} startIcon={<RefreshIcon />} sx={saveBtnSx}>
          Retry
        </Button>
      </Box>
    );
  }

  const renderDocumentTypeCard = (doc: DocumentType) => {
    const config = editingConfigs[doc.type];
    const preview = previewData[doc.type];
    const isReadOnly = doc.readonly || false;
    const hasModule = doc.type === 'work_order_number' || doc.type === 'production_traveler_number';
    const title = doc.type === 'work_order_number' ? 'Work Order' : doc.type === 'production_traveler_number' ? 'Production Traveler' : doc.label;

    return (
      <Paper
        key={doc.type}
        sx={{
          p: '10px 12px',
          border: '1.5px solid',
          borderColor: alpha('#00c8ff', 0.18),
          borderRadius: 2,
          bgcolor: isReadOnly ? 'rgba(0,200,255,0.03)' : 'var(--bg-surface-2, #0f1622)',
          opacity: isReadOnly ? 0.6 : 1,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          transition: 'border-color 0.2s, box-shadow 0.2s',
          '&:hover': {
            borderColor: alpha('#00c8ff', 0.35),
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          },
        }}
      >
        {/* Row 1: Title row + Fields */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: '5px' }}>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary, #f8fbff)' }}>
              {title}
            </Typography>
            {isReadOnly && (
              <Chip label="Read-only" size="small" variant="filled" sx={{ bgcolor: alpha('#999', 0.2), height: 18, fontSize: '0.6rem' }} />
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: '5px', alignItems: 'flex-end' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={labelSx}>Prefix</Typography>
              <TextField fullWidth size="small" value={config.prefix}
                onChange={(e) => handleConfigChange(doc.type, 'prefix', e.target.value)}
                disabled={isReadOnly} sx={inputSx} />
            </Box>
            <Box sx={{ flex: 1.2, minWidth: 0 }}>
              <Typography sx={labelSx}>Start No.</Typography>
              <TextField fullWidth size="small" type="number" value={config.current_counter}
                onChange={(e) => handleConfigChange(doc.type, 'current_counter', e.target.value)}
                disabled={isReadOnly} sx={inputSx} />
            </Box>
            <Box sx={{ flex: 0.7, minWidth: 0 }}>
              <Typography sx={labelSx}>Step</Typography>
              <TextField fullWidth size="small" type="number" value={config.increment_step}
                onChange={(e) => handleConfigChange(doc.type, 'increment_step', e.target.value)}
                disabled={isReadOnly} sx={inputSx} inputProps={{ min: 1 }} />
            </Box>
            <Box sx={{ flex: 0.7, minWidth: 0 }}>
              <Typography sx={labelSx}>Pad</Typography>
              <TextField fullWidth size="small" type="number" value={config.number_length}
                onChange={(e) => handleConfigChange(doc.type, 'number_length', e.target.value)}
                disabled={isReadOnly} sx={inputSx} inputProps={{ min: 1 }} />
            </Box>
            <Box sx={{ flex: 1.2, minWidth: 0 }}>
              <Typography sx={labelSx}>Suffix</Typography>
              <TextField fullWidth size="small" value={config.suffix}
                onChange={(e) => handleConfigChange(doc.type, 'suffix', e.target.value)}
                disabled={isReadOnly} sx={inputSx} placeholder="-2026" />
            </Box>
          </Box>
        </Box>

        {/* Row 2: Preview + Module (optional) + Save */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Box sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.4,
            bgcolor: preview ? 'rgba(0,200,255,0.08)' : 'rgba(0,200,255,0.03)',
            border: '1px solid', borderColor: 'rgba(0,200,255,0.2)',
            borderRadius: 1.5, px: 1, py: '3px',
          }}>
            {preview && <PreviewIcon sx={{ color: PRIMARY, fontSize: 13 }} />}
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: PRIMARY, letterSpacing: 0.3 }}>
              {preview || '\u2014'}
            </Typography>
          </Box>

          {hasModule && (
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <Select
                value={moduleConfigs[DOC_TYPE_TO_SECTION[doc.type] || '']?.module_key || 'machining_industry'}
                onChange={(e) => {
                  const section = DOC_TYPE_TO_SECTION[doc.type];
                  if (section) {
                    const newKey = e.target.value as string;
                    const newLabel = newKey === 'machining_industry' ? 'Machining Industry' : newKey === 'anodizing_industry' ? 'Anodizing Industry' : newKey;
                    setModuleConfigs((prev) => ({
                      ...prev,
                      [section]: { module_key: newKey, module_label: newLabel },
                    }));
                    // Auto-save module selection immediately so it persists
                    api.post('/system-config', {
                      section_name: section,
                      module_key: newKey,
                      module_label: newLabel,
                    }).then(() => {
                      fetchSystemConfig();
                    }).catch((err) => {
                      console.error('Failed to save module selection:', err);
                    });
                  }
                }}
                sx={{
                borderRadius: 1.5, fontSize: '0.72rem', bgcolor: 'var(--bg-input, #080e1a)', color: 'var(--text-primary, #f8fbff)', height: 28,
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,200,255,0.12)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,200,255,0.35)' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#00c8ff', borderWidth: '1.5px' },
                  '& .MuiSelect-select': { py: '3px', px: '8px' },
                }}
              >
                <MenuItem value="machining_industry">Machining Industry</MenuItem>
                <MenuItem value="anodizing_industry">Anodizing Industry</MenuItem>
              </Select>
            </FormControl>
          )}

          <Box sx={{ flex: 1 }} />
          {!isReadOnly && (
            <Button size="small" variant="contained"
              onClick={() => handleSaveConfig(doc.type)}
              disabled={savingType === doc.type}
              startIcon={<SaveIcon sx={{ fontSize: 13 }} />}
              sx={saveBtnSx}
            >
              {savingType === doc.type ? '...' : 'Save'}
            </Button>
          )}
        </Box>
      </Paper>
    );
  };

  const renderCategory = (categoryKey: keyof CategoryConfigs, categoryLabel: string) => {
    const docs = configs[categoryKey];
    if (!docs || docs.length === 0) return null;

    return (
      <Box key={categoryKey} sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
          <Box sx={{ width: 3, height: 14, borderRadius: 1, bgcolor: CATEGORY_COLORS[categoryKey] }} />
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary, #f8fbff)' }}>
            {categoryLabel}
          </Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '12px' }}>
          {docs.map((doc) => renderDocumentTypeCard(doc))}
        </Box>
      </Box>
    );
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
        <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary, #f8fbff)' }}>
          Document Numbering
        </Typography>
        <Typography sx={{ fontSize: '0.7rem', color: 'var(--text-muted, #9ab0d0)' }}>
          Configure automatic number generation
        </Typography>
      </Box>

      <Divider sx={{ mb: 1.5 }} />

      {/* Categories */}
      {renderCategory('project_flow', 'Project Flow')}
      {renderCategory('material_system', 'Material System')}
      {renderCategory('linked_references', 'Linked References (Read-Only)')}

      {/* Messages */}
      <Snackbar
        open={!!message}
        autoHideDuration={5000}
        onClose={() => setMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setMessage(null)}
          severity={message?.type}
          sx={{
            width: '100%',
            borderRadius: 2,
            boxShadow: 2,
          }}
        >
          {message?.text}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DocumentNumberingPanel;
