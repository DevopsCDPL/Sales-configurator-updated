import React, { useState, useEffect } from 'react';
import {
  Box, Typography, TextField, Button, Alert, Snackbar,
  List, ListItem, ListItemButton, ListItemText, Divider,
  Select, MenuItem,
  CircularProgress,
  Chip
} from '@mui/material';
import { Save as SaveIcon } from '@mui/icons-material';
import api from '../services/api';

const PRIMARY = '#00c8ff';

// Document categories mapped to the specific fields they contain
const DOCUMENTS = {
  quotation: {
    label: 'Quotation',
    sections: [
      { id: 'quotationCommercialNotes', label: 'Project schedule & Commercial Notes' },
      { id: 'quotationTerms', label: 'Terms & Conditions' }
    ]
  },
  workOrder: {
    label: 'Work Order',
    sections: [
      { id: 'workOrderQualityReqs', label: 'Conditions & Quality Requirements' },
      { id: 'workOrderPreparedBy', label: 'Work Order Prepared By' },
      { id: 'workOrderApprovedBy', label: 'Work Order Approved By' },
    ]
  },
  productionTraveler: {
    label: 'Production Traveler',
    sections: [
      { id: 'productionOperator', label: 'Operator/ Vendor' },
      { id: 'productionInspector', label: 'Inspector' }
    ]
  },
  qualityInspection: {
    label: 'Quality Inspection',
    sections: [
      { id: 'qualityNotes', label: 'Notes / Comments' }
    ]
  },
  logistics: {
    label: 'Logistics',
    sections: [
      { id: 'logisticsInstructions', label: 'Instructions & Requirements' }
    ]
  },
  commercialInvoice: {
    label: 'Commercial Invoice',
    sections: [
      { id: 'invoicePaymentTerms', label: 'Payment Terms' },
      { id: 'invoiceNotes', label: 'Notes' },
      { id: 'invoiceTerms', label: 'Terms & Conditions' }
    ]
  },
  vendorRfq: {
    label: 'Vendor RFQ',
    sections: [
      { id: 'rfqInstructions', label: 'Instructions' }
    ]
  },
  vendorPo: {
    label: 'Vendor PO',
    sections: [
      { id: 'poNotes', label: 'Notes' },
      { id: 'poTerms', label: 'Terms & Conditions' }
    ]
  }
};

type DocumentKey = keyof typeof DOCUMENTS;

