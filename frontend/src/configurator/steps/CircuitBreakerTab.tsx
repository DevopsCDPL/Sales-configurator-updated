import React, { useState, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  MenuItem,
  TextField,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TablePagination,
  IconButton,
  Chip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useConfigurator } from '../state/ConfiguratorProvider';
import {
  CIRCUIT_BREAKER_V2_DATA,
  CircuitBreakerV2Entry,
  CB_V2_BREAKER_TYPES,
  CB_V2_MANUFACTURERS,
  CB_V2_SERIES,
  CB_V2_FRAMES,
  CB_V2_RATED_CURRENTS,
  CB_V2_BREAKING_CAPACITIES,
  CB_V2_POLES,
  CB_V2_VOLTAGES,
  CB_V2_TRIP_UNITS,
  CB_V2_PROTECTION_FUNCTIONS,
  CB_V2_MOUNTING_TYPES,
  cbV2RatedCurrentMatchesFilter,
  cbV2RatedVoltageMatchesFilter,
  cbV2BreakingCapacityMatchesFilter,
  getCbV2SeriesByMfr,
  getCbV2FramesBySeries,
} from '../data/circuitBreakerV2Data';
import { getSectionDirective } from '../lib/field-intelligence';
import type { SelectedBreaker } from '../types';

interface CircuitBreakerTabProps {
  sectionNumber: number;
}

export interface BreakerV2Filters {
  breakerType: string;
  manufacturer: string;
  seriesProductFamily: string;
  frameModel: string;
  ratedCurrentA: string;
  numberOfPoles: string;
  breakingCapacityKA: string;
  ratedVoltage: string;
  tripUnitType: string;
  protectionFunctions: string;
  mountingType: string;
}

const INITIAL_FILTERS: BreakerV2Filters = {
  breakerType: '',
  manufacturer: '',
  seriesProductFamily: '',
  frameModel: '',
  ratedCurrentA: '',
  numberOfPoles: '',
  breakingCapacityKA: '',
  ratedVoltage: '',
  tripUnitType: '',
  protectionFunctions: '',
  mountingType: '',
};

