# Heart CloudBase Index Plan

This plan is derived from `modules/heart.js`; it is not proof that an index has been deployed.

| Collection | Query | Sort | Recommended index | Reason |
|---|---|---|---|---|
| `heart_profiles` | `enabled`, `schoolId` | `userId ASC` | `enabled ASC, schoolId ASC, userId ASC` | Discover/Fate candidate windows |
| `heart_likes` | deterministic `_id` | none | default `_id` | Per-user reaction lookup |
| `heart_matches` | `userIds` array membership | none | CloudBase array-membership index/manual validation | Match listing |
| `fate_card_usage` | deterministic `_id` | none | default `_id` | Daily transactional quota |
| `fate_card_history` | `userId` | `createdAt DESC` | `userId ASC, createdAt DESC` | Thirty-day repeat exclusion |
| `heart_events` | `userId` | `createdAt DESC` | `userId ASC, createdAt DESC` | Beta metric export |
| `heart_block_fences` | deterministic `_id` | none | default `_id` | Block race fence |

Run `npm run provision:heart -- --env <test-env>` first. With `--apply`, collection creation is attempted only for a non-production environment; indexes remain a manual checklist unless the installed CloudBase CLI can provide a verified index-create result.
