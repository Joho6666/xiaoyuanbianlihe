# OpenID Client Exposure Audit

Audit date: 2026-09-09. OpenID remains a legacy server-side identity key only.

| Area | Status | Resolution |
|---|---|---|
| DM subscription notification route | fixed | Uses `/pages/chat/chat?targetUserId=<public-user-id>`; server resolves internally. |
| Heart navigation | safe | Uses `targetUserId`; no OpenID query value. |
| Buddy, Bridge, Mutual, Market chat routes | fixed | Use `targetUserId` query names and public user IDs. |
| Profile navigation | fixed | Uses `userId` query names and public user IDs. |
| Conversation response | fixed | Internal `targetOpenid` storage is mapped to public `targetUserId` before the response reaches the client. |
| Logs | safe by policy | Heart event metadata permits only aggregate counts; no OpenID, photos, bio, or contact details. |

Internal CloudBase storage and cloud-function compatibility fields may still use OpenID. They are not valid client query parameter or public response fields.
