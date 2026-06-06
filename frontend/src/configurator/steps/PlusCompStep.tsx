/**
 * PlusCompStep — additional / one-off line items not tied to a category.
 *
 * Renders the union of all catalog categories so an estimator can drop any
 * component as an additional line, plus a free-form note field.
 */
import React from 'react';
import { Box, Stack, TextField, Typography } from '@mui/material';
import { COMPONENT_CATEGORIES } from '../lib/component-categories';
import CategoryComponentPicker from './CategoryComponentPicker';
import { useConfigurator } from '../state/ConfiguratorProvider';

const PlusCompStep: React.FC = () => {
  const { state, dispatch } = useConfigurator();
  const allCategories = Object.values(COMPONENT_CATEGORIES);
  return (
    <Stack spacing={2}>
      <Box>
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, mb: 0.5, color: 'var(--text-muted, #8b93a3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Notes
        </Typography>
        <TextField
          fullWidth
          multiline
          minRows={2}
          size="small"
          placeholder="One-off charges, custom additions, special instructions…"
          value={state.stepNotes.plus_comp ?? ''}
          onChange={(e) =>
            dispatch({ type: 'setStepNote', stepKey: 'plus_comp', payload: e.target.value })
          }
        />
      </Box>
      <CategoryComponentPicker stepKey="plus_comp" categories={allCategories} emptyLabel="No catalogue items." />
    </Stack>
  );
};

export default PlusCompStep;
