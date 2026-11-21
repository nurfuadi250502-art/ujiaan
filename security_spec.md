# Security Specification & Payload-First Verification

## 1. Data Invariants
1. **User Isolation & Teacher Ownership**:
   - Every document in `/users/{userId}`, `/users/{userId}/subjects/{subjectId}`, `/users/{userId}/templates/{templateId}`, and `/users/{userId}/documents/{documentId}` belongs strictly to the authenticated, email-verified user whose `request.auth.uid == userId` and `data.ownerId == request.auth.uid`.
   - Every document in `/sharedDocuments/{docId}` and `/studentScores/{scoreId}` has an immutable `ownerId == request.auth.uid` on create/update/delete, ensuring a teacher (`guru`) can never read, overwrite, or delete another teacher's exam documents or student scores.
2. **Admin Oversight & Least Privilege**:
   - Only verified Admin (`request.auth.token.email_verified == true && request.auth.token.email == 'muhammad505220@gmail.com'`, or verified `/admins/{uid}` doc for point reads/writes) can list/read all `/userProfiles`, `/sharedDocuments`, and `/studentScores` across all Ustadz/Guru.
   - Non-admin users can NEVER self-assign `role: 'admin'` in `/userProfiles/{userId}` (enforced to `'guru'` on create/update unless caller is Admin) and can NEVER write to `/admins/{adminUid}`.
3. **Immutable Ownership & Creation Time**:
   - On `update`, `ownerId` and `createdAt` (where applicable) must remain identical to `existing()`.
4. **Strict Temporal Integrity**:
   - `createdAt` on create and `updatedAt` on create/update must equal `request.time`.
5. **Volumetric Bounds**:
   - Every string field enforces `.size()` limits, `score` enforces `0 <= score <= 100`, every array enforces bounded length, and document IDs match `^[a-zA-Z0-9_\-]+$` up to 128 characters.
6. **No Shadow Fields**:
   - Every write validates exact allowed keys using `hasAll()` and `hasOnly()` on create, and `affectedKeys().hasOnly()` on update.
7. **List Cost-Optimization**:
   - Zero `get()` or `exists()` calls inside any `allow list` rule; list queries filter strictly by `ownerId == request.auth.uid` or verified admin email token.

## 2. Adversarial Test Vectors ("Dirty Dozen")
1. Unauthenticated read on `/users/uid1/documents/doc1`, `/sharedDocuments/s1`, or `/studentScores/sc1` -> `PERMISSION_DENIED`
2. Unverified email user writing `/userProfiles/uid1` or `/studentScores/sc1` -> `PERMISSION_DENIED`
3. Teacher `uid1` self-escalating `role: "admin"` on `/userProfiles/uid1` -> `PERMISSION_DENIED`
4. Teacher `uid1` writing `/admins/uid1` -> `PERMISSION_DENIED`
5. Teacher `uid1` reading or listing `/studentScores` belonging to `uid2` -> `PERMISSION_DENIED`
6. Teacher `uid1` reading or overwriting `/sharedDocuments` owned by `uid2` -> `PERMISSION_DENIED`
7. Out-of-bounds score (`score: 150` or `score: -5`) on `/studentScores/sc1` -> `PERMISSION_DENIED`
8. Shadow field injection (`isAdmin: true` or `extra: 1`) on `/studentScores/sc1` -> `PERMISSION_DENIED`
9. Oversized ID poisoning (200-char doc ID) or invalid path characters (`../etc`) -> `PERMISSION_DENIED`
10. Client-forged `createdAt` or `updatedAt` timestamp not equal to `request.time` -> `PERMISSION_DENIED`
11. Mutating `ownerId` or `createdAt` during update on `/studentScores/sc1` or `/sharedDocuments/s1` -> `PERMISSION_DENIED`
12. Blanket list query on `/userProfiles` or `/studentScores` by non-admin teacher without owner scope -> `PERMISSION_DENIED`
