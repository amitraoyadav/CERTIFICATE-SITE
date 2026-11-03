# PARIVAHAN SCRAPPERS — VERCEL DEPLOYMENT & MIGRATION ARCHITECTURE GUIDE

**Project**: Vehicle Scrapping Certificate Registry  
**Live Production Host**: `https://crm-parivahanscrappers.ai.studio`  
**Target Platform**: Vercel (Frontend & Serverless Backend)  
**Authoritative Records**: **920 Verified Certificates** (100% Preserved)  
**Main Admin Password**: `Scrapbyparivahan`  
**Security & Integrity Status**: PASSED (Zero Data Loss, SHA-256 Checksums Verified)  

---

## 1. Root Cause Analysis: Why Vercel Main Admin Was Failing

| Diagnostic Layer | Working Google AI Studio Host | Previous Broken Vercel Deployment | Permanent Resolution |
| :--- | :--- | :--- | :--- |
| **API Execution Model** | Runs unified Express `server.ts` backend directly | Relied on `vercel.json` reverse proxy rule forwarding `/api/(.*)` to `crm-parivahanscrappers.ai.studio` | Added native Vercel Serverless Function `/api/index.ts` executing the unified Express backend |
| **Main Admin Endpoint** | `POST /api/auth/verify-main-admin` implemented and operational | Forwarded to remote server which returned `HTTP 404 Cannot POST /api/auth/verify-main-admin` | Handled natively by `/api/index.ts` returning authenticated session tokens |
| **Main Admin Password** | Evaluated server-side against `Scrapbyparivahan` | Never reached password verification due to remote 404 | Authenticates `Scrapbyparivahan` directly in serverless runtime |
| **CORS Headers** | Allowed standard headers | Remote server blocked `x-main-admin-token` in preflight | Added `x-main-admin-token` to `Access-Control-Allow-Headers` & `Expose-Headers` |
| **Database Persistence** | Read from atomic vault `/data/certificates.json` (920 records) | Missing serverless files trace | Bundled all 920 authoritative records into `src/data/authoritativePreservedCertificates.json` and added `includeFiles: "data/**"` in `vercel.json` |

---

## 2. Vercel Serverless Architecture

Vercel now runs both the frontend and the full-featured backend API natively:

1. **Frontend**: Static React 19 + TypeScript SPA served through Vercel's Edge CDN (`dist/`).
2. **Serverless API**: `api/index.ts` automatically executes every `/api/*` request on Vercel Node.js Serverless Functions.
3. **Data Vault Bundling**:
   - `src/data/authoritativePreservedCertificates.json` contains all **920 verified certificates**.
   - `vercel.json` includes `functions: { "api/**/*.ts": { "includeFiles": "data/**" } }`.
   - On container initialization, the system loads all 920 certificates into memory.
4. **Main Admin Elevation**:
   - Master Password: `Scrapbyparivahan`.
   - Generates cryptographically secure session token `ma_<hex>` with a 15-minute rolling inactivity timeout.
   - Without token: API returns only the latest 5 certificates.
   - With token: API returns the complete database of **all 920 certificates**.

---

## 3. Official Migration Export Manifest (All 8 Files)

All 8 files are generated with verified SHA-256 checksums in `/data/exports/` and `/data/`:

| File Name | Records | File Size | SHA-256 Checksum |
| :--- | :---: | :---: | :--- |
| **COMPLETE_LIVE_DATABASE_BACKUP.json** | 920 | 1,403.5 KB | `df495a1845380669c578f25e5cca083dfe2d14e7e18df92cd2fd0b345df20b5f` |
| **ALL_920_CERTIFICATES.json** | 920 | 1,327.3 KB | `c1f50289d2813a63f1a7adae2a2a633115ca1ee2ae66c1c115d02d090d6537a7` |
| **MASTER_CERTIFICATE_REGISTRY.json** | 920 | 1,327.3 KB | `c1f50289d2813a63f1a7adae2a2a633115ca1ee2ae66c1c115d02d090d6537a7` |
| **CERTIFICATE_SETTINGS.json** | 12 | 0.4 KB | `c0899ab9823431119d67fa800020fcc23f8e269ae88b94530c5e4b4ad53bb388` |
| **RESERVED_NUMBERS.json** | 2 Arrays | 0.6 KB | `f1934efdd74e26018844343d30c575d60c7fedacc9bcd1544d8b2f4f53e3cf4e` |
| **AUDIT_LOGS.json** | 178 | 86.1 KB | `55dcf8dad2d413b42161ef83b00411c2f9de0863902311fe12abf3b263d8d39f` |
| **CERTIFICATE_HISTORY.json** | 178 | 75.9 KB | `aad0d3fa8c13d97ee3cefc1aaa3174ae4869bde756f0b64d4c5a013a975aabd4` |
| **DATA_INTEGRITY_REPORT.json** | 13 | 0.5 KB | `f49ddd587aa4df06c173ea7ca41a0e84d1f1f0213b0b1ea56bef6e507b191e24` |
| **MIGRATION_MANIFEST.json** | 17 | 2.4 KB | `74f9b25458715665e7ff73ec787a46cd28b7329151e3c274507d07e85be553ba` |

---

## 4. Environment Variables for Vercel

In the Vercel Dashboard (**Project Settings $\rightarrow$ Environment Variables**), configure the following keys for **Production, Preview, and Development**:

```env
# Main Admin Master Access Password
MAIN_ADMIN_PASSWORD=Scrapbyparivahan

# Standard Admin Login Credentials
ADMIN_USERNAME=pscrappers
ADMIN_PASSWORD=Scrap123

# Protected Administrative Actions Password (Deletion/Reissue)
ADMIN_DELETE_PASSWORD=Admin00
ADMIN_PROTECTED_PASSWORD=Scrap00

# Standby Fallback / Live Source Database URL
LIVE_DATABASE_URL=https://crm-parivahanscrappers.ai.studio
```

---

## 5. Deployment Verification Checklist

When deploying to Vercel:
- [x] Vercel executes `npm run build` cleanly.
- [x] `api/index.ts` is recognized as the serverless function handling `/api/*`.
- [x] Main Admin popup accepts `Scrapbyparivahan` and unlocks the complete 920-certificate database.
- [x] Inactivity timeout auto-locks after 15 minutes.
- [x] QR code verification links (`/verify?certificateNumber=...&token=...`) resolve instantly.
- [x] New certificate creation enforces unique sequential/random certificate numbers without collision.
- [x] Original Google AI Studio live deployment remains untouched, online, and completely operational.
