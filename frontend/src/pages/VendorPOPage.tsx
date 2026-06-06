import React, { useState, useEffect } from 'react';
import {
  Box, Typography, FormControl, Select, MenuItem, CircularProgress, alpha,
} from '@mui/material';
import { ShoppingCart as CartIcon } from '@mui/icons-material';
import VendorPOTab from '../components/ProjectTabs/VendorPOTab';
import { Project } from '../types';
import api from '../services/api';

const T = {
  primary:    '#1F6F5C',
  primaryBg:  '#E9F5F1',
  dark:       '#1F2937',
  textSec:    '#6B7280',
  border:     'var(--border)',
  bg:         'var(--bg-canvas)',
};

const VendorPOPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/projects');
        const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setProjects(list);
        if (list.length > 0) setSelectedProject(list[0]);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const handleProjectChange = (id: string) => {
    const p = projects.find(pr => pr.id === id) || null;
    setSelectedProject(p);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress sx={{ color: T.primary }} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 3, px: 2 }}>
      {/* Page header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: '10px', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            bgcolor: T.primaryBg, border: `1px solid ${alpha(T.primary, 0.15)}`,
          }}>
            <CartIcon sx={{ fontSize: 20, color: T.primary }} />
          </Box>
          <Box>
            <Typography fontWeight={700} fontSize={18} color={T.dark}>
              RFQ &amp; PO to Vendor
            </Typography>
            <Typography fontSize={12} color={T.textSec}>
              Send RFQs and create Purchase Orders for vendor-supplied parts
            </Typography>
          </Box>
        </Box>

        {/* Project selector */}
        <FormControl size="small" sx={{ minWidth: 280 }}>
          <Select
            value={selectedProject?.id || ''}
            onChange={e => handleProjectChange(e.target.value as string)}
            displayEmpty
            sx={{
              borderRadius: '8px', fontSize: 13, bgcolor: 'var(--bg-input)',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: T.border },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: T.primary },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: T.primary, borderWidth: 2 },
            }}
          >
            <MenuItem value="" disabled>Select a Project</MenuItem>
            {projects.map(p => (
              <MenuItem key={p.id} value={p.id} sx={{ fontSize: 13 }}>
                {p.project_name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Content */}
      {selectedProject ? (
        <VendorPOTab
          project={selectedProject}
          onUpdate={() => {}}
        />
      ) : (
        <Box sx={{
          textAlign: 'center', py: 4, border: `1px dashed ${T.border}`,
          borderRadius: '12px', bgcolor: T.bg,
        }}>
          <CartIcon sx={{ fontSize: 48, color: alpha(T.textSec, 0.3), mb: 1 }} />
          <Typography fontSize={14} color={T.textSec} fontWeight={600}>
            Select a project above to manage RFQs and Purchase Orders
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default VendorPOPage;
