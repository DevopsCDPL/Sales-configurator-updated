/**
 * SLDStep — single-line diagram notes.
 *
 * The full SLD viewer / drag-drop builder is a Phase 5+ deliverable. For
 * Phase 4 this step captures free-form notes & links that the quotation
 * compile step will reference.
 */
import React from 'react';
import { Box, Stack, TextField, Typography, Alert } from '@mui/material';
import { useConfigurator } from '../state/ConfiguratorProvider';

const SLDStep: React.FC = () => {
  const { state, dispatch } = useConfigurator();
  return (
    <Stack spacing={2}>
      <Alert severity="info" sx={{ fontSize: '0.78rem' }}>
        The interactive SLD builder is reserved for a future phase. Use this step to capture SLD notes,
        references to attached drawings, or special interlock annotations.
      </Alert>
      <Box>
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, mb: 0.5, color: 'var(--text-muted, #8b93a3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          SLD Notes
        </Typography>
        <TextField
          fullWidth
          multiline
          minRows={6}
          size="small"
          placeholder="Bus arrangement, interlocks, metering scheme, drawing reference numbers…"
          value={state.stepNotes.sld ?? ''}
          onChange={(e) =>
            dispatch({ type: 'setStepNote', stepKey: 'sld', payload: e.target.value })
          }
        />
      </Box>
    </Stack>
  );
};

export default SLDStep;
