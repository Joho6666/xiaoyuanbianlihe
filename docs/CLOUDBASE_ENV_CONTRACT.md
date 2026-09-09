# CloudBase Environment Contract

This repository separates Mini Program runtime configuration, CLI deployment, and real Smoke credentials. The values below must never be used as substitutes for one another.

| Variable | Exclusive purpose | Safe usage |
| --- | --- | --- |
| `CLOUD_ENV_ID` | Mini Program runtime configuration | Read only from `campus_treehole/config/cloud-env.js`; it identifies the production runtime and is never a write target for automation. |
| `CLOUDBASE_ENV_ID` | CloudBase CLI deployment target | Required by deployment wrappers and `scripts/cloud-cli.js`; it must be explicit and is rejected when equal to the runtime production environment. |
| `TCB_ENV_ID` | Independent real Smoke and test-function deployment target | Required only for real Smoke writes or the independent `dbOperations` deployment check; it is rejected when equal to production. |
| `TCB_SECRET_ID` / `TCB_SECRET_KEY` | Temporary independent real Smoke credentials | Set only in the current terminal session. Never commit, print, document, or reuse them for a production environment. |

All provisioning, independent Smoke, and independent test deployment protection imports `scripts/cloudbase-target.js`. That guard derives the production ID from the one runtime configuration source; no tool may carry its own copied production ID.

The real Smoke uses temporary run-scoped data and storage paths, cleans up in `finally`, and reports `NOT RUN` when independent credentials are absent. Image content security is deliberately mocked in this runner because it would require a separately authorized WeChat content-security integration: `Real Image Content Security API: NOT RUN`.
