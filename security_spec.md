# Security Specification & Payload-First Verification

## 1. Data Invariants
1. **User Isolation**: Every document in `/users/{userId}`, `/users/{userId}/subjects/{subjectId}`, `/users/{userId}/templates/{templateId}`, and `/users/{userId}/documents/{documentId}` belongs strictly to the authenticated, email-verified user whose `request.auth.uid == userId` and `data.ownerId == request.auth.uid`.
2. **Immutable Ownership & Creation Time**: On `update`, `ownerId` and `createdAt` must remain identical to `existing()`.
3. **Strict Temporal Integrity**: `createdAt` on create and `updatedAt` on create/update must equal `request.time`.
4. **Volumetric Bounds**: Every string field enforces `.size()` limits, every array enforces bounded length, and document IDs match `^[a-zA-Z0-9_\-]+$` up to 128 characters.
5. **No Shadow Fields**: Every write validates exact allowed keys using `hasAll()` and `hasOnly()` on create, and `affectedKeys().hasOnly()` on update.

## 2. Adversarial Test Vectors ("Dirty Dozen")
1. Unauthenticated read on `/users/uid1/documents/doc1` -> `PERMISSION_DENIED`
2. Unverified email user writing `/users/uid1` -> `PERMISSION_DENIED`
3. Cross-user read `/users/uid2/documents/doc1` by `uid1` -> `PERMISSION_DENIED`
4. Cross-user write with spoofed `ownerId: "uid2"` under `/users/uid1` -> `PERMISSION_DENIED`
5. Shadow field injection (`isAdmin: true`) on `/users/uid1/documents/doc1` -> `PERMISSION_DENIED`
6. Oversized ID poisoning (200-char doc ID) -> `PERMISSION_DENIED`
7. Invalid ID characters (`doc/../../etc`) -> `PERMISSION_DENIED`
8. Client-forged `createdAt` timestamp not equal to `request.time` -> `PERMISSION_DENIED`
9. Mutating `ownerId` or `createdAt` during document update -> `PERMISSION_DENIED`
10. Invalid `status` enum (`status: "hacked"`) on `ExamDocument` -> `PERMISSION_DENIED`
11. Oversized `rawText` (> 200,000 chars) or `schoolName` (> 200 chars) -> `PERMISSION_DENIED`
12. Blanket list query on `/users/uid2/documents` by `uid1` -> `PERMISSION_DENIED`