export const CircuitBreakerTab: React.FC<CircuitBreakerTabProps> = ({ sectionNumber }) => {
  const { state, dispatch, fieldIntelligence } = useConfigurator();

  // Local state for UI
  const [filters, setFilters] = useState<BreakerV2Filters>(INITIAL_FILTERS);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Field Intelligence directives
  const breakerTypeDirective = getSectionDirective(fieldIntelligence, sectionNumber, "breakerFilters", "breakerType");
  const ratedVoltageDirective = getSectionDirective(fieldIntelligence, sectionNumber, "breakerFilters", "ratedVoltage");
  const breakingCapacityDirective = getSectionDirective(fieldIntelligence, sectionNumber, "breakerFilters", "breakingCapacityKA");

  // Determine what list of options to show based on field intelligence constraints
  const validBreakerTypes = breakerTypeDirective.filteredOptions?.length ? breakerTypeDirective.filteredOptions : CB_V2_BREAKER_TYPES;
  const validRatedVoltages = ratedVoltageDirective.filteredOptions?.length ? ratedVoltageDirective.filteredOptions : CB_V2_VOLTAGES;
  const validBreakingCapacities = breakingCapacityDirective.filteredOptions?.length ? breakingCapacityDirective.filteredOptions : CB_V2_BREAKING_CAPACITIES;

  const validSeries = filters.manufacturer ? getCbV2SeriesByMfr(filters.manufacturer) : CB_V2_SERIES;
  const validFrames = filters.seriesProductFamily ? getCbV2FramesBySeries(filters.seriesProductFamily) : CB_V2_FRAMES;

  const handleFilterChange = (key: keyof BreakerV2Filters, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'manufacturer') {
        next.seriesProductFamily = '';
        next.frameModel = '';
      }
      if (key === 'seriesProductFamily') {
        next.frameModel = '';
      }
      return next;
    });
    setPage(0);
  };

  const filteredData = useMemo(() => {
    return CIRCUIT_BREAKER_V2_DATA.filter((entry) => {
      if (filters.breakerType && entry.breakerType !== filters.breakerType) return false;
      if (filters.manufacturer && entry.manufacturer !== filters.manufacturer) return false;
      if (filters.seriesProductFamily && entry.seriesProductFamily !== filters.seriesProductFamily) return false;
      if (filters.frameModel && entry.frameModel !== filters.frameModel) return false;
      if (filters.ratedCurrentA && !cbV2RatedCurrentMatchesFilter(entry.ratedCurrentA, filters.ratedCurrentA)) return false;
      if (filters.numberOfPoles && entry.numberOfPoles !== filters.numberOfPoles) return false;
      if (filters.breakingCapacityKA && !cbV2BreakingCapacityMatchesFilter(entry.breakingCapacityKA, filters.breakingCapacityKA)) return false;
      if (filters.ratedVoltage && !cbV2RatedVoltageMatchesFilter(entry.ratedVoltage, filters.ratedVoltage)) return false;
      if (filters.tripUnitType && entry.tripUnitType !== filters.tripUnitType) return false;
      if (filters.protectionFunctions && entry.protectionFunctions !== filters.protectionFunctions) return false;
      if (filters.mountingType && entry.mountingType !== filters.mountingType) return false;
      return true;
    });
  }, [filters]);

  const pagedData = filteredData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  // Persistence: read / write only from Configurator context
  const selectedBreakers = sectionNumber === 1 
    ? state.section1SelectedBreakers 
    : (state.sectionSelectedBreakers[sectionNumber] || []);

  const handleSelectBreaker = (entry: CircuitBreakerV2Entry) => {
    const payload: SelectedBreaker = {
      breakerType: entry.breakerType,
      ratedCurrentA: entry.ratedCurrentA,
      breakingCapacityKA: entry.breakingCapacityKA,
      mountingType: entry.mountingType,
      applicationTyp: entry.applicationType,
      dimensions: entry.dimensions,
      sNo: entry.sNo,
      manufacturer: entry.manufacturer,
      series: entry.seriesProductFamily,
      modelNumber: entry.frameModel
    };

    const newBreakers = [...selectedBreakers, payload];
    if (sectionNumber === 1) {
      dispatch({ type: 'setSection1SelectedBreakers', payload: newBreakers });
    } else {
      dispatch({ type: 'setSectionSelectedBreakers', sectionNumber, payload: newBreakers });
    }
  };

  const handleRemoveBreaker = (idx: number) => {
    const newBreakers = selectedBreakers.filter((_, i) => i !== idx);
    if (sectionNumber === 1) {
      dispatch({ type: 'setSection1SelectedBreakers', payload: newBreakers });
    } else {
      dispatch({ type: 'setSectionSelectedBreakers', sectionNumber, payload: newBreakers });
    }
  };

  const renderFilterSelect = (key: keyof BreakerV2Filters, label: string, options: string[], disabled = false) => (
    <Grid item xs={12} sm={6} md={3}>
      <TextField
        select
        fullWidth
        size="small"
        label={label}
        value={filters[key]}
        onChange={(e) => handleFilterChange(key, e.target.value)}
        disabled={disabled}
        InputLabelProps={{ shrink: true }}
      >
        <MenuItem value="">
          <em>Any</em>
        </MenuItem>
        {options.map((opt) => (
          <MenuItem key={opt} value={opt}>
            {opt}
          </MenuItem>
        ))}
      </TextField>
    </Grid>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 2 }}>
      
      {/* Selected Breakers Section */}
      {selectedBreakers.length > 0 && (
        <Card variant="outlined" sx={{ borderColor: '#2563ff', bgcolor: 'rgba(37, 99, 255, 0.02)' }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ mb: 2, color: '#2563ff', fontWeight: 600 }}>
              Selected Circuit Breakers (Persisted)
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {selectedBreakers.map((sb, idx) => (
                <Box key={idx} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bgcolor: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 1 }}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>{sb.manufacturer} {sb.series} {sb.modelNumber}</Typography>
                    <Typography variant="caption" color="textSecondary">
                      {sb.breakerType} • {sb.ratedCurrentA} • {sb.breakingCapacityKA} • {sb.mountingType}
                    </Typography>
                  </Box>
                  <IconButton size="small" color="error" onClick={() => handleRemoveBreaker(idx)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Disabled Shell for "Saved" Circuit Breakers */}
      <Card variant="outlined" sx={{ opacity: 0.6, bgcolor: '#f9fafb' }}>
        <CardContent>
          <Typography variant="subtitle2" color="textSecondary" sx={{ mb: 1 }}>
            Saved Circuit Breakers
          </Typography>
          <Typography variant="caption" color="textSecondary">
            User profile integration is currently disabled. Log in to save and recall favorite breaker configurations.
          </Typography>
        </CardContent>
      </Card>

      {/* Catalog Filters */}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Filter Catalog</Typography>
          <Grid container spacing={2}>
            {renderFilterSelect('breakerType', 'Breaker Type', validBreakerTypes, breakerTypeDirective.locked || !breakerTypeDirective.visible)}
            {renderFilterSelect('manufacturer', 'Manufacturer', CB_V2_MANUFACTURERS)}
            {renderFilterSelect('seriesProductFamily', 'Series', validSeries)}
            {renderFilterSelect('frameModel', 'Frame/Model', validFrames)}
            
            {renderFilterSelect('ratedCurrentA', 'Rated Current (A)', CB_V2_RATED_CURRENTS)}
            {renderFilterSelect('breakingCapacityKA', 'Breaking Capacity (kA)', validBreakingCapacities, breakingCapacityDirective.locked || !breakingCapacityDirective.visible)}
            {renderFilterSelect('ratedVoltage', 'Rated Voltage', validRatedVoltages, ratedVoltageDirective.locked || !ratedVoltageDirective.visible)}
            {renderFilterSelect('numberOfPoles', 'Poles', CB_V2_POLES)}
            
            {renderFilterSelect('tripUnitType', 'Trip Unit', CB_V2_TRIP_UNITS)}
            {renderFilterSelect('protectionFunctions', 'Protection', CB_V2_PROTECTION_FUNCTIONS)}
            {renderFilterSelect('mountingType', 'Mounting', CB_V2_MOUNTING_TYPES)}
          </Grid>
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button size="small" variant="text" onClick={() => { setFilters(INITIAL_FILTERS); setPage(0); }}>
              Clear Filters
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Results Grid */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead sx={{ bgcolor: '#f9fafb' }}>
            <TableRow>
              <TableCell>Model</TableCell>
              <TableCell>Current</TableCell>
              <TableCell>Capacity</TableCell>
              <TableCell>Poles</TableCell>
              <TableCell>Voltage</TableCell>
              <TableCell align="right">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                  No circuit breakers match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              pagedData.map((row) => (
                <TableRow key={row.sNo} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{row.manufacturer}</Typography>
                    <Typography variant="caption" color="textSecondary">{row.seriesProductFamily} {row.frameModel}</Typography>
                  </TableCell>
                  <TableCell>{row.ratedCurrentA}</TableCell>
                  <TableCell>{row.breakingCapacityKA}</TableCell>
                  <TableCell>{row.numberOfPoles}</TableCell>
                  <TableCell>{row.ratedVoltage}</TableCell>
                  <TableCell align="right">
                    <Button 
                      variant="contained" 
                      size="small" 
                      onClick={() => handleSelectBreaker(row)}
                      sx={{ textTransform: 'none', boxShadow: 'none' }}
                    >
                      Select
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={filteredData.length}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[5, 10, 25]}
        />
      </TableContainer>
    </Box>
  );
};
