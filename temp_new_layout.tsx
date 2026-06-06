  return (
    <Box sx={{ pb: 6, maxWidth: 1440, mx: 'auto', px: { xs: 2, md: 3 } }}>
      {/* Alerts */}
      {estimate?.is_approved && isEditMode && (
        <Alert severity="info" sx={{ mb: 2.5, borderRadius: 3, fontSize: 13 }}>
          You are editing an <strong>approved</strong> estimate. Saving changes will clear the approval and require re-approval.
        </Alert>
      )}

      {/* ===== MAIN FLEX LAYOUT ===== */}
      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start', minHeight: 500 }}>
        
        {/* ── LEFT: Vertical Revision Selector ──────────────────── */}
        <Box sx={{
          width: 250,
          minWidth: 250,
          flexShrink: 0,
          bgcolor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          boxShadow: '0px 2px 6px rgba(0,0,0,0.04), 0px 10px 25px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}>
          {/* Panel header */}
          <Box sx={{
            px: 3, py: 2.5,
            borderBottom: '1px solid #E2E8F0',
            bgcolor: '#F9FAFB',
          }}>
            <Typography sx={{ 
              fontSize: 14, fontWeight: 700, color: '#0F172A', 
              textTransform: 'uppercase', letterSpacing: '.06em' 
            }}>
              Revision Selector
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#64748B', mt: 0.5 }}>
              {allRevisions.length} revision{allRevisions.length !== 1 ? 's' : ''} available
            </Typography>
          </Box>

          {/* Revision list */}
          <Box sx={{ py: 1 }}>
            {allRevisions.length === 0 && (
              <Typography sx={{ px: 3, py: 4, fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
                No estimations yet
              </Typography>
            )}
            {allRevisions.map((rev) => {
              const isActive = rev.revision === activeRevision;
              const revParts = Array.isArray(rev.custom_parts) ? rev.custom_parts : [];
              const revPartsTotal = revParts.reduce((sum: number, p: any) => sum + ((parseFloat(String(p.quantity)) || 0) * (parseFloat(String(p.unit_price)) || 0)), 0);
              const revProcessCost = Array.isArray(rev.estimate_items) ? rev.estimate_items.reduce((sum: number, item: any) => sum + (parseFloat(String(item.total_value)) || 0), 0) : 0;
              const revTotalCost = revPartsTotal + revProcessCost + (parseFloat(String(rev.overhead_cost)) || 0);
              const revMargin = parseFloat(String(rev.margin_percent)) || 0;
              const revFinalPrice = revTotalCost * (1 + revMargin / 100);
              
              return (
                <Box
                  key={rev.revision}
                  onClick={() => handleSwitchRevision(rev.revision)}
                  sx={{
                    mx: 1,
                    my: 0.5,
                    px: 2,
                    py: 1.5,
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    transition: 'all 0.15s ease',
                    bgcolor: isActive ? '#ECFDF5' : 'transparent',
                    border: isActive ? '2px solid #166534' : '2px solid transparent',
                    '&:hover': {
                      bgcolor: isActive ? '#DCFCE7' : '#F8FAFC',
                    },
                  }}
                >
                  {/* Revision badge */}
                  <Box sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 14,
                    bgcolor: isActive ? '#166534' : '#E5E7EB',
                    color: isActive ? '#fff' : '#374151',
                    transition: 'all 0.15s ease',
                    flexShrink: 0,
                  }}>
                    R{rev.revision}
                  </Box>

                  {/* Info */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{
                      fontSize: 14,
                      fontWeight: isActive ? 700 : 600,
                      color: isActive ? '#166534' : '#111827',
                      lineHeight: 1.3,
                    }}>
                      Estimation R{rev.revision}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                      {/* Status indicator */}
                      <Box sx={{
                        width: 6, height: 6, borderRadius: '50%',
                        bgcolor: rev.is_approved ? '#16A34A' : '#94A3B8',
                        flexShrink: 0,
                      }} />
                      <Typography sx={{ fontSize: 11, color: '#6B7280', fontWeight: 500 }}>
                        {rev.is_approved ? 'Approved' : 'Draft'}
                      </Typography>
                    </Box>
                    <Typography sx={{ 
                      fontSize: 11, color: '#9CA3AF', mt: 0.25, 
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' 
                    }}>
                      {revParts.length} part{revParts.length !== 1 ? 's' : ''} • ${Math.round(revFinalPrice).toLocaleString()}
                    </Typography>
                  </Box>

                  {/* Active indicator */}
                  {isActive && (
                    <Box sx={{
                      width: 8, height: 8, borderRadius: '50%',
                      bgcolor: '#166534',
                      flexShrink: 0,
                      boxShadow: '0 0 0 3px #DCFCE7',
                    }} />
                  )}
                </Box>
              );
            })}
          </Box>

          {/* Compare link */}
          {allRevisions.length > 1 && (
            <Box sx={{
              px: 3, py: 2,
              borderTop: '1px solid #E2E8F0',
            }}>
              <Button
                size="small"
                onClick={() => setShowComparison(!showComparison)}
                startIcon={showComparison ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#166534',
                  textTransform: 'none',
                  p: 0,
                  minWidth: 0,
                  '&:hover': { bgcolor: 'transparent', color: '#14532D' },
                }}
              >
                {showComparison ? 'Hide comparison' : 'Compare all revisions'}
              </Button>
            </Box>
          )}
        </Box>

        {/* ── RIGHT: Selected Estimation Content ───────────────────── */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {!estimate && allRevisions.length === 0 && (
            <Box sx={{
              bgcolor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              boxShadow: '0px 2px 6px rgba(0,0,0,0.04), 0px 10px 25px rgba(0,0,0,0.06)',
              p: 6,
              textAlign: 'center',
            }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600, color: '#111827', mb: 1 }}>
                No Estimations Yet
              </Typography>
              <Typography sx={{ fontSize: 14, color: '#6B7280' }}>
                Create your first estimation to get started
              </Typography>
            </Box>
          )}

          {estimate && (
              <Grid container spacing={3} alignItems="flex-start">
                <Grid item xs={12} md={9}>
                  <Card sx={{
                    mb: 3, borderRadius: '16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
                    border: '1px solid #E2E8F0', overflow: 'hidden', backgroundColor: '#FFFFFF',
                  }}>
                    {/* Card Header */}
                    <Box sx={{
                      display: 'flex', alignItems: 'center', gap: 1.5,
                      px: 3, py: 2.5,
                      background: '#F9FAFB',
                      borderBottom: '1px solid #E2E8F0',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSectionCollapsed((v) => !v)}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 800, color: '#0F172A', fontSize: 20, letterSpacing: -0.3, flex: 1 }}>
                        Estimation R{activeRevision}
                      </Typography>
                      {/* Status Badge */}
                      {estimate?.is_approved && (
                        <Chip icon={<CheckIcon sx={{ fontSize: '13px !important' }} />} label="Approved" size="small"
                          sx={{ height: 24, fontSize: 11, fontWeight: 700, backgroundColor: '#E2E8F0', color: '#14532d', border: '1px solid #CBD5E1', '& .MuiChip-icon': { color: '#166534' } }} />
                      )}
                      {estimate && !estimate.is_approved && (
                        <Chip label="Draft" size="small"
                          sx={{ height: 24, fontSize: 11, fontWeight: 600, backgroundColor: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }} />
                      )}
                      <Chip
                        label={`${customParts.length} Part${customParts.length !== 1 ? 's' : ''}`}
                        size="small"
                        sx={{ height: 24, backgroundColor: '#F1F5F9', color: '#475569', fontSize: 11, fontWeight: 600, border: '1px solid #E2E8F0' }}
                      />
                      {/* Edit button */}
                      {!isEditMode && estimate && (
                        <Button size="small" variant="outlined" startIcon={<EditIcon sx={{ fontSize: 14 }} />}
                          onClick={(e) => { e.stopPropagation(); setIsEditMode(true); }}
                          sx={{ py: 0.5, px: 1.5, fontSize: 12, fontWeight: 600, textTransform: 'none', color: '#64748B', border: '1px solid #CBD5E1', borderRadius: '10px', '&:hover': { background: '#F1F5F9', borderColor: '#94A3B8', color: '#475569' }, transition: 'all 0.15s' }}>
                          Edit
                        </Button>
                      )}
                      {/* Copy Revision button */}
                      {estimate && (
                        <Button size="small" variant="outlined" startIcon={<CopyIcon sx={{ fontSize: 14 }} />}
                          onClick={(e) => { e.stopPropagation(); handleCopyRevision(); }}
                          disabled={copyingRevision}
                          sx={{
                            py: 0.5, px: 1.5, fontSize: 12, fontWeight: 600, textTransform: 'none',
                            color: '#166534', border: '1px solid #166534',
                            borderRadius: '10px', backgroundColor: '#ECFDF5',
                            opacity: copyingRevision ? 0.6 : 1,
                            '&:hover': { backgroundColor: '#DCFCE7', borderColor: '#16A34A', color: '#16A34A' },
                            transition: 'all 0.15s',
                          }}>
                          {copyingRevision ? 'Copying...' : 'Copy'}
                        </Button>
                      )}
                      {/* Delete button (if multiple revisions exist) */}
                      {estimate && allRevisions.length > 1 && (
                        <Button size="small" variant="outlined" startIcon={<DeleteIcon sx={{ fontSize: 14 }} />}
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirmOpen(true); }}
                          sx={{ py: 0.5, px: 1.5, fontSize: 12, fontWeight: 600, textTransform: 'none', color: '#dc2626', border: '1px solid #dc2626', borderRadius: '10px', backgroundColor: '#fef2f2', '&:hover': { backgroundColor: '#fee2e2', borderColor: '#b91c1c', color: '#b91c1c' }, transition: 'all 0.15s' }}>
                          Delete
                        </Button>
                      )}
                      {/* Collapse icon */}
                      {sectionCollapsed ? <ExpandMoreIcon sx={{ color: '#64748B' }} /> : <ExpandLessIcon sx={{ color: '#64748B' }} />}
                    </Box>

                    <Collapse in={!sectionCollapsed}>
                      <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
                        {customParts.map((part, index) => {
                          const partTotal = getPartTotal(part);
                          const isExpanded = expandedParts.has(part.id);
                          return (
                            <Card
                              key={part.id} data-part-id={part.id} variant="outlined"
                              sx={{
                                mb: 3,
                                border: showEstValidation && !isPartValid(part) ? '2px solid #ef4444' : '1px solid #E2E8F0',
                                borderRadius: '14px', overflow: 'hidden',
                                boxShadow: showEstValidation && !isPartValid(part)
                                  ? '0 0 0 3px rgba(239,68,68,0.15)'
                                  : isExpanded ? '0 2px 12px rgba(0,0,0,0.06)' : '0 1px 2px rgba(0,0,0,0.03)',
                                transition: 'all 0.2s ease',
                                '&:hover': { boxShadow: isExpanded ? '0 4px 16px rgba(0,0,0,0.08)' : '0 2px 8px rgba(0,0,0,0.06)' },
                              }}
                            >
                              {/* Part Header */}
                              <Box sx={{
                                display: 'flex', alignItems: 'center', px: 2.5, py: 1.5,
                                backgroundColor: isExpanded ? '#F8FAFC' : '#FAFBFC',
                                borderBottom: isExpanded ? '1px solid #E2E8F0' : 'none',
                                transition: 'background-color 0.15s',
                              }}>
                                <Box sx={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => toggleExpandPart(part.id)}>
                                  <Typography variant="subtitle2" fontWeight={700} color="#166534" noWrap sx={{ fontSize: 14 }}>
                                    #{padIndex(index + 1)}{' '}
                                    <Typography component="span" sx={{ fontWeight: 700, color: '#166534' }}>
                                      {part.job_description || 'Job Description'}
                                    </Typography>
                                    <Typography component="span" sx={{ color: '#94A3B8', mx: 0.75 }}> &mdash; </Typography>
                                    <Typography component="span" sx={{ color: '#64748B', fontWeight: 500 }}>
                                      {part.material || 'Material'}
                                    </Typography>
                                    <Typography component="span" sx={{ color: '#94A3B8', mx: 0.75 }}> &mdash; </Typography>
                                    <Typography component="span" sx={{ color: '#64748B', fontWeight: 500 }}>
                                      {part.drawing_part_no || 'Drawing No.'}
                                    </Typography>
                                  </Typography>
                                </Box>
                                <Typography sx={{
                                  color: '#166534', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1',
                                  px: 1.5, py: 0.25, borderRadius: '8px', mr: 1.5, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                                }}>
                                  $ {partTotal.toFixed(0)}
                                </Typography>
                                {!fieldReadOnly && (
                                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mr: 0.5 }}>
                                    <Tooltip title="Duplicate Part" arrow>
                                      <IconButton size="small" onClick={() => handleCopyPart(part)}
                                        sx={{ color: '#94A3B8', '&:hover': { color: '#166534', background: '#F8FAFC' } }}>
                                        <CopyIcon sx={{ fontSize: 15 }} />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete Part" arrow>
                                      <IconButton size="small" onClick={() => handleDeletePart(part.id)}
                                        sx={{ color: '#94A3B8', '&:hover': { color: '#EF4444', background: '#fef2f2' } }}>
                                        <DeleteIcon sx={{ fontSize: 15 }} />
                                      </IconButton>
                                    </Tooltip>
                                  </Stack>
                                )}
                                <IconButton size="small" onClick={() => toggleExpandPart(part.id)}
                                  sx={{ color: '#94A3B8', '&:hover': { color: '#475569' } }}>
                                  {isExpanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
                                </IconButton>
                              </Box>

                              {/* Part Form Body - condensed version for space */}
                              <Collapse in={isExpanded}>
                                <Box sx={{ p: 2 }}>
                                  <Grid container spacing={2}>
                                    <Grid item xs={12} sm={6}>
                                      <TextField fullWidth size="small" label="Job Description" required
                                        value={part.job_description} onChange={(e) => handleUpdatePart(part.id, 'job_description', e.target.value)}
                                        disabled={fieldReadOnly} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                      <TextField fullWidth size="small" label="Material" value={part.material}
                                        onChange={(e) => handleUpdatePart(part.id, 'material', e.target.value)} disabled={fieldReadOnly}
                                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                      <TextField fullWidth size="small" label="Unit Price" type="number" value={part.job_cost_per_unit}
                                        onChange={(e) => handleUpdatePart(part.id, 'job_cost_per_unit', e.target.value)} disabled={fieldReadOnly}
                                        InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                      <TextField fullWidth size="small" label="Quantity" type="number" value={part.quantity}
                                        onChange={(e) => handleUpdatePart(part.id, 'quantity', e.target.value)} disabled={fieldReadOnly}
                                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
                                    </Grid>
                                  </Grid>
                                </Box>
                              </Collapse>
                            </Card>
                          );
                        })}

                        {/* Add New Part */}
                        {!fieldReadOnly && (
                          <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={handleAddPart}
                              sx={{ py: 0.75, px: 3, fontSize: 12, fontWeight: 600, textTransform: 'none', borderColor: '#CBD5E1', 
                                   color: '#64748B', borderRadius: '10px', borderStyle: 'dashed', borderWidth: 1.5,
                                   '&:hover': { background: '#F8FAFC', borderColor: '#166534', color: '#166534' } }}>
                              Add New Part
                            </Button>
                          </Box>
                        )}

                        {/* Process Modules */}
                        {(estimate?.items?.length ?? 0) > 0 && estimate?.items?.map((item) => (
                          <ProcessModuleCard key={item.id} item={item} expanded={expandedItems.has(item.id)}
                            onToggle={() => toggleExpand(item.id)} onUpdate={(inputs) => handleUpdateItem(item, inputs)}
                            onDelete={() => handleDeleteItem(item.id)} onCopy={() => handleCopyItem(item)}
                            readOnly={!isEditMode} isNew={item.id === newlyAddedModuleId} />
                        ))}

                        {/* Save / Cancel */}
                        {isEditMode && (
                          <Box sx={{ mt: 3, pt: 2.5, borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
                            <Button variant="outlined" size="small" onClick={() => setIsEditMode(false)}
                              sx={{ borderColor: '#CBD5E1', color: '#64748B', textTransform: 'none', borderRadius: '10px', 
                                   px: 3, py: 0.75, fontWeight: 600, fontSize: 13, '&:hover': { borderColor: '#94A3B8', background: '#F8FAFC' } }}>
                              Cancel
                            </Button>
                            <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={handleSaveParts} disabled={saving}
                              sx={{ background: '#166534', textTransform: 'none', borderRadius: '10px', px: 3, py: 0.75, fontWeight: 700, fontSize: 13,
                                   boxShadow: '0 2px 4px rgba(22,101,52,0.08)', '&:hover': { background: '#166534', boxShadow: '0 4px 12px rgba(22,101,52,0.15)', transform: 'translateY(-1px)' } }}>
                              {saving ? 'Saving...' : 'Save'}
                            </Button>
                          </Box>
                        )}
                      </CardContent>
                    </Collapse>
                  </Card>
                </Grid>

                {/* ===== COST SUMMARY SIDEBAR ===== */}
                <Grid item xs={12} md={3}>
                  <Card sx={{
                    borderRadius: '16px', boxShadow: '0 4px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
                    border: '1px solid #E2E8F0', overflow: 'hidden', position: 'sticky', top: 16, backgroundColor: '#FFFFFF',
                  }}>
                    <Box sx={{ px: 3, py: 2, background: '#F9FAFB', borderBottom: '1px solid #E2E8F0' }}>
                      <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: 16, letterSpacing: -0.2 }}>
                        Cost Summary
                      </Typography>
                    </Box>
                    <CardContent sx={{ p: 3 }}>
                      {/* Parts Cost */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.25, borderBottom: '1px solid #F1F5F9' }}>
                        <Box>
                          <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>Parts Cost</Typography>
                          <Typography sx={{ fontSize: 10, color: '#94A3B8' }}>{customParts.length} part{customParts.length !== 1 ? 's' : ''}</Typography>
                        </Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>$ {Math.round(partsTotal).toLocaleString()}</Typography>
                      </Box>
                      {/* Process Cost */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.25, borderBottom: '1px solid #F1F5F9' }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>Process Cost</Typography>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>$ {Math.round(processCost).toLocaleString()}</Typography>
                      </Box>
                      {/* Overhead */}
                      <Box sx={{ py: 1.5, borderBottom: '1px solid #F1F5F9' }}>
                        <TextField fullWidth size="small" label="Overhead" type="number" value={overheadCost}
                          onChange={(e) => { setOverheadCost(e.target.value); setHasUnsavedChanges(true); }}
                          onBlur={(e) => setOverheadCost(parseFloat(e.target.value) || 0)} disabled={fieldReadOnly}
                          InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                        />
                      </Box>

                      <Divider sx={{ my: 1.5 }} />

                      {/* Total Cost */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5, px: 2, 
                               backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', mb: 1.5 }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Total Cost</Typography>
                        <Typography sx={{ fontSize: 15, fontWeight: 800, color: '#1E293B' }}>$ {Math.round(totalCost).toLocaleString()}</Typography>
                      </Box>

                      {/* Margin */}
                      <Box sx={{ py: 1.5 }}>
                        <TextField fullWidth size="small" label="Margin" type="number" value={marginPercent}
                          onChange={(e) => { setMarginPercent(e.target.value); setHasUnsavedChanges(true); }}
                          onBlur={(e) => setMarginPercent(parseFloat(e.target.value) || 0)} disabled={fieldReadOnly}
                          InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                        />
                      </Box>

                      {/* FINAL PRICE */}
                      <Box sx={{ mt: 2, p: 3, borderRadius: '16px', background: '#166534', textAlign: 'center', 
                               boxShadow: '0 8px 24px rgba(22,101,52,0.15)', position: 'relative', overflow: 'hidden' }}>
                        <Typography sx={{ color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1.5, 
                                         fontSize: 10, fontWeight: 800, mb: 0.5 }}>Final Price</Typography>
                        <Typography sx={{ color: '#FFFFFF', fontWeight: 900, fontSize: 32, letterSpacing: -1, lineHeight: 1.1 }}>
                          $ {Math.round(finalPrice).toLocaleString()}
                        </Typography>
                        {margin > 0 && (
                          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, mt: 0.5 }}>
                            incl. {margin}% margin ($ {Math.round(totalCost * margin / 100).toLocaleString()})
                          </Typography>
                        )}
                      </Box>

                      {/* Approve button */}
                      {!estimate?.is_approved && !isEditMode && !hasUnsavedChanges && estimate && (
                        <Box sx={{ mt: 2.5 }}>
                          <Button fullWidth variant="contained" startIcon={<ApproveIcon />} onClick={handleApprove} disabled={saving}
                            sx={{ background: '#166534', borderRadius: '12px', py: 1.25, textTransform: 'none', fontWeight: 800, fontSize: 14,
                                 boxShadow: '0 4px 16px rgba(22,101,52,0.08)', '&:hover': { boxShadow: '0 6px 24px rgba(22,101,52,0.2)', transform: 'translateY(-1px)' } }}>
                            {saving ? 'Approving...' : 'Approve Estimate'}
                          </Button>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
          )}
        </Box>
      </Box>

      {/* Comparison Panel */}
      {showComparison && allRevisions.length > 1 && (
        <Box sx={{ mt: 3, bgcolor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden',
                 boxShadow: '0px 2px 6px rgba(0,0,0,0.04), 0px 10px 25px rgba(0,0,0,0.06)' }}>
          <Box sx={{ px: 3, py: 2, background: '#F9FAFB', borderBottom: '1px solid #E2E8F0' }}>
            <Typography sx={{ fontWeight: 700, color: '#0F172A', fontSize: 16 }}>Revision Comparison</Typography>
          </Box>
          <Box sx={{ p: 3 }}>
            <Grid container spacing={2}>
              {allRevisions.map((rev) => {
                const revParts = Array.isArray(rev.custom_parts) ? rev.custom_parts : [];
                const revPartsTotal = revParts.reduce((sum: number, p: any) => sum + ((parseFloat(String(p.quantity)) || 0) * (parseFloat(String(p.unit_price)) || 0)), 0);
                return (
                  <Grid item xs={12} sm={6} md={4} key={rev.revision}>
                    <Box sx={{ border: '1px solid #E2E8F0', borderRadius: '12px', p: 2, bgcolor: rev.revision === activeRevision ? '#ECFDF5' : '#fff' }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#166534', mb: 1 }}>R{rev.revision} — {rev.is_approved ? 'Approved' : 'Draft'}</Typography>
                      <Typography sx={{ fontSize: 12, color: '#64748B' }}>Parts: {revParts.length}</Typography>
                      <Typography sx={{ fontSize: 12, color: '#64748B' }}>Total: ${Math.round(revPartsTotal).toLocaleString()}</Typography>
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          </Box>
        </Box>
      )}

      {/* Delete Revision Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle sx={{ fontWeight: 700, color: '#dc2626' }}>Delete Revision R{activeRevision}?</DialogTitle>
        <DialogContent>
          <DialogContentText>This will permanently delete Revision R{activeRevision} and all its items. This action cannot be undone.</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirmOpen(false)} sx={{ textTransform: 'none', fontWeight: 600, color: '#64748B' }}>Cancel</Button>
          <Button onClick={handleDeleteRevision} variant="contained" disabled={deletingRevision}
            sx={{ textTransform: 'none', fontWeight: 600, bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' } }}>
            {deletingRevision ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};