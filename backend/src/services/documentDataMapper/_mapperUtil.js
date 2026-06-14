'use strict';
/** Shared null-safe helpers for the document data mappers (Item 1). */
function isoDate(v) { if (!v) return ''; const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10); }
function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
function arr(v) { return Array.isArray(v) ? v : []; }
module.exports = { isoDate, num, arr };