export default function DefaultTextConfigPanel() {
  const [activeDoc, setActiveDoc] = useState<DocumentKey>('quotation');
  const [activeSection, setActiveSection] = useState<string>('quotationCommercialNotes');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // When changing active doc, reset active section to the first section of that doc
    const sections = DOCUMENTS[activeDoc].sections;
    if (!sections.find(s => s.id === activeSection)) {
      setActiveSection(sections[0].id);
    }
  }, [activeDoc]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get('/settings/system');
        setSettings(res.data?.data.settings || res.data?.data || {});
      } catch (err: any) {
        console.error('Error fetching system settings:', err);
        setError('Failed to load system settings.');
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      await api.put('/settings/system', settings);
      setSuccess(true);
    } catch (err: any) {
      console.error('Error saving system settings:', err);
      setError(err?.response?.data?.message || 'Failed to save system settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings(prev => ({ ...prev, [activeSection]: e.target.value }));
  };

  return (
    <Box sx={{ display: 'flex', gap: 3, height: '100%', minHeight: '600px' }}>
      {/* Left Sidebar — Document list */}
      <Box
        sx={{
          width: 280,
          flexShrink: 0,
          bgcolor: 'var(--bg-surface-2, #0f1622)',
          borderRadius: 2,
          border: '1px solid rgba(0,200,255,0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box
          sx={{
            p: 2,
            bgcolor: 'var(--bg-surface, #0b1018)',
            borderBottom: '1px solid rgba(0,200,255,0.08)',
          }}
        >
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary, #f8fbff)' }}>
            Select Document
          </Typography>
        </Box>

        <List sx={{ p: 0, flex: 1, overflow: 'auto' }}>
          {(Object.keys(DOCUMENTS) as DocumentKey[]).map((key) => {
            const doc = DOCUMENTS[key];
            const isActive = activeDoc === key;
            return (
              <ListItemButton
                key={key}
                selected={isActive}
                onClick={() => { setActiveDoc(key); setActiveSection(doc.sections[0]?.id ?? ''); }}
                sx={{
                  px: 2,
                  py: 1,
                  borderLeft: `3px solid ${isActive ? '#00c8ff' : 'transparent'}`,
                  bgcolor: isActive ? 'rgba(0,200,255,0.08)' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(0,200,255,0.05)' },
                  '&.Mui-selected': { bgcolor: 'rgba(0,200,255,0.08)' },
                }}
              >
                <ListItemText
                  primary={doc.label}
                  primaryTypographyProps={{
                    fontSize: '0.85rem',
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#00c8ff' : 'var(--text-secondary, #d9e4fb)',
                  }}
                />
              </ListItemButton>
            );
          })}
        </List>
      </Box>

      {/* Right panel */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
        {/* Section tabs */}
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
            p: 1.5,
            bgcolor: 'var(--bg-surface, #0b1018)',
            borderRadius: 2,
            border: '1px solid rgba(0,200,255,0.08)',
          }}
        >
          {DOCUMENTS[activeDoc].sections.map((sec) => {
            const isActive = activeSection === sec.id;
            return (
              <Chip
                key={sec.id}
                label={sec.label}
                onClick={() => setActiveSection(sec.id)}
                size="small"
                sx={{
                  cursor: 'pointer',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.78rem',
                  border: `1px solid ${isActive ? '#00c8ff' : 'rgba(0,200,255,0.15)'}`,
                  bgcolor: isActive ? 'rgba(0,200,255,0.15)' : 'rgba(255,255,255,0.03)',
                  color: isActive ? '#00c8ff' : 'var(--text-secondary, #d9e4fb)',
                  borderRadius: '8px',
                  '&:hover': { bgcolor: 'rgba(0,200,255,0.1)' },
                }}
              />
            );
          })}
        </Box>

        {/* Text editor */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'var(--bg-surface-2, #0f1622)',
            borderRadius: 2,
            border: '1px solid rgba(0,200,255,0.08)',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              px: 2,
              py: 1.25,
              bgcolor: 'var(--bg-surface, #0b1018)',
              borderBottom: '1px solid rgba(0,200,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #f8fbff)' }}>
              {DOCUMENTS[activeDoc].label} —{' '}
              {DOCUMENTS[activeDoc].sections.find((s) => s.id === activeSection)?.label ?? activeSection}
            </Typography>
            <Button
              size="small"
              variant="contained"
              disabled={isSaving}
              onClick={handleSave}
              startIcon={isSaving ? <CircularProgress size={12} /> : <SaveIcon sx={{ fontSize: 14 }} />}
              sx={{
                bgcolor: '#00c8ff',
                color: '#03121a',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.78rem',
                borderRadius: '8px',
                '&:hover': { bgcolor: '#33d4ff' },
              }}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mx: 2, mt: 1.5, fontSize: '0.82rem' }}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mx: 2, mt: 1.5, fontSize: '0.82rem' }}>
              Saved successfully.
            </Alert>
          )}

          <Box sx={{ flex: 1, p: 2 }}>
            <TextField
              fullWidth
              multiline
              minRows={12}
              value={settings[activeSection] ?? ''}
              onChange={handleTextChange}
              placeholder="Enter default text for this section…"
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'var(--bg-input, #080e1a)',
                  borderRadius: '8px',
                  color: 'var(--text-primary, #f8fbff)',
                  fontSize: '0.88rem',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,200,255,0.15)' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,200,255,0.35)' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#00c8ff' },
                },
              }}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}