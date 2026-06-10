#!/usr/bin/env node
'use strict';

/**
 * tps-sw-agent — Phase E spec §3 (pull-based SolidWorks agent, skeleton)
 *
 * Runs on the Windows machine that has SolidWorks + a license. PULLS
 * jobs from the SWGPLAY backend over HTTPS — no inbound connection, no
 * ngrok, no firewall holes. Wraps TPS's existing SolidWorks automation
 * via the RUN_CMD hook.
 *
 * Install (Windows):
 *   1. Install Node 20+.
 *   2. Set environment (or edit CONFIG below):
 *        SWG_BACKEND_URL   https://swgplay-production.up.railway.app
 *        SWG_AGENT_TOKEN   <ApiToken with scope solidworks-agent>
 *        SWG_AGENT_ID      <uuid from configurator_solidworks_agents>
 *        SWG_RUN_CMD       powershell -File C:\\tps\\run-solidworks.ps1
 *   3. node tps-sw-agent.js   (wrap with NSSM/sc.exe for a service)
 *
 * Contract with the automation script (SWG_RUN_CMD):
 *   stdin  ← job payload JSON (Phase E §4)
 *   stdout → result JSON: { artifacts:[{key,format,path}], copper:{total_lbs, perSection} }
 *   exit 0 = success; non-zero = failure (stderr → error message)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  backendUrl: process.env.SWG_BACKEND_URL || 'http://localhost:5000',
  token: process.env.SWG_AGENT_TOKEN || '',
  agentId: process.env.SWG_AGENT_ID || '',
  runCmd: process.env.SWG_RUN_CMD || '',
  pollSeconds: Number(process.env.SWG_POLL_SECONDS || 15),
  heartbeatSeconds: 60,
  supportedVersions: ['1.0'],
  jobTypes: ['FULL', 'DRAWINGS', 'COPPER_ONLY'],
  workDir: process.env.SWG_WORK_DIR || path.join(process.cwd(), 'sw-jobs'),
};

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function api(p, body) {
  const res = await fetch(`${CONFIG.backendUrl}/api/configurator-v2${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CONFIG.token}` },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`${p} → HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function uploadArtifacts(jobId, artifacts, copper) {
  // v1: register artifact manifest + copper inline. Large-file multipart
  // upload to /agent/:jobId/artifacts is the follow-up — manifest carries
  // local paths meanwhile (Phase E §5.1 NATIVE_REF pattern).
  return api(`/agent/${jobId}/complete`, { agentId: CONFIG.agentId, artifacts, copper });
}

function runAutomation(job, onCancelCheck) {
  return new Promise((resolve, reject) => {
    if (!CONFIG.runCmd) {
      // Skeleton mode: no CAD hook configured — simulate for pipeline testing.
      log('SWG_RUN_CMD not set — SIMULATING job', job.id, job.job_type);
      const est = job.payload?.bus?.estimatedCopperLbs ?? 500;
      setTimeout(() => resolve({
        artifacts: [{ key: 'REPORT', format: 'json', note: 'simulated run — configure SWG_RUN_CMD' }],
        copper: { total_lbs: Math.round(est * 1.02 * 100) / 100, perSection: null, simulated: true },
      }), 3000);
      return;
    }
    const [cmd, ...args] = CONFIG.runCmd.split(' ');
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const killer = setInterval(async () => {
      if (await onCancelCheck()) {
        clearInterval(killer);
        child.kill('SIGTERM');
        reject(Object.assign(new Error('cancelled by user'), { code: 'SW_CRASH' }));
      }
    }, 10000);
    const timeout = setTimeout(() => {
      clearInterval(killer);
      child.kill('SIGKILL');
      reject(Object.assign(new Error(`watchdog: exceeded ${job.timeout_min} min`), { code: 'SW_HUNG' }));
    }, (job.timeout_min || 45) * 60 * 1000);

    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (codeNum) => {
      clearTimeout(timeout);
      clearInterval(killer);
      if (codeNum === 0) {
        try { resolve(JSON.parse(out)); }
        catch { reject(Object.assign(new Error('automation returned invalid JSON'), { code: 'GEOMETRY_FAIL' })); }
      } else {
        const code = /license/i.test(err) ? 'LICENSE_UNAVAILABLE'
          : /template/i.test(err) ? 'TEMPLATE_MISSING' : 'SW_CRASH';
        reject(Object.assign(new Error(err.slice(0, 2000) || `exit ${codeNum}`), { code }));
      }
    });
    child.stdin.write(JSON.stringify(job.payload));
    child.stdin.end();
  });
}

async function processJob(job) {
  log(`leased job ${job.id} (${job.job_type}) — switchboard ${job.switchboard_id}`);
  fs.mkdirSync(CONFIG.workDir, { recursive: true });
  fs.writeFileSync(path.join(CONFIG.workDir, `${job.id}.payload.json`), JSON.stringify(job.payload, null, 2));

  let cancelled = false;
  const hb = setInterval(async () => {
    try {
      const r = await api(`/agent/${job.id}/heartbeat`, {
        agentId: CONFIG.agentId,
        progress: { step: 'solidworks', pct: 50, message: 'running' },
      });
      if (r.cancel) cancelled = true;
    } catch (e) { log('heartbeat error:', e.message); }
  }, CONFIG.heartbeatSeconds * 1000);

  try {
    const result = await runAutomation(job, async () => cancelled);
    clearInterval(hb);
    await uploadArtifacts(job.id, result.artifacts ?? [], result.copper ?? null);
    log(`job ${job.id} SUCCEEDED`);
  } catch (e) {
    clearInterval(hb);
    log(`job ${job.id} FAILED [${e.code || 'SW_CRASH'}]: ${e.message}`);
    await api(`/agent/${job.id}/fail`, {
      agentId: CONFIG.agentId,
      errorCode: e.code || 'SW_CRASH',
      errorMessage: String(e.message).slice(0, 4000),
    }).catch((x) => log('fail-report error:', x.message));
  }
}

async function main() {
  if (!CONFIG.token || !CONFIG.agentId) {
    console.error('SWG_AGENT_TOKEN and SWG_AGENT_ID are required.');
    process.exit(1);
  }
  log(`tps-sw-agent started — backend ${CONFIG.backendUrl}, poll ${CONFIG.pollSeconds}s, cmd: ${CONFIG.runCmd || '(SIMULATION MODE)'}`);
  // single-flight loop: SolidWorks is one session per machine
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const { job } = await api('/agent/next', {
        agentId: CONFIG.agentId,
        supportedVersions: CONFIG.supportedVersions,
        jobTypes: CONFIG.jobTypes,
      });
      if (job) await processJob(job);
      else await sleep(CONFIG.pollSeconds * 1000);
    } catch (e) {
      log('poll error:', e.message);
      await sleep(CONFIG.pollSeconds * 1000);
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
main();
