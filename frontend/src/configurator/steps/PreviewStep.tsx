/**
 * PreviewStep — live, debounced pricing preview.
 *
 * Calls `quotationCompilerService.preview(configurationId)` whenever the
 * configurator state changes, debounced 800 ms. Renders the resulting
 * BOM lines, labour bucket, and totals.  Save / autosave races are handled
 * by waiting until `dirty === false` (i.e. autosave has flushed) before
 * issuing a preview — otherwise the preview would be computed against
 * stale persisted state.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useConfigurator } from '../state/ConfiguratorProvider';
import { quotationCompilerService } from '../../services/quotationCompilerService';
import type { QuotationPreviewResult } from '../../services/configuratorService';
import { useNotification } from '../../contexts/NotificationContext';
import { diag } from '../../utils/diag';

const ACCENT = '#2563ff';
const BORDER = 'var(--border, #e4e8ee)';

const fmt = (n: number | null | undefined): string =>
  n == null ? '—' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PreviewStep: React.FC = () => {
  const notify = useNotification();
  const { configuration, state, dirty, saving, flush } = useConfigurator();
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<QuotationPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Trigger key: re-runs whenever state changes AND nothing pending.
  const triggerKey = useMemo(
    () => JSON.stringify({ s: state.stepLines, l: state.section1SelectedBreakers, t: state.sectionSelectedBreakers, sp: state.systemParameters }),
    [state]
  );

  useEffect(() => {
    if (!configuration?.id) return;
    let cancelled = false;

    const run = async () => {
      try {
        // Ensure persistence is up-to-date so /preview reads the same state.
        if (dirty) await flush();
        if (cancelled) return;
        setLoading(true);
        setError(null);
        const startedAt = Date.now();
        const result = await quotationCompilerService.preview(configuration.id);
        if (!cancelled) {
          setPreview(result);
          diag('preview', 'computed', { id: configuration.id, ms: Date.now() - startedAt, items: result?.items?.length ?? 0 });
        }
      } catch (err: any) {
        if (!cancelled) {
          const msg = err?.response?.data?.message || 'Preview failed';
          setError(msg);
          diag.error('preview', 'failed', err);
          notify.showError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timer = setTimeout(run, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey, configuration?.id]);

  const items: any[] = preview?.items ?? [];
  const totals: any = preview?.totals ?? {};
  const labour: any = preview?.labour ?? {};

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Live Pricing Preview</Typography>
        {(loading || saving) && <CircularProgress size={14} />}
        {dirty && !loading && (
          <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-muted, #8b93a3)' }}>
            Waiting for autosave…
          </Typography>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ fontSize: '0.78rem' }}>{error}</Alert>}

      <Card variant="outlined" sx={{ borderColor: BORDER, borderRadius: '10px' }}>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          {items.length === 0 ? (
            <Box sx={{ py: 5, textAlign: 'center' }}>
              <Typography sx={{ fontSize: '0.82rem', color: 'var(--text-muted, #8b93a3)' }}>
                {loading ? 'Computing…' : 'No line items yet. Add components in earlier steps to see pricing.'}
              </Typography>
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.74rem' }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.74rem' }}>Part / Description</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.74rem' }} align="right">Qty</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.74rem' }} align="right">Unit</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.74rem' }} align="right">Ext</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((it, i) => (
                  <TableRow key={i} hover>
                    <TableCell sx={{ fontSize: '0.78rem' }}>{i + 1}</TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>
                      <Box sx={{ fontWeight: 600 }}>{it.part_number ?? it.name ?? 'Item'}</Box>
                      {it.description && (
                        <Box sx={{ fontSize: '0.72rem', color: 'var(--text-muted, #8b93a3)' }}>
                          {it.description}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }} align="right">{it.quantity ?? 1}</TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }} align="right">{fmt(it.unit_cost ?? it.unit_price)}</TableCell>
                    <TableCell sx={{ fontSize: '0.78rem', fontWeight: 600 }} align="right">{fmt(it.total_cost ?? it.extended ?? it.subtotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {preview && (
        <Card variant="outlined" sx={{ borderColor: BORDER, borderRadius: '10px' }}>
          <CardContent sx={{ p: 2 }}>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, mb: 1, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #8b93a3)' }}>
              Totals
            </Typography>
            <Stack spacing={0.5}>
              <Row label="Material"  value={fmt(totals.material_total ?? totals.material ?? totals.bom)} />
              <Row label="Labour"    value={fmt(labour?.totals?.cost_total ?? totals.labour)} />
              <Row label="Copper"    value={fmt(totals.copper_cost)} />
              <Row label="Overhead"  value={fmt(totals.overhead_amount ?? totals.overhead)} />
              <Divider sx={{ my: 0.75 }} />
              <Row label="Subtotal (Cost)" value={fmt(totals.total_cost)} />
              <Row label="Margin"    value={fmt(totals.actual_profit ?? totals.margin)} />
              <Divider sx={{ my: 0.75 }} />
              <Row
                label="Grand Total"
                value={fmt(totals.rounded_price ?? totals.target_price ?? totals.grand_total ?? totals.total)}
                bold
              />
              {typeof totals.actual_gm === 'number' && (
                <Row label="GM %" value={`${(totals.actual_gm * 100).toFixed(2)}%`} />
              )}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
};

const Row: React.FC<{ label: string; value: string; bold?: boolean }> = ({ label, value, bold }) => (
  <Stack direction="row" justifyContent="space-between" alignItems="center">
    <Typography sx={{ fontSize: bold ? '0.92rem' : '0.82rem', fontWeight: bold ? 700 : 500 }}>
      {label}
    </Typography>
    <Typography sx={{ fontSize: bold ? '0.92rem' : '0.82rem', fontWeight: bold ? 700 : 600, color: bold ? ACCENT : undefined }}>
      {value}
    </Typography>
  </Stack>
);

export default PreviewStep;
