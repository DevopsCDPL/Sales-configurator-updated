import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  Button,
  Alert,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  IconButton,
  Collapse,
  CircularProgress,
  Divider,
  Autocomplete,
} from '@mui/material';
import Stack from '@mui/material/Stack';
import {
  LocalShipping as ShipIcon,
  PictureAsPdf as PdfIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  CloudUpload as UploadIcon,
  FlightTakeoff as FlightIcon,
  ContactPhone as ContactIcon,
  DirectionsCar as CarIcon,
  LocationOn as LocationIcon,
  Assignment as AssignmentIcon,
  FitnessCenter as WeightIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { Project, CustomPart } from '../../types';
import api, { getBackendBaseUrl } from '../../services/api';
import { useNotification } from '../../contexts/NotificationContext';
import { useConfiguratorParts } from '../../hooks/useConfiguratorParts';
import { getPartQuantity } from '../../utils/calculations';
import { viewFileByPath, buildProjectFileName } from '../../utils/documentUtils';
import { UI, TabContainer, EnhancedNavFooter, AnimatedSection, StatusBadge } from '../UIComponents';

// â”€â”€ Local Design Tokens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const T = {
  primary: UI.primary,
  primaryLight: UI.primaryLight,
  primaryBg: UI.primaryBg,
  text: UI.textPrimary,
  textSec: UI.textMuted,
  textMuted: UI.textMuted,
  border: UI.border,
  bg: UI.bgSubtle,
  white: UI.bgCard,
  danger: UI.danger,
  radius: UI.radiusXs,
};

interface LogisticsTabProps {
  project: Project;
  onUpdate: () => void;
  onBack?: () => void;
  onNext?: () => void;
}

interface PackingList {
  id: string;
  number: string;
  shipment_method: string;
  shipment_date: string;
  carrier: string;
  bill_to_address: string;
  ship_to_address: string;
  same_as_billing: boolean;
  selected_job_indices: number[];
  job_details: Record<number, { quantity: string; weight_per_unit: string; weight_unit: string; total_weight: string }>;
  instructions: string[];
  tracking_number: string;
  tracking_slip_path?: string;
  tracking_slip_name?: string;
  receiver_name: string;
  receiver_phone: string;
  po_number: string;
  vehicle_type: string;
  vehicle_number: string;
  status: 'pending' | 'shipped' | 'delivered';
}

const SHIPMENT_METHODS = [
  'Ground', 'Air', 'Sea', 'Express', 'LTL (Less Than Truckload)', 'FTL (Full Truckload)',
  'Courier', 'Customer Pickup', 'PICK UP', 'Road', 'Shipped in Own Vehicle',
];

// const CARRIERS = [
//   'UPS (United Parcel Service)',
//   'FedEx',
//   'DHL Express',
//   'USPS (United States Postal Service)',
//   'Canada Post',
//   'Purolator',
//   'OnTrac',
//   'LaserShip',
//   'Amazon Logistics',
//   'XPO Logistics',
//   'Old Dominion Freight Line',
//   'Estes Express Lines',
//   'Saia LTL Freight',
//   'R+L Carriers',
//   'YRC Freight',
//   'N/A',
// ];

const VEHICLE_TYPES = ['Truck', 'Mini Van', 'Bus', 'Others'];

const todayStr = () => new Date().toISOString().slice(0, 10);

const makePL = async (
  index: number,
  clientAddress: string,
  shipToAddress: string,
  receiverName: string,
  receiverPhone: string,
  poNumber: string,
  defaultInstructions: string[] = ['', '', '']
): Promise<PackingList> => {
  let number = `PL-${String(index + 1).padStart(3, '0')}`;
  try {
    const res = await api.post('/document-numbering/packing_list_number/generate');
    if (res.data?.data?.number) {
      number = res.data.data.number;
    }
  } catch (err) {
    console.error('Failed to generate PL number', err);
  }

  return {
    id: `pl-${Date.now()}-${index}`,
    number,
    shipment_method: '',
    shipment_date: todayStr(),
    carrier: '',
    bill_to_address: clientAddress,
    ship_to_address: shipToAddress,
    same_as_billing: false,
    selected_job_indices: [],
    job_details: {},
    instructions: defaultInstructions,
    tracking_number: '',
    receiver_name: receiverName,
    receiver_phone: receiverPhone,
    po_number: poNumber,
    vehicle_type: '',
    vehicle_number: '',
    status: 'pending',
  };
};

// â”€â”€ Shared Style Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const cardSx = { borderRadius: '14px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', bgcolor: T.white } as const;
const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: T.radius, height: 40,
    '& fieldset': { borderColor: T.border },
    '&:hover fieldset': { borderColor: 'var(--text-muted)' },
    '&.Mui-focused fieldset': { borderColor: T.primary },
  },
  '& .MuiInputLabel-root': { fontSize: 13, color: T.textMuted },
  '& .MuiInputLabel-root.Mui-focused': { color: T.primary },
} as const;
const multiFieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: T.radius,
    '& fieldset': { borderColor: T.border },
    '&:hover fieldset': { borderColor: 'var(--text-muted)' },
    '&.Mui-focused fieldset': { borderColor: T.primary },
  },
  '& .MuiOutlinedInput-input': { wordWrap: 'break-word', overflowWrap: 'break-word', wordBreak: 'break-word' },
  '& .MuiInputLabel-root': { fontSize: 13, color: T.textMuted },
  '& .MuiInputLabel-root.Mui-focused': { color: T.primary },
} as const;
const selectSx = { borderRadius: T.radius, height: 40, '& fieldset': { borderColor: T.border }, '&:hover fieldset': { borderColor: 'var(--text-muted)' }, '&.Mui-focused fieldset': { borderColor: T.primary } } as const;

