# Security Specification — Asaw AI Firestore Rules

## 1. Data Invariants
1. **Strict Ownership**: Every document under `/users/{userId}` and its subcollections (`private`, `profiles`, `sessions`, `messages`, `transcripts`) belongs strictly to the verified Firebase user whose `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
2. **PII Isolation**: User email is isolated in `/users/{userId}/private/info` and never stored on `/users/{userId}`. Only the owner can read or write it.
3. **Parent Integrity**: Subcollection writes (`profiles`, `sessions`, `transcripts`) require the parent `/users/{userId}` document to exist. Message writes under `/users/{userId}/sessions/{sessionId}/messages/{messageId}` require the parent `sessionId` document to exist and belong to `request.auth.uid`.
4. **Immutability & Temporal Integrity**: `uid`, `ownerId`, `sessionId`, and `createdAt` are immutable after creation. All `createdAt` and `updatedAt` timestamps must equal `request.time`.
5. **Bounded Payloads**: All strings, enums, and document IDs are strictly bounded in size and key allowlists (`hasAll` + `hasOnly` on create, `affectedKeys().hasOnly()` on update) to block shadow fields and resource poisoning.

## 2. "Dirty Dozen" Attack Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Read**: `GET /users/userA/profiles/p1` with `auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `CREATE /users/userA/profiles/p1` with `auth.uid == 'userA'` and `auth.token.email_verified == false` -> `PERMISSION_DENIED`.
3. **Cross-User Read**: `GET /users/userA/private/info` with `auth.uid == 'userB'` -> `PERMISSION_DENIED`.
4. **Cross-User Profile Hijack**: `CREATE /users/userA/profiles/p1` with `auth.uid == 'userB'` and `ownerId: 'userB'` -> `PERMISSION_DENIED`.
5. **OwnerId Spoofing**: `CREATE /users/userA/profiles/p1` with `auth.uid == 'userA'` and `ownerId: 'userB'` -> `PERMISSION_DENIED`.
6. **Shadow Field Injection**: `CREATE /users/userA/profiles/p1` with valid fields plus `isAdmin: true` -> `PERMISSION_DENIED`.
7. **Shadow Update Injection**: `UPDATE /users/userA/sessions/s1` changing `title` plus `ghostRole: 'admin'` -> `PERMISSION_DENIED`.
8. **Fake Timestamp Forgery**: `CREATE /users/userA/transcripts/t1` with client-supplied `createdAt` != `request.time` -> `PERMISSION_DENIED`.
9. **Immutable Owner Mutation**: `UPDATE /users/userA/profiles/p1` attempting to mutate `ownerId` or `createdAt` -> `PERMISSION_DENIED`.
10. **Orphaned Message Write**: `CREATE /users/userA/sessions/nonexistent/messages/m1` where parent session does not exist -> `PERMISSION_DENIED`.
11. **Oversized String / Resource Poisoning**: `CREATE /users/userA/profiles/p1` with `notes` > 500 chars or `profileId` > 128 chars or invalid regex -> `PERMISSION_DENIED`.
12. **Invalid Enum Value**: `CREATE /users/userA/sessions/s1/messages/m1` with `channel: 'system_hack'` or `role: 'system'` -> `PERMISSION_DENIED`.
