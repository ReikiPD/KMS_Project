# Knowledge Management System — public source edition

Source-code showcase of a knowledge management application developed for Badan Kebijakan Transportasi, Kementerian Perhubungan. This is a curated engineering portfolio edition, not an institutional production deployment or a database distribution.

## Application

The public experience combines knowledge discovery, a filtered document/video library, work-unit navigation, announcements, and document previews. The authenticated workspace implements content authoring, version history, publication review, configurable access permissions, staff-scoped workflows, notifications, and analytics.

## Technology

- Frontend: React 19, React Router, Vite, Tailwind CSS, IDDS React components, and Lucide icons.
- Backend: Node.js, Express 5, PostgreSQL via node-postgres, and parameterized queries.
- Discovery: PostgreSQL full-text ranking and typo-tolerant search, combined with publication and work-unit visibility checks.
- Documents: PDF.js, docx-preview, SheetJS, JSZip, DOMPurify, and locally bundled PPTX rendering. Third-party licenses remain with their components.
- Delivery: Vite PWA integration, separately configurable API, and server-side media handling.

## Repository contents

Only application source, necessary build configuration, dependency manifests/lockfiles, public design assets, and third-party licenses are included. The PostgreSQL connection module is in `backend/config/db.js`.

Excluded: credentials and environment files; database schemas, migrations, seeds and dumps; operational uploads and internal records; backups; tests; helper/operations scripts; deployment infrastructure; generated builds and local artifacts. Existing Git history is not rewritten by this source update.

## Local prerequisites

Use a compatible Node.js version for the pinned dependencies. Install dependencies separately in the frontend and backend directories. The frontend can be built with `npm run build`; the backend entry point is `app.js`. Build hooks such as `officePreviewPlugin.mjs` are retained because document rendering depends on them.

This public edition intentionally does **not** provision a database. An authorized maintainer must supply a compatible PostgreSQL schema and private environment configuration outside Git before starting the full backend. No working account or password is distributed. Consult `backend/config/env.js` for required environment variable names; configure them privately, never in source code.

Project visuals and public case-study descriptions use development/demo data and are not evidence of access to confidential institutional records. No production performance, user-volume, or security certification is claimed.