/** Section header with icon */
const SectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
    <Box sx={{
      width: 24, height: 24, borderRadius: '6px',
      bgcolor: T.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {React.cloneElement(icon as React.ReactElement, { sx: { fontSize: 14, color: T.primary } })}
    </Box>
    <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.text }}>{title}</Typography>
  </Box>
);

const LogisticsTab: React.FC<LogisticsTabProps> = ({ project, onUpdate, onBack, onNext }) => {
  const { showError, showSuccess } = useNotification();
  const { parts: customParts } = useConfiguratorParts(project) as { parts: CustomPart[] };
  const clientAddress = project.client?.address || '';
  const shipToAddress = (project as any).ship_to_address || project.quote_info?.ship_to_address || clientAddress;
  const receiverName  = project.client?.client_name || '';
  const receiverPhone = project.client?.poc_phone || '';
  const poNumber      = (project.salesOrder as any)?.customer_po_number || '';

  const [packingLists, setPackingLists] = useState<PackingList[]>([]);
  const [jobCount, setJobCount] = useState<number>(customParts.length || 1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [shippingId, setShippingId] = useState<string | null>(null);
  const [uploadingSlipId, setUploadingSlipId] = useState<string | null>(null);
  const [packingListGenerated, setPackingListGenerated] = useState(
    ['shipped', 'closed'].includes(project.status)
  );

  const canEdit = !['shipped', 'closed'].includes(project.status);
  const canShip = project.status === 'inspected' || project.status === 'shipped';
  const isShipped = ['shipped', 'closed'].includes(project.status);
  const [carriers, setCarriers] = useState<string[]>([]);

  useEffect(() => {
    const fetchCarriers = async () => {
      try {
        const res = await api.get('/logistics/carriers');
        const data = res.data.data || res.data;
        console.log(data);
        setCarriers(data.map((carrier: { carrier: string }) => carrier.carrier));
      } catch (error: any) {
        showError(error.response?.data?.message || 'failed to fetch carriers');
      }
    };
    fetchCarriers();
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        try {
          const woRes = await api.get(`/work-orders/project/${project.id}`);
          const wo = woRes.data.data || woRes.data;
          const pfCount = ((wo as any).production_forms || []).length;
          setJobCount(Math.max(customParts.length, pfCount, 1));
        } catch {}

        let defaultInstructions = ['', '', ''];
        try {
          const sysRes = await api.get('/settings/system');
          const sysSettings = sysRes.data?.data || {};
          if (sysSettings.logisticsInstructions) {
            defaultInstructions = sysSettings.logisticsInstructions.split('\n').filter((s: string) => s.trim() !== '');
          }
        } catch {}

        const res = await api.get(`/logistics/project/${project.id}`);
        const data = res.data.data || res.data;
        const saved = data?.packages_json;
        if (Array.isArray(saved) && saved.length > 0 && saved[0]?.number) {
          // Backward compat: ensure new fields exist on old records
          const migrated = saved.map((p: any) => ({
            ...p,
            shipment_date: p.shipment_date || todayStr(),
            receiver_name: p.receiver_name ?? receiverName,
            receiver_phone: p.receiver_phone ?? receiverPhone,
            po_number: p.po_number ?? poNumber,
            vehicle_type: p.vehicle_type ?? '',
            vehicle_number: p.vehicle_number ?? '',
            job_details: p.job_details ?? {},
          }));
          setPackingLists(migrated);
          setExpanded(new Set(migrated.map((pl: PackingList) => pl.id)));
        } else {
          const pl = await makePL(0, clientAddress, shipToAddress, receiverName, receiverPhone, poNumber, defaultInstructions);
          setPackingLists([pl]);
          setExpanded(new Set([pl.id]));
        }
      } catch {
        const pl = await makePL(0, clientAddress, shipToAddress, receiverName, receiverPhone, poNumber);
        setPackingLists([pl]);
        setExpanded(new Set([pl.id]));
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const updatePL = (id: string, patch: Partial<PackingList>) => {
    setPackingLists(prev => prev.map(pl => pl.id === id ? { ...pl, ...patch } : pl));
  };

  const takenJobsByOthers = (currentId: string): Set<number> => {
    const taken = new Set<number>();
    packingLists.forEach(pl => {
      if (pl.id !== currentId) pl.selected_job_indices.forEach(i => taken.add(i));
    });
    return taken;
  };

  const handleUploadTrackingSlip = async (plId: string, file: File) => {
    setUploadingSlipId(plId);
    try {
      const renamedFile = buildProjectFileName(project.project_number, file, 'logistics');
      const formData = new FormData();
      formData.append('file', renamedFile);
      const res = await api.post(
        `/logistics/project/${project.id}/tracking-slip`,
        formData
      );
      const data = res.data?.data || res.data;
      const newPath = data.file_path || data.filePath;
      const newName = data.file_name || renamedFile.name;
      // Append to existing slip names/paths (comma-separated)
      const pl = packingLists.find(p => p.id === plId);
      const existingNames = (pl?.tracking_slip_name || '').split(',').map(n => n.trim()).filter(Boolean);
      const existingPaths = (pl?.tracking_slip_path || '').split(',').map(n => n.trim()).filter(Boolean);
      existingNames.push(newName);
      existingPaths.push(newPath);
      updatePL(plId, {
        tracking_slip_path: existingPaths.join(', '),
        tracking_slip_name: existingNames.join(', '),
      });
      showSuccess('Tracking slip uploaded');
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error uploading tracking slip');
    } finally {
      setUploadingSlipId(null);
    }
  };

  const handleDeleteTrackingSlip = async (plId: string, idx: number) => {
    const pl = packingLists.find(p => p.id === plId);
    if (!pl) return;
    const names = (pl.tracking_slip_name || '').split(',').map(n => n.trim()).filter(Boolean);
    const paths = (pl.tracking_slip_path || '').split(',').map(n => n.trim()).filter(Boolean);
    const filePath = paths[idx];

    // Delete from backend (find Document by path, then delete)
    if (filePath) {
      try {
        const docsRes = await api.get(`/documents/project/${project.id}`);
        const docs = docsRes.data?.data || docsRes.data || [];
        const match = docs.find((d: any) =>
          d.file_path && (d.file_path === filePath || filePath.includes(d.file_path) || d.file_path.includes(filePath.split('/uploads/').pop() || ''))
        );
        if (match) {
          await api.delete(`/documents/${match.id}`);
        }
      } catch { /* best effort */ }
    }

    names.splice(idx, 1);
    paths.splice(idx, 1);
    updatePL(plId, {
      tracking_slip_name: names.join(', '),
      tracking_slip_path: paths.join(', '),
    });
    showSuccess('Tracking slip deleted');
  };

  const [slipExpanded, setSlipExpanded] = useState<Record<string, boolean>>({});

  const handleAddPackingList = async () => {
    let defaultInstructions = ['', '', ''];
    try {
      const sysRes = await api.get('/settings/system');
      const sysSettings = sysRes.data?.data || {};
      if (sysSettings.logisticsInstructions) {
        defaultInstructions = sysSettings.logisticsInstructions.split('\n').filter((s: string) => s.trim() !== '');
      }
    } catch {}

    const newPL = await makePL(packingLists.length, clientAddress, shipToAddress, receiverName, receiverPhone, poNumber, defaultInstructions);
    setPackingLists(prev => [...prev, newPL]);
    setExpanded(prev => new Set([...prev, newPL.id]));
  };

  const handleRemovePL = (id: string) => {
    setPackingLists(prev => prev.filter(pl => pl.id !== id));
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleJobToggle = (plId: string, jobIdx: number, checked: boolean) => {
    setPackingLists(prev => prev.map(pl => {
      if (pl.id !== plId) return pl;
      const jobs = checked
        ? [...pl.selected_job_indices, jobIdx]
        : pl.selected_job_indices.filter(j => j !== jobIdx);
      const details = { ...pl.job_details };
      if (checked && !details[jobIdx]) {
        const estQty = customParts[jobIdx] ? String(getPartQuantity(customParts[jobIdx])) : '';
        details[jobIdx] = { quantity: estQty, weight_per_unit: '', weight_unit: 'kg', total_weight: '' };
      }
      if (!checked) {
        delete details[jobIdx];
      }
      return { ...pl, selected_job_indices: jobs, job_details: details };
    }));
  };

  const handleJobDetailChange = (plId: string, jobIdx: number, field: 'quantity' | 'weight_per_unit' | 'weight_unit', value: string) => {
    setPackingLists(prev => prev.map(pl => {
      if (pl.id !== plId) return pl;
      const details = { ...pl.job_details };
      const cur = details[jobIdx] || { quantity: '', weight_per_unit: '', weight_unit: 'kg', total_weight: '' };
      const updated = { ...cur, [field]: value };
      // Auto-calculate total_weight
      const qty = parseFloat(field === 'quantity' ? value : updated.quantity) || 0;
      const wpu = parseFloat(field === 'weight_per_unit' ? value : updated.weight_per_unit) || 0;
      updated.total_weight = qty && wpu ? (qty * wpu).toFixed(2) : '';
      details[jobIdx] = updated;
      return { ...pl, job_details: details };
    }));
  };

  const handleInstructionChange = (plId: string, lineIdx: number, value: string) => {
    setPackingLists(prev => prev.map(pl => {
      if (pl.id !== plId) return pl;
      const ins = [...pl.instructions];
      ins[lineIdx] = value;
      return { ...pl, instructions: ins };
    }));
  };

  const handleAddInstruction = (plId: string) => {
    setPackingLists(prev => prev.map(pl =>
      pl.id === plId ? { ...pl, instructions: [...pl.instructions, ''] } : pl
    ));
  };

  const handleRemoveInstruction = (plId: string, lineIdx: number) => {
    setPackingLists(prev => prev.map(pl => {
      if (pl.id !== plId) return pl;
      const ins = pl.instructions.filter((_, i) => i !== lineIdx);
      return { ...pl, instructions: ins.length > 0 ? ins : [''] };
    }));
  };

  const saveAll = async (): Promise<boolean> => {
    try {
      await api.put(`/logistics/project/${project.id}`, { packages_json: packingLists });
      return true;
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error saving packing lists');
      return false;
    }
  };

  const handleSave = async (id: string) => {
    setSavingId(id);
    const ok = await saveAll();
    if (ok) showSuccess('Packing list saved');
    setSavingId(null);
  };

  const handleDownloadPdf = async (pl: PackingList) => {
    setDownloadingId(pl.id);
    await saveAll();
    try {
      const res = await api.post(
        `/logistics/project/${project.id}/packing-list-pdf`,
        { packingList: pl, jobCount },
        { responseType: 'blob' }
      );
      const disposition = res.headers?.['content-disposition'] || '';
      const fnMatch = disposition.match(/filename="?([^";\n]+)"?/);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fnMatch?.[1]?.trim() || `PackingList-${pl.number}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      setPackingListGenerated(true);
      showSuccess(`Packing List ${pl.number} downloaded`);
    } catch (err: any) {
      if (err.response?.data instanceof Blob) {
        try {
          const txt = await (err.response.data as Blob).text();
          const json = JSON.parse(txt);
          showError(json.message || 'Error generating PDF');
          setDownloadingId(null);
          return;
        } catch {}
      }
      showError(err.response?.data?.message || 'Error generating PDF');
    }
    setDownloadingId(null);
  };

  const handleMarkShipped = async (pl: PackingList) => {
    if (!pl.tracking_number.trim()) {
      showError('Please enter a Tracking Number before marking as shipped');
      return;
    }
    if (!pl.shipment_date) {
      showError('Please set the Shipment Date before marking as shipped');
      return;
    }
    setShippingId(pl.id);
    await saveAll();
    try {
      await api.post(`/logistics/project/${project.id}/ship`, {
        dispatch_date: pl.shipment_date,
        ship_date: pl.shipment_date,
        tracking_number: pl.tracking_number,
        shipment_method: pl.shipment_method,
        carrier: pl.carrier,
        ship_to_address: pl.ship_to_address || pl.bill_to_address,
        packages_json: packingLists,
      });
      updatePL(pl.id, { status: 'shipped' });
      showSuccess('Order marked as shipped');
      onUpdate();
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error marking as shipped');
    }
    setShippingId(null);
  };

  const handleConfirmDelivery = async () => {
    try {
      await api.post(`/logistics/project/${project.id}/close`);
      showSuccess('Delivery confirmed â€” project closed');
      onUpdate();
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error confirming delivery');
    }
  };

  const handleNext = () => {
    onNext?.();
  };

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const dis = (pl: PackingList) => isShipped && pl.status === 'shipped';

  return (
    <TabContainer>

      {!canShip && !isShipped && (
        <Alert severity="info" sx={{ mb: 1.5, borderRadius: T.radius, fontSize: 13, border: '1px solid #BFDBFE', bgcolor: 'rgba(0, 200, 255, 0.06)' }}>
          Quality inspection must pass before shipping can be arranged.
        </Alert>
      )}

      {/* â”€â”€ Page header â”€â”€ */}
      <AnimatedSection>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 48, height: 48, borderRadius: '12px',
              backgroundColor: 'rgba(0,200,255,0.10)',
              border: '1px solid rgba(0,200,255,0.20)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShipIcon sx={{ fontSize: 26, color: '#00c8ff' }} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: 22, fontWeight: 700, color: UI.textPrimary, letterSpacing: -0.3, lineHeight: 1.2 }}>
                Logistics &amp; Packing Lists
              </Typography>
              <Typography sx={{ fontSize: 13, color: UI.textMuted }}>
                Manage shipments, packing slips and tracking
              </Typography>
            </Box>
          </Box>
          <Button
            variant="contained" startIcon={<AddIcon />}
            onClick={handleAddPackingList}
            disabled={!canEdit && !isShipped}
            sx={{
              bgcolor: UI.primary, borderRadius: UI.radiusXs, height: 40, px: 2.5,
              textTransform: 'none', fontWeight: 600, fontSize: 13,
              boxShadow: 'none',
              '&:hover': { bgcolor: UI.primary, boxShadow: '0 2px 6px rgba(31,111,92,.25)' },
            }}
          >
            Add Packing List
          </Button>
        </Box>
      </AnimatedSection>

      {packingLists.map((pl, plIdx) => {
        const isOpen = expanded.has(pl.id);
        const taken = takenJobsByOthers(pl.id);
        const isSaving = savingId === pl.id;
        const isDownloading = downloadingId === pl.id;
        const isShipping = shippingId === pl.id;

        return (
          <Card key={pl.id} sx={{ ...cardSx, mb: 2 }}>
            {/* â”€â”€ Accent bar â”€â”€ */}
            <Box sx={{ height: 3, bgcolor: T.primary }} />

            {/* â”€â”€ Card header â”€â”€ */}
            <Box
              sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                px: 2.5, py: 1.25,
                borderBottom: isOpen ? `1px solid ${T.border}` : 'none',
                cursor: 'pointer',
              }}
              onClick={() => toggleExpand(pl.id)}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography fontWeight={700} fontSize={15} color={T.text}>
                  Packing List #{plIdx + 1}
                </Typography>
                <Chip
                  label={pl.number}
                  size="small"
                  sx={{ height: 22, fontSize: 11, fontWeight: 600, bgcolor: T.primaryBg, color: T.primary, border: 'none' }}
                />
                {pl.status !== 'pending' && (
                  <Chip
                    icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                    label={pl.status.toUpperCase()}
                    size="small"
                    sx={{ height: 22, fontSize: 11, fontWeight: 600, bgcolor: T.primaryBg, color: T.primary, border: `1px solid ${T.primary}33`, '& .MuiChip-icon': { color: T.primary } }}
                  />
                )}
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                {packingLists.length > 1 && canEdit && (
                  <IconButton size="small" onClick={e => { e.stopPropagation(); handleRemovePL(pl.id); }} sx={{ color: T.danger }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
                <IconButton
                  size="small"
                  onClick={e => { e.stopPropagation(); handleDownloadPdf(pl); }}
                  disabled={isDownloading}
                  title="Download Packing List PDF"
                  sx={{
                    border: `1px solid #CBD5E1`, color: T.textSec, borderRadius: '8px', width: 30, height: 30,
                    '&:hover': { borderColor: 'var(--text-muted)', bgcolor: 'var(--bg-surface-2)', color: T.primary }
                  }}
                >
                  {isDownloading ? <CircularProgress size={14} color="inherit" /> : <PdfIcon sx={{ fontSize: 16 }} />}
                </IconButton>
                <IconButton
                  size="small"
                  onClick={e => { e.stopPropagation(); toggleExpand(pl.id); }}
                  sx={isOpen
                    ? { bgcolor: T.primary, color: '#fff', borderRadius: '8px', width: 30, height: 30, '&:hover': { bgcolor: T.primary } }
                    : { border: `1px solid #CBD5E1`, color: T.textSec, borderRadius: '8px', width: 30, height: 30, '&:hover': { borderColor: 'var(--text-muted)', bgcolor: 'var(--bg-surface-2)' } }
                  }
                >
                  {isOpen ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
                </IconButton>
              </Stack>
            </Box>

            <Collapse in={isOpen}>
              <CardContent sx={{ px: 2, py: 1, '&:last-child': { pb: 1 } }}>

                {/* â•â•â• SECTION 1 â€” Shipment Information â•â•â• */}
                <SectionHeader icon={<FlightIcon />} title="Shipment Information" />
                <Grid container spacing={2} sx={{ mb: 1 }} alignItems="center">
                  <Grid item xs={12} sm={4}>
                    <FormControl fullWidth size="small" disabled={dis(pl)}>
                      <InputLabel sx={{ fontSize: 13, color: T.textMuted }}>Shipment Method</InputLabel>
                      <Select value={pl.shipment_method} label="Shipment Method"
                        onChange={e => updatePL(pl.id, { shipment_method: e.target.value })}
                        sx={selectSx}>
                        {SHIPMENT_METHODS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField fullWidth size="small" label="Shipment Date" type="date"
                      value={pl.shipment_date}
                      onChange={e => updatePL(pl.id, { shipment_date: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                      disabled={dis(pl)}
                      sx={fieldSx} />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Autocomplete 
                      freeSolo
                      options={carriers}
                      value={pl.carrier}
                      onChange={(event, newValue) => updatePL(pl.id, { carrier: newValue || ''})}
                      onInputChange={(event, newInputValue) => updatePL(pl.id, { carrier: newInputValue })}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          fullWidth
                          size="small"
                          label="Carrier"
                          placeholder='Select or type a carrier'
                          disabled={dis(pl)}
                          sx={fieldSx} 
                        />
                      )}
                    />
                  </Grid>
                  {/* <Grid item xs={12} sm={4}>
                    <FormControl fullWidth size="small" disabled={dis(pl)}>
                      <InputLabel sx={{ fontSize: 13, color: T.textMuted }}>Carrier</InputLabel>
                      <Select value={pl.carrier} label="Carrier"
                        onChange={e => updatePL(pl.id, { carrier: e.target.value })}
                        sx={selectSx}>
                        {CARRIERS.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid> */}
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth size="small" label="Tracking Number"
                      value={pl.tracking_number}
                      onChange={e => updatePL(pl.id, { tracking_number: e.target.value })}
                      placeholder="Enter Tracking Number"
                      disabled={dis(pl)}
                      sx={fieldSx} />
                  </Grid>
                  <Grid item xs={12} sm={6} sx={{ display: 'flex', alignItems: 'center' }}>
                    <Box sx={{ width: '100%' }}>
                      {(() => {
                        const slipNames = (pl.tracking_slip_name || '').split(',').map(n => n.trim()).filter(Boolean);
                        const slipPaths = (pl.tracking_slip_path || '').split(',').map(n => n.trim()).filter(Boolean);
                        const baseUrl = getBackendBaseUrl();
                        const isUploadingThis = uploadingSlipId === pl.id;
                        const isDisabled = dis(pl);
                        const isExpanded = slipExpanded[pl.id] ?? false;
                        const visibleSlips = isExpanded ? slipNames : slipNames.slice(0, 2);
                        const hiddenCount = slipNames.length - 2;

                        if (slipNames.length === 0) {
                          return (
                            <Button
                              fullWidth
                              variant="outlined" size="small" component="label"
                              startIcon={isUploadingThis ? <CircularProgress size={14} /> : <UploadIcon />}
                              disabled={isDisabled || isUploadingThis}
                              sx={{
                                borderRadius: '8px', textTransform: 'none', fontWeight: 600, fontSize: 12,
                                borderColor: 'var(--text-muted)', color: T.textSec, height: 38, px: 2,
                                justifyContent: 'center',
                                '&:hover': { borderColor: T.primary, color: T.primary, bgcolor: T.primaryBg },
                              }}>
                              Upload Tracking Slip
                              <input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                onChange={e => {
                                  const files = e.target.files;
                                  if (files) { for (let i = 0; i < files.length; i++) handleUploadTrackingSlip(pl.id, files[i]); }
                                  e.target.value = '';
                                }} />
                            </Button>
                          );
                        }

                        return (
                          <Box sx={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', minHeight: 38 }}>
                            {slipNames.length > 2 && (
                              <Box onClick={() => setSlipExpanded(prev => ({ ...prev, [pl.id]: !isExpanded }))}
                                sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', px: 1, py: 0.25, cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)', bgcolor: '#FAFAFA' }}>
                                <Typography sx={{ fontSize: 9.5, color: T.primary, fontWeight: 600 }}>
                                  {isExpanded ? 'Collapse' : `+${hiddenCount} more`}
                                </Typography>
                              </Box>
                            )}
                            <Box sx={{ maxHeight: isExpanded ? 120 : 70, overflowY: 'auto', '&::-webkit-scrollbar': { width: 3 }, '&::-webkit-scrollbar-thumb': { backgroundColor: 'var(--text-muted)', borderRadius: 2 } }}>
                              {visibleSlips.map((name, idx) => (
                                <Box key={`${name}-${idx}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.4, px: 0.75, py: 0.3, borderBottom: idx < visibleSlips.length - 1 ? '1px solid var(--border-subtle)' : 'none', '&:hover': { backgroundColor: 'var(--bg-surface-2)' }, cursor: slipPaths[idx] ? 'pointer' : 'default' }} onClick={() => slipPaths[idx] && viewFileByPath(slipPaths[idx].startsWith('http') ? slipPaths[idx] : `${baseUrl}${slipPaths[idx]}`)}>
                                  <Typography sx={{ fontSize: 10.5, color: T.primary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                                    {name.length > 18 ? name.slice(0, 15) + '...' : name}
                                  </Typography>
                                  {slipPaths[idx] && (
                                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); viewFileByPath(slipPaths[idx].startsWith('http') ? slipPaths[idx] : `${baseUrl}${slipPaths[idx]}`); }} title="View" sx={{ p: 0.2, color: '#64748B', '&:hover': { color: T.primary } }}>
                                      <VisibilityIcon sx={{ fontSize: 13 }} />
                                    </IconButton>
                                  )}
                                  {!isDisabled && (
                                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDeleteTrackingSlip(pl.id, idx); }} title="Delete" sx={{ p: 0.2, color: 'var(--text-muted)', '&:hover': { color: '#EF4444' } }}>
                                      <DeleteIcon sx={{ fontSize: 13 }} />
                                    </IconButton>
                                  )}
                                </Box>
                              ))}
                            </Box>
                            {!isDisabled && (
                              <Box component="label" sx={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5,
                                py: 0.35, cursor: 'pointer', borderTop: '1px solid #E2E8F0', backgroundColor: '#FAFAFA',
                                '&:hover': { backgroundColor: T.primaryBg }, transition: 'all 0.2s',
                              }}>
                                {isUploadingThis ? <CircularProgress size={11} sx={{ color: T.primary }} /> : (
                                  <>
                                    <AddIcon sx={{ fontSize: 12 }} />
                                    <Typography sx={{ fontSize: 10, fontWeight: 600, color: T.primary }}>Add More</Typography>
                                  </>
                                )}
                                <input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                  onChange={e => {
                                    const files = e.target.files;
                                    if (files) { for (let i = 0; i < files.length; i++) handleUploadTrackingSlip(pl.id, files[i]); }
                                    e.target.value = '';
                                  }} />
                              </Box>
                            )}
                          </Box>
                        );
                      })()}
                    </Box>
                  </Grid>
                </Grid>

                <Divider sx={{ borderColor: 'var(--border-subtle)', my: 1 }} />

                {/* â•â•â• SECTION 2 â€” Receiver Details â•â•â• */}
                <SectionHeader icon={<ContactIcon />} title="Receiver Details" />
                <Grid container spacing={1.5} sx={{ mb: 0.5 }}>
                  <Grid item xs={12} sm={3}>
                    <TextField fullWidth size="small" label="Receiver Name"
                      value={pl.receiver_name}
                      onChange={e => updatePL(pl.id, { receiver_name: e.target.value })}
                      disabled={dis(pl)}
                      sx={fieldSx} />
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField fullWidth size="small" label="Receiver Phone"
                      value={pl.receiver_phone}
                      onChange={e => updatePL(pl.id, { receiver_phone: e.target.value })}
                      disabled={dis(pl)}
                      sx={fieldSx} />
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField fullWidth size="small" label="Packing Slip Number"
                      value={pl.number}
                      InputProps={{ readOnly: true }}
                      sx={{ ...fieldSx, '& .MuiOutlinedInput-root': { ...fieldSx['& .MuiOutlinedInput-root'], bgcolor: 'var(--bg-surface-2)' } }} />
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField fullWidth size="small" label="PO Number"
                      value={pl.po_number}
                      InputProps={{ readOnly: true }}
                      sx={{ ...fieldSx, '& .MuiOutlinedInput-root': { ...fieldSx['& .MuiOutlinedInput-root'], bgcolor: 'var(--bg-surface-2)' } }} />
                  </Grid>
                </Grid>

                <Divider sx={{ borderColor: 'var(--border-subtle)', my: 0.5 }} />

                {/* â•â•â• SECTION 3 â€” Vehicle Details (always visible) â•â•â• */}
                <SectionHeader icon={<CarIcon />} title="Vehicle Details" />
                <Grid container spacing={1.5} sx={{ mb: 0.5 }}>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small" disabled={dis(pl)}>
                      <InputLabel sx={{ fontSize: 13 }}>Vehicle Type</InputLabel>
                      <Select value={pl.vehicle_type} label="Vehicle Type"
                        onChange={e => updatePL(pl.id, { vehicle_type: e.target.value })}
                        sx={selectSx}>
                        {VEHICLE_TYPES.map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth size="small" label="Vehicle Number"
                      value={pl.vehicle_number}
                      onChange={e => updatePL(pl.id, { vehicle_number: e.target.value })}
                      placeholder="Enter vehicle number"
                      disabled={dis(pl)}
                      sx={fieldSx} />
                  </Grid>
                </Grid>

                <Divider sx={{ borderColor: 'var(--border-subtle)', my: 0.5 }} />

                {/* â•â•â• SECTION 4 â€” Billing & Shipping Address â•â•â• */}
                <SectionHeader icon={<LocationIcon />} title="Billing & Shipping Address" />
                <Grid container spacing={1.5} sx={{ mb: 0.5 }}>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth size="small" label="Bill to Address"
                      value={pl.bill_to_address}
                      onChange={e => updatePL(pl.id, { bill_to_address: e.target.value })}
                      multiline rows={2}
                      disabled={dis(pl)}
                      sx={multiFieldSx} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth size="small" label="Ship to Address"
                      value={pl.ship_to_address}
                      onChange={e => updatePL(pl.id, { ship_to_address: e.target.value })}
                      disabled={dis(pl) || pl.same_as_billing}
                      multiline rows={2}
                      sx={multiFieldSx} />
                    <FormControlLabel
                      control={
                        <Checkbox size="small"
                          checked={pl.same_as_billing}
                          onChange={e => {
                            const updates: Partial<PackingList> = { same_as_billing: e.target.checked };
                            if (e.target.checked) {
                              updates.ship_to_address = pl.bill_to_address;
                            }
                            updatePL(pl.id, updates);
                          }}
                          disabled={dis(pl)}
                          sx={{ color: 'var(--text-muted)', '&.Mui-checked': { color: T.primary } }}
                        />
                      }
                      label={<Typography sx={{ fontSize: 12, color: T.textMuted }}>Same as Billing</Typography>}
                      sx={{ mt: 0.5 }}
                    />
                  </Grid>
                </Grid>

                <Divider sx={{ borderColor: 'var(--border-subtle)', my: 0.5 }} />

                {/* â•â•â• SECTION 5 & 6 â€” Select Job + Instructions & Requirements â•â•â• */}
                <Grid container spacing={1.5}>
                  {/* Select Job */}
                  <Grid item xs={12} sm={6}>
                    <SectionHeader icon={<AssignmentIcon />} title="Select Job" />
                    <Typography sx={{ fontSize: 12, color: '#6B7280', mb: 1 }}>Project List here</Typography>
                    <Box sx={{
                      display: 'flex', flexDirection: 'column', gap: 0.5,
                      p: 1.5, border: `1px solid ${T.border}`, borderRadius: T.radius, bgcolor: T.bg,
                      maxHeight: 220, overflowY: 'auto',
                    }}>
                      {Array.from({ length: jobCount }, (_, i) => {
                        const jobLabel = customParts[i]
                          ? `#${String(i + 1).padStart(2, '0')} ${customParts[i].job_description || customParts[i].drawing_part_no || `Job ${i + 1}`}${customParts[i].material ? ` â€” ${customParts[i].material}` : ''}${customParts[i].drawing_part_no && customParts[i].job_description ? ` â€” ${customParts[i].drawing_part_no}` : ''}`
                          : `#${String(i + 1).padStart(2, '0')} Job ${i + 1}`;
                        const isTaken = taken.has(i);
                        const isSelected = pl.selected_job_indices.includes(i);
                        const detail = pl.job_details?.[i] || { quantity: '', weight_per_unit: '', weight_unit: 'kg', total_weight: '' };
                        return (
                          <Box key={i}>
                            <FormControlLabel
                              control={
                                <Checkbox size="small"
                                  checked={isSelected}
                                  disabled={(isTaken && !isSelected) || dis(pl)}
                                  onChange={e => handleJobToggle(pl.id, i, e.target.checked)}
                                  sx={{ color: 'var(--text-muted)', '&.Mui-checked': { color: T.primary } }}
                                />
                              }
                              label={
                                <Typography fontSize={13} color={isTaken && !isSelected ? 'var(--text-muted)' : T.text}>
                                  {jobLabel}
                                </Typography>
                              }
                            />
                            {isSelected && (
                              <Box sx={{ display: 'flex', gap: 1, ml: 4, mb: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                                <TextField
                                  size="small"
                                  label="Qty"
                                  value={detail.quantity}
                                  onChange={e => handleJobDetailChange(pl.id, i, 'quantity', e.target.value)}
                                  disabled={dis(pl)}
                                  sx={{ width: 80, ...fieldSx }}
                                  inputProps={{ style: { fontSize: 12, padding: '4px 8px' } }}
                                  InputLabelProps={{ style: { fontSize: 11 } }}
                                />
                                <TextField
                                  size="small"
                                  label="Weight/Unit"
                                  value={detail.weight_per_unit}
                                  onChange={e => handleJobDetailChange(pl.id, i, 'weight_per_unit', e.target.value)}
                                  disabled={dis(pl)}
                                  sx={{ width: 100, ...fieldSx }}
                                  inputProps={{ style: { fontSize: 12, padding: '4px 8px' } }}
                                  InputLabelProps={{ style: { fontSize: 11 } }}
                                />
                                <FormControl size="small" sx={{ width: 70 }} disabled={dis(pl)}>
                                  <InputLabel sx={{ fontSize: 11 }}>Unit</InputLabel>
                                  <Select
                                    label="Unit"
                                    value={detail.weight_unit || 'kg'}
                                    onChange={e => handleJobDetailChange(pl.id, i, 'weight_unit', e.target.value as string)}
                                    sx={{ height: 32, fontSize: 12, borderRadius: T.radius }}
                                  >
                                    <MenuItem value="kg">kg</MenuItem>
                                    <MenuItem value="lb">lb</MenuItem>
                                    <MenuItem value="g">g</MenuItem>
                                  </Select>
                                </FormControl>
                                <Typography sx={{ fontSize: 12, color: T.textSec, ml: 0.5 }}>
                                  Total: {detail.total_weight ? `${detail.total_weight} ${detail.weight_unit || 'kg'}` : 'â€”'}
                                </Typography>
                              </Box>
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                  </Grid>

                  {/* Instructions & Requirements */}
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <SectionHeader icon={<WeightIcon />} title="Instructions & Requirements" />
                      {!dis(pl) && (
                        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                          onClick={() => handleAddInstruction(pl.id)}
                          sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600, color: T.primary, minWidth: 0, mt: -1 }}>
                          Add Line
                        </Button>
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {pl.instructions.map((line, lineIdx) => (
                        <Box key={lineIdx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography fontSize={12} color={T.textMuted} sx={{ minWidth: 20, textAlign: 'right', mr: 0.5 }}>
                            {lineIdx + 1}.
                          </Typography>
                          <TextField size="small" fullWidth value={line}
                            onChange={e => handleInstructionChange(pl.id, lineIdx, e.target.value)}
                            placeholder="Enter Instruction"
                            disabled={dis(pl)}
                            sx={fieldSx} />
                          {pl.instructions.length > 1 && !dis(pl) && (
                            <IconButton size="small" onClick={() => handleRemoveInstruction(pl.id, lineIdx)} sx={{ color: T.danger, p: 0.5 }}>
                              <DeleteIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          )}
                        </Box>
                      ))}
                    </Box>
                  </Grid>
                </Grid>

                {/* â•â•â• SECTION 7 â€” Action Buttons â•â•â• */}
                <Box sx={{
                  display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center',
                  mt: 1.5, pt: 1, borderTop: `1px solid ${T.border}`,
                }}>
                  <Button variant="outlined" onClick={() => handleSave(pl.id)} disabled={isSaving}
                    sx={{
                      borderRadius: T.radius, height: 40, px: 2.5, textTransform: 'none', fontWeight: 600, fontSize: 13,
                      borderColor: 'var(--text-muted)', color: T.textSec,
                      '&:hover': { borderColor: 'var(--text-muted)', bgcolor: 'var(--bg-surface-2)' },
                    }}>
                    {isSaving ? 'Savingâ€¦' : 'Save'}
                  </Button>

                  <Button variant="contained" startIcon={<PdfIcon />}
                    onClick={() => handleDownloadPdf(pl)} disabled={isDownloading}
                    sx={{
                      bgcolor: T.primary, borderRadius: T.radius, height: 40, px: 2.5,
                      textTransform: 'none', fontWeight: 600, fontSize: 13, boxShadow: 'none',
                      '&:hover': { bgcolor: T.primary, boxShadow: '0 2px 6px rgba(31,111,92,.25)' },
                    }}>
                    {isDownloading ? 'Generatingâ€¦' : 'Download Packing List PDF'}
                  </Button>

                  {/* {!isShipped && (
                    <Button variant="contained" startIcon={<ShipIcon />}
                      onClick={() => handleMarkShipped(pl)} disabled={isShipping || !canShip}
                      sx={{
                        bgcolor: T.primary, borderRadius: T.radius, height: 40, px: 2.5,
                        textTransform: 'none', fontWeight: 600, fontSize: 13, boxShadow: 'none',
                        '&:hover': { bgcolor: T.primary, boxShadow: '0 2px 6px rgba(31,111,92,.25)' },
                        '&.Mui-disabled': { bgcolor: 'var(--border)', color: '#9CA3AF' },
                      }}>
                      {isShipping ? 'Shippingâ€¦' : 'Shipped'}
                    </Button>
                  )} */}

                  {isShipped && project.status === 'shipped' && (
                    <Button variant="outlined" startIcon={<CheckCircleIcon />}
                      onClick={handleConfirmDelivery}
                      sx={{
                        borderRadius: T.radius, height: 40, px: 2.5, textTransform: 'none', fontWeight: 600, fontSize: 13,
                        borderColor: T.primary, color: T.primary,
                        '&:hover': { bgcolor: T.primaryBg },
                      }}>
                      Confirm Delivery
                    </Button>
                  )}

                  {/* Status indicator â€” pushed right */}
                  <Chip
                    label={`Status: ${pl.status === 'shipped' ? 'Shipped' : pl.status === 'delivered' ? 'Delivered' : 'Pending'}`}
                    size="small" variant="outlined"
                    sx={{
                      fontWeight: 600, fontSize: 11, ml: 'auto', height: 26,
                      ...(pl.status === 'shipped'
                        ? { borderColor: T.primary, color: T.primary, bgcolor: T.primaryBg }
                        : pl.status === 'delivered'
                          ? { borderColor: '#BFDBFE', color: '#006699', bgcolor: 'rgba(0, 200, 255, 0.06)' }
                          : { borderColor: T.border, color: T.textMuted }),
                    }}
                  />
                </Box>
              </CardContent>
            </Collapse>
          </Card>
        );
      })}

      <EnhancedNavFooter
        onBack={onBack}
        onNext={handleNext}
        backLabel="Back to Quality"
        nextLabel="Next: Invoice"
      />
    </TabContainer>
  );
};

export default LogisticsTab;

