import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Grid,
  TextField,
  Button,
  Checkbox,
  FormControlLabel,
  Chip,
  Fade,
  Autocomplete,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useNotification } from '../../contexts/NotificationContext';
import {
  Building2, User, FolderOpen, Pencil, X, Save,
  CheckCircle2, Lock, Clock, ArrowRight,
} from 'lucide-react';
import { Project, Client } from '../../types';
import { projectService } from '../../services/projectService';
import { clientService } from '../../services/clientService';
import {
  UI, TabContainer, AnimatedSection, MotionBox,
  FieldLabel as FL, FieldGroup as FG,
} from '../UIComponents';

// Helpers
const formatRevision = (rev: number): string => `R_${String(rev).padStart(2, '0')}`;

interface ProjectInfoTabProps {
  project: Project;
  onUpdate: () => void;
  onProceedToEstimation: () => void;
}

/* â”€â”€â”€ Enhanced Section Card â”€â”€â”€ */
interface SectionCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accentColor?: string;
  iconBg?: string;
  prominent?: boolean;
  locked?: boolean;
  fieldCount?: { filled: number; total: number };
}

const SectionCard: React.FC<SectionCardProps> = ({
  icon, title, subtitle, children,
  accentColor = UI.primary,
  iconBg,
  prominent = false,
  locked = false,
  fieldCount,
}) => (
  <MotionBox
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35 }}
    sx={{
      border: `1px solid ${prominent ? accentColor : UI.border}`,
      borderRadius: UI.radius,
      overflow: 'hidden',
      backgroundColor: UI.card,
      boxShadow: prominent ? UI.shadowMd : UI.shadow,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      borderTop: `3.5px solid ${accentColor}`,
      transition: 'box-shadow 0.25s ease, border-color 0.25s ease, transform 0.2s ease',
      '&:hover': {
        boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
        borderColor: accentColor,
        transform: prominent ? 'translateY(-1px)' : 'none',
      },
      ...(locked ? { opacity: 0.7, pointerEvents: 'none' as const } : {}),
    }}
  >
    {/* Section header */}
    <Box sx={{ px: 2, pt: 1.5, pb: 1, background: UI.muted }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Box sx={{
          width: 32, height: 32, borderRadius: '10px',
          background: iconBg || alpha(accentColor, 0.12),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 2px 6px ${alpha(accentColor, 0.12)}`,
          color: accentColor,
        }}>
          {icon}
        </Box>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography sx={{
              fontSize: '0.9rem', fontWeight: 700, color: UI.text,
              letterSpacing: '-0.01em', fontFamily: '"Inter", sans-serif',
            }}>
              {title}
            </Typography>
            {locked && <Lock size={13} color={UI.textSecondary} />}
          </Box>
          {subtitle && (
            <Typography sx={{ fontSize: 11, color: UI.textSecondary, fontWeight: 500, mt: -0.25 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {fieldCount && (
          <Chip
            size="small"
            label={`${fieldCount.filled}/${fieldCount.total}`}
            sx={{
              height: 20, fontSize: 10, fontWeight: 700,
              bgcolor: fieldCount.filled === fieldCount.total ? alpha(UI.primary, 0.08) : UI.muted,
              color: fieldCount.filled === fieldCount.total ? UI.primary : UI.textSecondary,
              border: `1px solid ${fieldCount.filled === fieldCount.total ? alpha(UI.primary, 0.3) : UI.border}`,
            }}
            icon={fieldCount.filled === fieldCount.total
              ? <CheckCircle2 size={12} color={UI.primary} />
              : undefined}
          />
        )}
      </Box>
      <Box sx={{ height: '1px', background: `linear-gradient(90deg, ${alpha(accentColor, 0.2)} 0%, transparent 100%)` }} />
    </Box>

    {/* Body */}
    <Box sx={{ px: 2, pb: 2, pt: 1.5, flex: 1 }}>{children}</Box>
  </MotionBox>
);

/* â”€â”€â”€ Validated Field Wrapper â”€â”€â”€ */
const ValidatedField: React.FC<{
  children: React.ReactNode;
  isValid?: boolean;
  showCheck?: boolean;
}> = ({ children, isValid, showCheck }) => (
  <Box sx={{ position: 'relative' }}>
    {children}
    {showCheck && isValid && (
      <Fade in>
        <Box sx={{ position: 'absolute', right: 8, top: 28, display: 'flex' }}>
          <CheckCircle2 size={16} color={UI.primary} />
        </Box>
      </Fade>
    )}
  </Box>
);

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const ProjectInfoTab: React.FC<ProjectInfoTabProps> = ({ project, onUpdate, onProceedToEstimation }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess } = useNotification();
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);

  const makeInitialForm = useCallback(() => {
    const qi = project?.quote_info || {};
    const preparedBy = (project as any)?.preparedBy;
    if (!project) {
      return {
        selected_client_id: '',
        client_name: '',
        billing_address: '',
        client_poc: '',
        client_poc_phone: '',
        client_poc_email: '',
        client_poc_designation: '',
        seller_prepared_by: '',
        seller_poc: '',
        seller_designation: '',
        seller_poc_phone: '',
        seller_email: '',
        project_name: '',
        ship_to_address: '',
        same_as_billing: true,
        required_by_date: '',
        project_notes: '',
        revision: 'R_01',
      };
    }
    const billingAddr = qi.billing_address ?? project?.client?.address ?? '';
    const savedShip = qi.ship_to_address ?? project?.ship_to_address ?? '';
    const sameAsBilling = savedShip ? false : true;
    console.log(`billing address: ${project.quote_info}`);
    return {
      selected_client_id: project?.client_id || '',
      client_name: qi.client_name ?? project?.client?.client_name ?? '',
      billing_address: billingAddr,
      client_poc: qi.client_poc ?? project?.client?.poc_name ?? '',
      client_poc_phone: qi.client_poc_phone ?? project?.client?.poc_phone ?? '',
      client_poc_email: (qi as any).client_poc_email ?? project?.client?.poc_email ?? '',
      client_poc_designation: (qi as any).client_poc_designation ?? project?.client?.position ?? '',
      seller_prepared_by: qi.seller_prepared_by ?? preparedBy?.name ?? '',
      seller_poc: qi.seller_poc ?? preparedBy?.name ?? '',
      seller_designation: qi.seller_designation ?? preparedBy?.position ?? '',
      seller_poc_phone: qi.seller_poc_phone ?? preparedBy?.phone ?? '',
      seller_email: qi.seller_email ?? preparedBy?.email ?? '',
      project_name: project?.project_name ?? '',
      ship_to_address: sameAsBilling ? billingAddr : savedShip,
      same_as_billing: sameAsBilling,
      required_by_date: (qi as any).required_by_date ?? '',
      project_notes: (qi as any).project_notes ?? '',
      revision: formatRevision(project?.revision || 1),
    };
  }, [project]);

  const [form, setForm] = useState(makeInitialForm);
  const [showValidation, setShowValidation] = useState(false);
  const [editing, setEditing] = useState(false);

  const requiredFields: (keyof typeof form)[] = ['billing_address', 'seller_prepared_by', 'project_name'];
  const isFormValid = requiredFields.every(k => String(form[k] || '').trim() !== '');
  const fieldError = (key: keyof typeof form) =>
    showValidation && requiredFields.includes(key) && !String(form[key] || '').trim();
  const fieldValid = (key: keyof typeof form) =>
    requiredFields.includes(key) && String(form[key] || '').trim() !== '';

  useEffect(() => { clientService.getAll().then(setClients).catch(() => {}); }, []);
  useEffect(() => { setForm(makeInitialForm()); }, [project, clients, makeInitialForm]);

  /* Auto-save: debounce 3s after form changes while editing */
  const doAutoSave = useCallback(async () => {
    if (!editing || !project?.id) return;
    try {
      await projectService.update(project.id, {
        project_name: form.project_name,
        client_id: form.selected_client_id || project?.client_id,
        ship_to_address: form.ship_to_address,
        quote_info: {
          client_name: form.client_name, billing_address: form.billing_address,
          client_poc: form.client_poc, client_poc_phone: form.client_poc_phone,
          client_poc_email: form.client_poc_email, client_poc_designation: form.client_poc_designation,
          seller_prepared_by: form.seller_prepared_by, seller_poc: form.seller_poc,
          seller_designation: form.seller_designation, seller_poc_phone: form.seller_poc_phone,
          seller_email: form.seller_email, ship_to_address: form.ship_to_address,
          required_by_date: form.required_by_date, project_notes: form.project_notes,
        } as any,
      });
      setLastSaved(new Date());
    } catch { /* silent fail for auto-save */ }
  }, [editing, form, project?.id, project?.client_id]);

  useEffect(() => {
    if (!editing) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(doAutoSave, 4000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [form, editing, doAutoSave]);

  // Guard against null/undefined project - MUST be after all hooks
  if (!project) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Loading project data...</Typography>
      </Box>
    );
  }

  const handleSameAsBilling = (checked: boolean) => {
    setForm(f => ({ ...f, same_as_billing: checked, ship_to_address: checked ? f.billing_address : f.ship_to_address }));
  };

  const handleClientSelect = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (client) {
      setForm(f => ({
        ...f, selected_client_id: clientId, client_name: client.client_name,
        billing_address: client.address || '', client_poc: client.poc_name || '',
        client_poc_phone: client.poc_phone || '',
        client_poc_email: client.poc_email || '',
        client_poc_designation: client.position || '',
      }));
    } else {
      setForm(f => ({ ...f, selected_client_id: clientId }));
    }
  };

  /* Resolve the client to link on save:
     - empty company name → keep existing link (client optional)
     - matches an existing client (case-insensitive trimmed) → link it; if the
       user edited details, update that client (idempotent, no duplicate)
     - new name → create a client in the DB, then link it. */
  const resolveClient = async (): Promise<string | undefined> => {
    const name = form.client_name.trim();
    if (!name) return form.selected_client_id || project?.client_id || undefined;

    const payload = {
      client_name: name,
      address: form.billing_address || undefined,
      poc_name: form.client_poc || undefined,
      poc_phone: form.client_poc_phone || undefined,
      poc_email: form.client_poc_email || undefined,
      position: form.client_poc_designation || undefined,
    };

    // Match against the loaded list first (covers the selected-client case too).
    const match = clients.find(
      c => c.client_name.trim().toLowerCase() === name.toLowerCase()
    );

    try {
      if (match) {
        // Update only when the user actually changed something to avoid noise.
        const changed =
          (form.billing_address || '') !== (match.address || '') ||
          (form.client_poc || '') !== (match.poc_name || '') ||
          (form.client_poc_phone || '') !== (match.poc_phone || '') ||
          (form.client_poc_email || '') !== (match.poc_email || '') ||
          (form.client_poc_designation || '') !== (match.position || '');
        if (changed) {
          await clientService.update(match.id, payload);
        }
        return match.id;
      }
      const created = await clientService.create(payload);
      setClients(prev => [...prev, created]);
      return created.id;
    } catch {
      // If client persistence fails, don't block the project save — keep prior link.
      return form.selected_client_id || project?.client_id || undefined;
    }
  };

  const buildQuoteInfo = (): any => ({
    client_name: form.client_name, billing_address: form.billing_address,
    client_poc: form.client_poc, client_poc_phone: form.client_poc_phone,
    client_poc_email: form.client_poc_email, client_poc_designation: form.client_poc_designation,
    seller_prepared_by: form.seller_prepared_by, seller_poc: form.seller_poc,
    seller_designation: form.seller_designation, seller_poc_phone: form.seller_poc_phone,
    seller_email: form.seller_email, ship_to_address: form.ship_to_address,
    required_by_date: form.required_by_date, project_notes: form.project_notes,
  });

  const handleSave = async () => {
    if (!project?.id) return;
    setSaving(true);
    try {
      const clientId = await resolveClient();
      await projectService.update(project.id, {
        project_name: form.project_name,
        ...(clientId ? { client_id: clientId } : {}),
        ship_to_address: form.ship_to_address,
        quote_info: buildQuoteInfo(),
      });
      if (clientId) setForm(f => ({ ...f, selected_client_id: clientId }));
      setLastSaved(new Date());
      showSuccess('Project info saved successfully');
      setEditing(false);
      onUpdate();
    } catch (err: any) {
      showError(err.response?.data?.message || 'Error saving project info');
    } finally { setSaving(false); }
  };

  const handleProceed = async () => {
    setShowValidation(true);
    if (!isFormValid) { showError('Please fill in all mandatory fields before proceeding.'); return; }
    await handleSave();
    onProceedToEstimation();
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const dis = !editing;

  // Count filled fields per card
  const clientFieldCount = {
    filled: [form.client_name, form.billing_address, form.client_poc, form.client_poc_phone, form.client_poc_email].filter(v => v.trim()).length,
    total: 5,
  };
  const sellerFieldCount = {
    filled: [form.seller_prepared_by, form.seller_poc, form.seller_poc_phone, form.seller_email, form.seller_designation].filter(v => v.trim()).length,
    total: 5,
  };
  const projectFieldCount = {
    filled: [form.project_name, form.ship_to_address].filter(v => v.trim()).length,
    total: 2,
  };

  const formatTimeSince = (d: Date) => {
    const secs = Math.floor((Date.now() - d.getTime()) / 1000);
    if (secs < 5) return 'just now';
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    return `${mins}m ago`;
  };

  /* Legible field styling — strict 3-color palette.
     Cards are #0B0B0D (UI.card); inputs sit one notch on #000 (UI.muted).
     Edit mode: brighter surface + #E2E8F0 text so values are clearly readable.
     Read-only: muted surface, same legible text. Focus border = sky-blue. */
  const FIELD_TEXT = '#E2E8F0';
  const FIELD_LABEL = '#64748B';
  const ACCENT = '#00c8ff';
  const fieldSx = (disabled: boolean) => ({
    '& .MuiOutlinedInput-root': {
      height: 38,
      fontSize: '0.8125rem',
      fontFamily: '"Inter", sans-serif',
      color: FIELD_TEXT,
      backgroundColor: disabled ? '#000000' : '#15151F',
      borderRadius: UI.radiusXs,
      transition: 'all 0.2s ease',
      '& .MuiOutlinedInput-input': {
        color: FIELD_TEXT,
        WebkitTextFillColor: FIELD_TEXT,
        '&::placeholder': { color: FIELD_LABEL, opacity: 1 },
      },
      '& fieldset': { borderColor: UI.border, borderWidth: 1, borderStyle: 'solid' },
      '&:hover fieldset': { borderColor: disabled ? UI.border : '#2A2F44' },
      '&.Mui-focused fieldset': { borderColor: ACCENT, borderWidth: 1 },
      '&.Mui-disabled': {
        '& .MuiOutlinedInput-input': { color: FIELD_TEXT, WebkitTextFillColor: FIELD_TEXT },
        '& fieldset': { borderColor: UI.border },
      },
    },
  });
  const fieldTextareaSx = (disabled: boolean) => ({
    ...fieldSx(disabled),
    '& .MuiOutlinedInput-root': {
      ...(fieldSx(disabled) as any)['& .MuiOutlinedInput-root'],
      height: 'auto',
    },
  });
  const readOnlySx = (disabled: boolean) => fieldSx(disabled);
  const readOnlyTextarea = (disabled: boolean) => fieldTextareaSx(disabled);

  return (
    <TabContainer>

      {/* Edit mode banner */}
      {editing && (
        <AnimatedSection>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, width: '100%',
            px: 2, py: 1.25, borderRadius: UI.radiusSm,
            backgroundColor: '#0B0B0D', border: `1px solid ${alpha('#00c8ff', 0.35)}`,
          }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: '#00c8ff', flex: 1 }}>
              You are in edit mode. Changes auto-save after 4 seconds of inactivity.
            </Typography>
            {lastSaved && (
              <Chip
                icon={<Clock size={12} />}
                label={`Last saved ${formatTimeSince(lastSaved)}`}
                size="small"
                sx={{
                  height: 22, fontSize: 10.5, fontWeight: 600,
                  bgcolor: alpha('#00c8ff', 0.1), color: '#00c8ff',
                  border: `1px solid ${alpha('#00c8ff', 0.3)}`,
                  '& .MuiChip-icon': { color: '#00c8ff' },
                }}
              />
            )}
          </Box>
        </AnimatedSection>
      )}

      {/* Three section cards */}
      <Grid container spacing={2.5} alignItems="stretch">

        {/* CLIENT DETAILS */}
        <Grid item xs={12} sm={6} md={4}>
          <SectionCard
            icon={<Building2 size={18} />}
            title="Client Details"
            subtitle="Customer & billing information"
            accentColor="#00c8ff"
            iconBg={alpha('#00c8ff', 0.1)}
            locked={dis}
            fieldCount={clientFieldCount}
          >
            <FG fullWidth>
              <FL>Company name (optional)</FL>
              <Autocomplete
                freeSolo
                disabled={dis}
                options={clients.map(c => c.client_name)}
                value={form.client_name}
                inputValue={form.client_name}
                onInputChange={(_e, value, reason) => {
                  if (reason === 'reset') return;
                  // typing a (possibly new) company name unlinks any selected client
                  setForm(f => ({ ...f, client_name: value, selected_client_id: '' }));
                }}
                onChange={(_e, value) => {
                  // selecting an option from the list → autofill from that client
                  const match = value
                    ? clients.find(c => c.client_name === value)
                    : undefined;
                  if (match) handleClientSelect(match.id);
                  else setForm(f => ({ ...f, client_name: value || '', selected_client_id: '' }));
                }}
                renderInput={(params) => (
                  <TextField {...params} fullWidth
                    placeholder={dis ? '' : 'Type to search or add a new client...'}
                    sx={readOnlySx(dis)} />
                )}
              />
            </FG>
            <ValidatedField isValid={fieldValid('billing_address')} showCheck={editing}>
              <FG fullWidth>
                <FL required>Billing address</FL>
                <TextField fullWidth multiline rows={1} value={form.billing_address}
                  onChange={set('billing_address')} disabled={dis}
                  error={!!fieldError('billing_address')}
                  helperText={fieldError('billing_address') ? 'Required' : ''}
                  placeholder={dis ? '' : 'Enter billing address...'}
                  sx={readOnlyTextarea(dis)} />
              </FG>
            </ValidatedField>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 2, rowGap: 0.5 }}>
              <FG>
                <FL>POC name</FL>
                <TextField fullWidth value={form.client_poc} onChange={set('client_poc')}
                  disabled={dis} placeholder={dis ? '' : 'Contact name...'}
                  sx={readOnlySx(dis)} />
              </FG>
              <FG>
                <FL>POC phone</FL>
                <TextField fullWidth value={form.client_poc_phone} onChange={set('client_poc_phone')}
                  disabled={dis} placeholder={dis ? '' : 'Phone number...'}
                  sx={readOnlySx(dis)} />
              </FG>
              <FG>
                <FL>POC email</FL>
                <TextField fullWidth type="email" value={form.client_poc_email} onChange={set('client_poc_email')}
                  disabled={dis} placeholder={dis ? '' : 'email@example.com'}
                  sx={readOnlySx(dis)} />
              </FG>
              <FG>
                <FL>POC designation</FL>
                <TextField fullWidth value={form.client_poc_designation} onChange={set('client_poc_designation')}
                  disabled={dis} placeholder={dis ? '' : 'Role / Title...'}
                  sx={readOnlySx(dis)} />
              </FG>
            </Box>
          </SectionCard>
        </Grid>

        {/* SELLERS DETAILS */}
        <Grid item xs={12} sm={6} md={4}>
          <SectionCard
            icon={<User size={18} />}
            title="Sellers Details"
            subtitle="Sales team contact info"
            accentColor="#00c8ff"
            iconBg={alpha('#00c8ff', 0.1)}
            locked={dis}
            fieldCount={sellerFieldCount}
          >
            <ValidatedField isValid={fieldValid('seller_prepared_by')} showCheck={editing}>
              <FG fullWidth>
                <FL required>Prepared by (name)</FL>
                <TextField fullWidth value={form.seller_prepared_by} onChange={set('seller_prepared_by')}
                  disabled={dis} error={!!fieldError('seller_prepared_by')}
                  helperText={fieldError('seller_prepared_by') ? 'Required' : ''}
                  placeholder={dis ? '' : 'Seller / team name...'}
                  sx={readOnlySx(dis)} />
              </FG>
            </ValidatedField>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 2, rowGap: 0.5 }}>
              <FG>
                <FL>POC name</FL>
                <TextField fullWidth value={form.seller_poc} onChange={set('seller_poc')}
                  disabled={dis} placeholder={dis ? '' : 'Contact name...'}
                  sx={readOnlySx(dis)} />
              </FG>
              <FG>
                <FL>POC phone</FL>
                <TextField fullWidth value={form.seller_poc_phone} onChange={set('seller_poc_phone')}
                  disabled={dis} placeholder={dis ? '' : 'Phone number...'}
                  sx={readOnlySx(dis)} />
              </FG>
              <FG>
                <FL>POC email</FL>
                <TextField fullWidth type="email" value={form.seller_email} onChange={set('seller_email')}
                  disabled={dis} placeholder={dis ? '' : 'email@example.com'}
                  sx={readOnlySx(dis)} />
              </FG>
              <FG>
                <FL>POC designation</FL>
                <TextField fullWidth value={form.seller_designation} onChange={set('seller_designation')}
                  disabled={dis} placeholder={dis ? '' : 'Role / Title...'}
                  sx={readOnlySx(dis)} />
              </FG>
            </Box>
          </SectionCard>
        </Grid>

        {/* PROJECT DETAILS - PROMINENT */}
        <Grid item xs={12} sm={12} md={4}>
          <SectionCard
            icon={<FolderOpen size={18} />}
            title="Project Details"
            subtitle="Core project information"
            accentColor={UI.primary}
            prominent
            locked={dis}
            fieldCount={projectFieldCount}
          >
            {/* Row 1: Project name | Required by date */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 2, rowGap: 0.5 }}>
              <ValidatedField isValid={fieldValid('project_name')} showCheck={editing}>
                <FG>
                  <FL required>Project name</FL>
                  <TextField fullWidth value={form.project_name} onChange={set('project_name')}
                    disabled={dis} error={!!fieldError('project_name')}
                    helperText={fieldError('project_name') ? 'Required' : ''}
                    placeholder={dis ? '' : 'Enter project name...'}
                    sx={readOnlySx(dis)} />
                </FG>
              </ValidatedField>
              <FG>
                <FL>Required by date</FL>
                <TextField fullWidth type="date" value={form.required_by_date}
                  onChange={set('required_by_date')} disabled={dis}
                  InputLabelProps={{ shrink: true }}
                  sx={readOnlySx(dis)} />
              </FG>
            </Box>
            {/* Row 2: Ship-to address */}
            <FG fullWidth>
              <FL>Ship to address</FL>
              <TextField fullWidth multiline rows={1} value={form.ship_to_address}
                onChange={set('ship_to_address')} disabled={dis || form.same_as_billing}
                placeholder={dis ? '' : 'Delivery address...'}
                sx={readOnlyTextarea(dis)} />
              <FormControlLabel
                control={
                  <Checkbox size="small" checked={form.same_as_billing}
                    onChange={(e) => handleSameAsBilling(e.target.checked)} disabled={dis}
                    sx={{ color: UI.border, '&.Mui-checked': { color: '#00c8ff' }, p: 0.5 }} />
                }
                label={<Typography sx={{ fontSize: 12, color: '#64748B' }}>Same as billing</Typography>}
                sx={{ mt: 0.5, ml: 0 }}
              />
            </FG>
            {/* Row 3: Project notes */}
            <FG fullWidth>
              <FL>Project notes</FL>
              <TextField fullWidth multiline rows={2} value={form.project_notes}
                onChange={set('project_notes')} disabled={dis}
                placeholder={dis ? '' : 'Optional notes, voltage class, project type...'}
                sx={readOnlyTextarea(dis)} />
            </FG>
          </SectionCard>
        </Grid>
      </Grid>

      {/* ACTION BAR */}
      <Box
        sx={{
          mt: 2,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          px: { xs: 2, sm: 3 }, py: 1.25,
          backgroundColor: UI.bgCard,
          borderTop: `1px solid ${UI.border}`,
          borderRadius: UI.radiusSm,
          boxShadow: UI.shadow,
        }}
      >
        {/* Left: status info */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {editing ? (
            <>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#F59E0B', animation: 'pulse 2s infinite',
                '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } } }} />
              <Typography sx={{ fontSize: 12, color: '#F59E0B', fontWeight: 600 }}>
                Editing
              </Typography>
              {lastSaved && (
                <Typography sx={{ fontSize: 11, color: UI.textLight, fontWeight: 500 }}>
                  · Saved {formatTimeSince(lastSaved)}
                </Typography>
              )}
            </>
          ) : (
            <>
              <Lock size={13} color="#64748B" />
              <Typography sx={{ fontSize: 12, color: UI.textLight, fontWeight: 500 }}>
                Read-only · Click Edit to modify
              </Typography>
            </>
          )}
        </Box>

        {/* Right: action buttons */}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {!editing ? (
            <Button
              variant="outlined"
              startIcon={<Pencil size={15} />}
              onClick={() => setEditing(true)}
              sx={{
                height: 36, borderRadius: UI.radiusXs, px: 2.5, fontSize: 13, fontWeight: 600,
                borderColor: UI.border, color: UI.textSecondary, textTransform: 'none',
                '&:hover': { borderColor: '#00c8ff', color: '#00c8ff', backgroundColor: 'rgba(0,200,255,0.10)' },
                transition: 'all 0.15s ease',
              }}
            >
              Edit
            </Button>
          ) : (
            <Button
              variant="outlined"
              startIcon={<X size={15} />}
              onClick={() => { setForm(makeInitialForm()); setEditing(false); }}
              sx={{
                height: 36, borderRadius: UI.radiusXs, px: 2, fontSize: 13, fontWeight: 600,
                borderColor: UI.border, color: UI.textSecondary, textTransform: 'none',
                '&:hover': { borderColor: '#f87171', color: '#f87171', backgroundColor: 'rgba(248,113,113,0.10)' },
              }}
            >
              Cancel
            </Button>
          )}

          {editing && (
            <Button
              variant="contained"
              startIcon={<Save size={15} />}
              onClick={handleSave}
              disabled={saving}
              sx={{
                height: 36, borderRadius: UI.radiusXs, px: 2.5, fontSize: 13, fontWeight: 700,
                backgroundColor: '#00c8ff', color: '#06151c', boxShadow: 'none', textTransform: 'none',
                '&:hover': { backgroundColor: '#33d4ff', color: '#06151c', boxShadow: '0 2px 8px rgba(0,200,255,0.30)' },
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          )}

          <Button
            variant="contained"
            endIcon={<ArrowRight size={16} />}
            onClick={handleProceed}
            disabled={saving}
            sx={{
              height: 36, borderRadius: UI.radiusXs, fontSize: 13, fontWeight: 700, px: 2.5,
              textTransform: 'none',
              backgroundColor: isFormValid ? '#00c8ff' : 'rgba(0,200,255,0.20)',
              color: isFormValid ? '#06151c' : 'rgba(226,232,240,0.55)',
              boxShadow: isFormValid ? '0 2px 8px rgba(0,200,255,0.30)' : 'none',
              '&:hover': isFormValid
                ? { backgroundColor: '#33d4ff', color: '#06151c', boxShadow: '0 4px 12px rgba(0,200,255,0.40)' }
                : {},
            }}
          >
            Next: Estimation
          </Button>
        </Box>
      </Box>
    </TabContainer>
  );
};

export default ProjectInfoTab;
