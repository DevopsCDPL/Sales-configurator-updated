# Railway Deployment Troubleshooting & Fix Guide

## Current Status
- ✅ **Git**: All commits properly pushed to GitHub (latest: `c7399ea`)
- ✅ **Fixes**: Settings persistence (commit `2a8f6e2`) fully committed
- ✅ **Build triggers**: Multiple version bumps pushed to force rebuild
- ⏳ **Railway**: May not have detected latest pushes (webhook issue suspected)

## The Settings Fixes Included (Commit 2a8f6e2)

### Backend Changes
1. **Settings Service** - Added save verification (retry logic)
   - After each write: immediately read back to verify
   - Auto-retry once if verification fails
   - Ensures settings persist to database

2. **Settings Controller** - Response verification  
   - All endpoints verify data was saved
   - Returns timestamps for debugging
   - Enhanced error messages

3. **Routes** - Removed duplicate auth
   - Cleaner global middleware (no per-route duplication)

### Frontend Changes
1. **Settings Page** - Fixed ref syncing
   - `useEffect` keeps `companyDraftRef` in sync with state
   - Prevents settings from resetting on page refresh
   - Settings stay saved after reload

2. **Form Sync** - JSON comparison instead of reference equality
   - Properly detects changes after server updates
   - Syncs form when data reloads

3. **Cache Busting** - Timestamp + headers
   - `?_t=Date.now()` prevents cache
   - `Cache-Control: no-cache` headers
   - PDF always gets fresh company data

## Why Railway May Show Old Deployment

**Possible Causes:**
1. GitHub webhook not triggered or delayed
2. Railway auto-deploy setting disabled
3. Build cache preventing new deployment
4. Deployment service not detecting branch changes
5. PIN or manual review required

## Immediate Action Steps

### Option 1: Manual Rebuild in Railway Dashboard (Recommended)
1. Go to: https://railway.com/project/8c05a3d6-0e40-4600-b1f8-3b154fe2977c
2. Click **forged-idas** service → **Deployments** tab
3. Click the latest deployment → **Redeploy this commit** OR
4. Click **Deploy** → **Redeploy latest commit**
5. Wait 2-5 minutes for build to complete
6. Services will restart with new code

### Option 2: Check Railway Settings
1. In Railway, go to **forged-idas** service → **Settings**
2. Verify **Source** is set to GitHub repository
3. Verify **Branch** is set to `main`
4. Check if "Auto Deploy" is **enabled**
5. If not enabled, click **Enable** and trigger manual deploy

### Option 3: Verify GitHub App Connection
1. In Railway project, go to **Settings** → **Variables**
2. Look for GitHub-related configuration
3. Ensure Railway's GitHub App has permission to: `cdpltech/forged-idas`
4. If permissions changed, re-authenticate

## After Deployment Succeeds

### Test Settings Persistence
1. Go to Application Settings page
2. Change **Company Name** to test value
3. Click **Save** 
4. **Refresh page** (F5 or Ctrl+R)
5. ✅ Company Name should **remain as entered** (NOT reset)
6. ✅ If it persists → Fix is working!

### Test PDF Updates
1. Go to Settings, change company info
2. Generate a Quotation/Invoice PDF
3. ✅ PDF should show new company details
4. ✅ Change should be reflected immediately

### Verify Cache-Busting
1. Open Dev Tools (F12)
2. Go to Network tab
3. In Settings page, save a change
4. Check API request URL contains timestamp: `?_t=1234567890`
5. ✅ Timestamp proves cache-busting is working

## If Still No Update After 10 Minutes

**Nuclear Option - Force Push:**
```bash
git push origin main --force-with-lease
```
This will force GitHub/Railway to see a new change.

**Check Deployment Logs:**
1. In Railway dashboard, click service
2. Click **Deployments** tab
3. Click latest deployment
4. Click **View logs** button (top right)
5. Look for build errors preventing deployment

## Expected Behavior After Fix

| Action | Before | After |
|--------|--------|-------|
| Change setting | ✗ Resets on refresh | ✅ Persists after refresh |
| PDF generation | ✗ Shows old company info | ✅ Shows latest info |
| API requests | ✗ Gets cached data | ✅ Fresh data every time |
| Browser cache | ✗ Stale settings persist | ✅ Bypassed with timestamps |

## Git Commit References

- **2a8f6e2**: Settings persistence & PDF refresh ALL fixes
- **e69127f**: Deployment trigger comment
- **97d324c**: Backend version bump
- **a867afa**: Documentation  
- **c7399ea**: Frontend version bump (latest)

## Verification Checklist

- [x] All fixes committed to git
- [x] All fixes pushed to GitHub origin/main
- [x] Git remote configured correctly
- [x] Branch tracking is correct
- [x] Multiple version bumps to force rebuild
- [ ] Railway detected latest push
- [ ] Railway successfully built both services
- [ ] Services are ACTIVE with latest commit
- [ ] Settings persist after page refresh
- [ ] PDF shows latest company data

---

**Last Updated:** 2026-03-16 22:05 UTC
**Latest Commit:** c7399ea
**Status:** Awaiting Railway deployment of latest commit
