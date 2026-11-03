import {
  User,
  createUserWithEmailAndPassword,
  deleteUser,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  OperationType,
  auth,
  db,
  facebookProvider,
  googleProvider,
  handleFirestoreError,
} from '../firebase';
import {
  BLUEPRINT_LIMITS,
  computeSha256Hex,
  decryptSensitiveField,
  encryptSensitiveField,
  isValidFirestoreDocId,
  sanitizePlainText,
  validateDisplayName,
  validateEmailInput,
  validatePasswordStrength,
  verifyTotpToken,
} from '../utils/securityValidationAndCrypto';

export type AuthProviderId = 'password' | 'google.com' | 'facebook.com';

export type ComplianceAuditAction =
  | 'AUTH_REGISTER'
  | 'AUTH_LOGIN'
  | 'AUTH_LOGOUT'
  | 'AUTH_PASSWORD_RESET_REQUEST'
  | 'AUTH_EMAIL_VERIFICATION_SENT'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'
  | 'MFA_VERIFIED'
  | 'PRIVACY_CONSENT_UPDATED'
  | 'DATA_EXPORT_GDPR'
  | 'VAULT_SYNC_WRITE'
  | 'VAULT_SYNC_READ'
  | 'PROFILE_UPDATED'
  | 'ACCOUNT_ERASURE_REQUESTED';

export type ComplianceAuditCategory =
  | 'authentication'
  | 'mfa'
  | 'privacy'
  | 'data_access'
  | 'erasure';

export interface UserAccountProfile {
  uid: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  authProvider: AuthProviderId;
  mfaEnabled: boolean;
  accountStatus: 'active' | 'deleted';
  phoneNote: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface UserPrivacyConsentSettings {
  uid: string;
  policyVersion: string;
  essentialStorage: boolean;
  cloudSyncConsent: boolean;
  analyticsConsent: boolean;
  marketingConsent: boolean;
  doNotSellMyInfo: boolean;
  auditRetentionDays: number;
  updatedAtIso: string;
}

export interface ComplianceAuditEntry {
  eventId: string;
  uid: string;
  action: ComplianceAuditAction;
  category: ComplianceAuditCategory;
  actorUid: string;
  summary: string;
  ipHint: string;
  createdAtIso: string;
}

interface LocalEncryptedSecurityState {
  profile: UserAccountProfile;
  encryptedEmailCipher: string;
  encryptedPhoneCipher: string;
  encryptedTotpSecretCipher: string;
  mfaMethod: 'none' | 'totp';
  recoveryCodeHashes: string[];
  consent: UserPrivacyConsentSettings;
  auditLogs: ComplianceAuditEntry[];
}

export const CURRENT_PRIVACY_POLICY_VERSION = '2026.10-GDPR-CCPA';

function getLocalSecurityKey(uid: string): string {
  return `hyperlog_sec_vault_v1_${uid}`;
}

function getMfaSessionVerifiedKey(uid: string): string {
  return `hyperlog_mfa_verified_session_${uid}`;
}

export function isSessionMfaVerified(uid: string): boolean {
  try {
    return window.sessionStorage.getItem(getMfaSessionVerifiedKey(uid)) === '1';
  } catch {
    return false;
  }
}

export function setSessionMfaVerified(uid: string, verified: boolean): void {
  try {
    if (verified) {
      window.sessionStorage.setItem(getMfaSessionVerifiedKey(uid), '1');
    } else {
      window.sessionStorage.removeItem(getMfaSessionVerifiedKey(uid));
    }
  } catch {
    // Ignore sessionStorage errors
  }
}

function resolveProviderId(user: User): AuthProviderId {
  const providers = user.providerData.map((p) => p.providerId);
  if (providers.includes('google.com')) return 'google.com';
  if (providers.includes('facebook.com')) return 'facebook.com';
  return 'password';
}

function getClientOriginHint(): string {
  try {
    const host = window.location.hostname || 'web-client';
    return sanitizePlainText(`https://${host}`, BLUEPRINT_LIMITS.IP_HINT_MAX);
  } catch {
    return 'https://web-client';
  }
}

function readLocalSecurityState(uid: string): LocalEncryptedSecurityState | null {
  try {
    const raw = window.localStorage.getItem(getLocalSecurityKey(uid));
    if (!raw) return null;
    return JSON.parse(raw) as LocalEncryptedSecurityState;
  } catch {
    return null;
  }
}

function writeLocalSecurityState(uid: string, state: LocalEncryptedSecurityState): void {
  try {
    window.localStorage.setItem(getLocalSecurityKey(uid), JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

function clearAllLocalUserKeys(uid: string): void {
  try {
    window.localStorage.removeItem(getLocalSecurityKey(uid));
    window.localStorage.removeItem(`hyperlog_vault_pepper_${uid}`);
    window.sessionStorage.removeItem(getMfaSessionVerifiedKey(uid));
  } catch {
    // Ignore storage errors
  }
}

export function buildDefaultPrivacyConsent(uid: string): UserPrivacyConsentSettings {
  return {
    uid,
    policyVersion: CURRENT_PRIVACY_POLICY_VERSION,
    essentialStorage: true,
    cloudSyncConsent: true,
    analyticsConsent: false,
    marketingConsent: false,
    doNotSellMyInfo: true,
    auditRetentionDays: 180,
    updatedAtIso: new Date().toISOString(),
  };
}

function timestampToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

async function mirrorAuditEventToServer(entry: ComplianceAuditEntry): Promise<void> {
  try {
    await fetch('/api/compliance/audit-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch {
    // Offline-safe non-blocking server mirror
  }
}

export async function recordComplianceAuditEvent(params: {
  uid: string;
  action: ComplianceAuditAction;
  category: ComplianceAuditCategory;
  summary: string;
}): Promise<ComplianceAuditEntry> {
  const cleanSummary = sanitizePlainText(
    params.summary,
    BLUEPRINT_LIMITS.AUDIT_SUMMARY_MAX
  );
  const eventId = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: ComplianceAuditEntry = {
    eventId,
    uid: params.uid,
    action: params.action,
    category: params.category,
    actorUid: auth.currentUser?.uid ?? params.uid,
    summary: cleanSummary || params.action,
    ipHint: getClientOriginHint(),
    createdAtIso: new Date().toISOString(),
  };

  // Persist to isolated local mirror immediately
  const existingLocal = readLocalSecurityState(params.uid);
  if (existingLocal) {
    existingLocal.auditLogs = [entry, ...existingLocal.auditLogs].slice(0, 120);
    writeLocalSecurityState(params.uid, existingLocal);
  }

  void mirrorAuditEventToServer(entry);

  // Persist to Firestore `/users/{uid}/auditLogs/{eventId}` when user has verified email
  const currentUser = auth.currentUser;
  if (
    currentUser &&
    currentUser.uid === params.uid &&
    currentUser.emailVerified &&
    isValidFirestoreDocId(params.uid) &&
    isValidFirestoreDocId(eventId)
  ) {
    const auditPath = `users/${params.uid}/auditLogs/${eventId}`;
    try {
      // Ensure parent user profile exists before writing subcollection (Master Gate)
      const parentRef = doc(db, 'users', params.uid);
      const parentSnap = await getDoc(parentRef);
      if (parentSnap.exists() && parentSnap.data()?.accountStatus === 'active') {
        await setDoc(doc(db, 'users', params.uid, 'auditLogs', eventId), {
          uid: params.uid,
          eventId,
          action: params.action,
          category: params.category,
          actorUid: currentUser.uid,
          summary: entry.summary,
          ipHint: entry.ipHint,
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, auditPath);
    }
  }

  return entry;
}

/**
 * Ensures the user's Split-Collection Firestore records (`/users/{uid}`,
 * `/users/{uid}/private/pii`, `/users/{uid}/privacy/consent`) are initialized
 * whenever the user is authenticated and email-verified.
 */
export async function bootstrapAndLoadUserGovernance(user: User): Promise<{
  profile: UserAccountProfile;
  consent: UserPrivacyConsentSettings;
  auditLogs: ComplianceAuditEntry[];
  requiresMfaVerification: boolean;
}> {
  const uid = user.uid;
  const provider = resolveProviderId(user);
  const fallbackDisplayName =
    validateDisplayName(user.displayName || user.email?.split('@')[0] || 'Athlete').sanitized ||
    'Athlete';
  const emailPlain = user.email || '';
  const encryptedEmail = await encryptSensitiveField(
    uid,
    emailPlain || 'redacted@local',
    BLUEPRINT_LIMITS.CIPHER_PII_MAX
  );

  let localState = readLocalSecurityState(uid);
  const nowIso = new Date().toISOString();

  if (!localState) {
    localState = {
      profile: {
        uid,
        displayName: fallbackDisplayName,
        email: emailPlain,
        emailVerified: user.emailVerified,
        authProvider: provider,
        mfaEnabled: false,
        accountStatus: 'active',
        phoneNote: '',
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      },
      encryptedEmailCipher: encryptedEmail,
      encryptedPhoneCipher: '',
      encryptedTotpSecretCipher: '',
      mfaMethod: 'none',
      recoveryCodeHashes: [],
      consent: buildDefaultPrivacyConsent(uid),
      auditLogs: [],
    };
    writeLocalSecurityState(uid, localState);
  } else {
    localState.profile.email = emailPlain || localState.profile.email;
    localState.profile.emailVerified = user.emailVerified;
    localState.profile.authProvider = provider;
    writeLocalSecurityState(uid, localState);
  }

  // Sync with Firestore Split-Collection Vault when emailVerified == true
  if (user.emailVerified && isValidFirestoreDocId(uid)) {
    const userDocPath = `users/${uid}`;
    const piiDocPath = `users/${uid}/private/pii`;
    const consentDocPath = `users/${uid}/privacy/consent`;

    try {
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid,
          displayName: localState.profile.displayName,
          authProvider: provider,
          mfaEnabled: localState.profile.mfaEnabled,
          accountStatus: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const d = userSnap.data();
        localState.profile.displayName = String(d.displayName || localState.profile.displayName);
        localState.profile.mfaEnabled = Boolean(d.mfaEnabled);
        localState.profile.createdAtIso = timestampToIso(d.createdAt);
        localState.profile.updatedAtIso = timestampToIso(d.updatedAt);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, userDocPath);
    }

    try {
      const piiRef = doc(db, 'users', uid, 'private', 'pii');
      const piiSnap = await getDoc(piiRef);
      if (!piiSnap.exists()) {
        await setDoc(piiRef, {
          uid,
          encryptedEmailCipher: localState.encryptedEmailCipher || encryptedEmail,
          encryptedPhoneCipher: localState.encryptedPhoneCipher || '',
          encryptedTotpSecretCipher: localState.encryptedTotpSecretCipher || '',
          mfaMethod: localState.mfaMethod,
          recoveryCodesHash: localState.recoveryCodeHashes.join(',').slice(0, 512),
          encryptionAlgo: 'AES-256-GCM-PBKDF2',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const piiData = piiSnap.data();
        if (typeof piiData.encryptedTotpSecretCipher === 'string') {
          localState.encryptedTotpSecretCipher = piiData.encryptedTotpSecretCipher;
        }
        if (piiData.mfaMethod === 'totp' || piiData.mfaMethod === 'none') {
          localState.mfaMethod = piiData.mfaMethod;
        }
        if (typeof piiData.encryptedPhoneCipher === 'string' && piiData.encryptedPhoneCipher) {
          localState.encryptedPhoneCipher = piiData.encryptedPhoneCipher;
          localState.profile.phoneNote = await decryptSensitiveField(
            uid,
            piiData.encryptedPhoneCipher
          );
        }
        if (typeof piiData.recoveryCodesHash === 'string' && piiData.recoveryCodesHash) {
          localState.recoveryCodeHashes = piiData.recoveryCodesHash
            .split(',')
            .filter(Boolean);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, piiDocPath);
    }

    try {
      const consentRef = doc(db, 'users', uid, 'privacy', 'consent');
      const consentSnap = await getDoc(consentRef);
      if (!consentSnap.exists()) {
        await setDoc(consentRef, {
          uid,
          policyVersion: localState.consent.policyVersion,
          essentialStorage: true,
          cloudSyncConsent: localState.consent.cloudSyncConsent,
          analyticsConsent: localState.consent.analyticsConsent,
          marketingConsent: localState.consent.marketingConsent,
          doNotSellMyInfo: localState.consent.doNotSellMyInfo,
          auditRetentionDays: localState.consent.auditRetentionDays,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const c = consentSnap.data();
        localState.consent = {
          uid,
          policyVersion: String(c.policyVersion || CURRENT_PRIVACY_POLICY_VERSION),
          essentialStorage: true,
          cloudSyncConsent: Boolean(c.cloudSyncConsent),
          analyticsConsent: Boolean(c.analyticsConsent),
          marketingConsent: Boolean(c.marketingConsent),
          doNotSellMyInfo: Boolean(c.doNotSellMyInfo),
          auditRetentionDays: Number(c.auditRetentionDays) || 180,
          updatedAtIso: timestampToIso(c.updatedAt),
        };
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, consentDocPath);
    }

    try {
      const auditColPath = `users/${uid}/auditLogs`;
      const q = query(
        collection(db, 'users', uid, 'auditLogs'),
        where('uid', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(40)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const cloudLogs: ComplianceAuditEntry[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            eventId: String(d.eventId || docSnap.id),
            uid: String(d.uid || uid),
            action: d.action as ComplianceAuditAction,
            category: d.category as ComplianceAuditCategory,
            actorUid: String(d.actorUid || uid),
            summary: String(d.summary || ''),
            ipHint: String(d.ipHint || ''),
            createdAtIso: timestampToIso(d.createdAt),
          };
        });
        const seen = new Set(cloudLogs.map((l) => l.eventId));
        const merged = [
          ...cloudLogs,
          ...localState.auditLogs.filter((l) => !seen.has(l.eventId)),
        ].slice(0, 80);
        localState.auditLogs = merged;
      }
      void auditColPath;
    } catch (error) {
      // Index may still be building on first query; fall back cleanly if index error, else report permission error
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes('missing or insufficient permissions')
      ) {
        handleFirestoreError(error, OperationType.LIST, `users/${uid}/auditLogs`);
      }
    }

    writeLocalSecurityState(uid, localState);
  }

  const mfaRequired =
    Boolean(localState.profile.mfaEnabled && localState.mfaMethod === 'totp') &&
    !isSessionMfaVerified(uid);

  return {
    profile: localState.profile,
    consent: localState.consent,
    auditLogs: localState.auditLogs,
    requiresMfaVerification: mfaRequired,
  };
}

export function formatFirebaseAuthError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes('auth/operation-not-allowed')) {
    return 'This sign-in provider is not enabled yet in your Firebase Console (Authentication → Sign-in method). Enable Email/Password or Facebook there, or use Google Sign-In right away.';
  }
  if (msg.includes('auth/email-already-in-use')) {
    return 'An account with this email already exists. Switch to Sign In or reset your password.';
  }
  if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found')) {
    return 'Invalid email or password. Check your credentials or use Forgot Password.';
  }
  if (msg.includes('auth/popup-closed-by-user')) {
    return 'Authentication popup was closed before completing sign-in.';
  }
  if (msg.includes('auth/popup-blocked')) {
    return 'Sign-in popup was blocked by your browser. Allow popups for this site and try again.';
  }
  if (msg.includes('auth/too-many-requests')) {
    return 'Too many authentication attempts. Wait a moment before retrying.';
  }
  if (msg.includes('auth/requires-recent-login')) {
    return 'For security, sign out and sign back in right before deleting your account.';
  }
  if (msg.includes('Quota exceeded')) {
    return 'Daily Firestore free-tier quota exceeded. Quota resets tomorrow.';
  }
  return msg;
}

export async function registerUserWithEmailPassword(params: {
  displayName: string;
  email: string;
  password: string;
  privacyAccepted: boolean;
  marketingConsent?: boolean;
}): Promise<{ user: User; verificationEmailSent: boolean }> {
  if (!params.privacyAccepted) {
    throw new Error('Accept the GDPR/CCPA Privacy Policy to create an account.');
  }
  const nameCheck = validateDisplayName(params.displayName);
  if (!nameCheck.valid) throw new Error(nameCheck.error);

  const emailCheck = validateEmailInput(params.email);
  if (!emailCheck.valid) throw new Error(emailCheck.error);

  const pwCheck = validatePasswordStrength(params.password);
  if (!pwCheck.valid) throw new Error(pwCheck.error);

  const cred = await createUserWithEmailAndPassword(auth, emailCheck.sanitized, params.password);
  await updateProfile(cred.user, { displayName: nameCheck.sanitized });

  let verificationEmailSent = false;
  try {
    await sendEmailVerification(cred.user);
    verificationEmailSent = true;
  } catch {
    verificationEmailSent = false;
  }

  const consent = buildDefaultPrivacyConsent(cred.user.uid);
  consent.marketingConsent = Boolean(params.marketingConsent);
  const encryptedEmail = await encryptSensitiveField(
    cred.user.uid,
    emailCheck.sanitized,
    BLUEPRINT_LIMITS.CIPHER_PII_MAX
  );

  writeLocalSecurityState(cred.user.uid, {
    profile: {
      uid: cred.user.uid,
      displayName: nameCheck.sanitized,
      email: emailCheck.sanitized,
      emailVerified: cred.user.emailVerified,
      authProvider: 'password',
      mfaEnabled: false,
      accountStatus: 'active',
      phoneNote: '',
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
    },
    encryptedEmailCipher: encryptedEmail,
    encryptedPhoneCipher: '',
    encryptedTotpSecretCipher: '',
    mfaMethod: 'none',
    recoveryCodeHashes: [],
    consent,
    auditLogs: [],
  });

  setSessionMfaVerified(cred.user.uid, true);

  await recordComplianceAuditEvent({
    uid: cred.user.uid,
    action: 'AUTH_REGISTER',
    category: 'authentication',
    summary: `Registered isolated user account via Email/Password (Policy ${CURRENT_PRIVACY_POLICY_VERSION}).`,
  });

  if (verificationEmailSent) {
    await recordComplianceAuditEvent({
      uid: cred.user.uid,
      action: 'AUTH_EMAIL_VERIFICATION_SENT',
      category: 'authentication',
      summary: 'Dispatched account verification email link.',
    });
  }

  return { user: cred.user, verificationEmailSent };
}

export async function loginUserWithEmailPassword(params: {
  email: string;
  password: string;
}): Promise<{ user: User; requiresMfaChallenge: boolean }> {
  const emailCheck = validateEmailInput(params.email);
  if (!emailCheck.valid) throw new Error(emailCheck.error);
  if (!params.password || params.password.length < 6) {
    throw new Error('Enter your account password.');
  }

  const cred = await signInWithEmailAndPassword(auth, emailCheck.sanitized, params.password);
  setSessionMfaVerified(cred.user.uid, false);
  const gov = await bootstrapAndLoadUserGovernance(cred.user);

  if (!gov.requiresMfaVerification) {
    setSessionMfaVerified(cred.user.uid, true);
  }

  await recordComplianceAuditEvent({
    uid: cred.user.uid,
    action: 'AUTH_LOGIN',
    category: 'authentication',
    summary: gov.requiresMfaVerification
      ? 'Primary password verified; awaiting TOTP multi-factor challenge.'
      : 'Authenticated via Email/Password.',
  });

  return { user: cred.user, requiresMfaChallenge: gov.requiresMfaVerification };
}

export async function signInWithSocialProvider(
  providerName: 'google' | 'facebook'
): Promise<{ user: User; requiresMfaChallenge: boolean }> {
  const provider = providerName === 'google' ? googleProvider : facebookProvider;
  const cred = await signInWithPopup(auth, provider);
  setSessionMfaVerified(cred.user.uid, false);
  const gov = await bootstrapAndLoadUserGovernance(cred.user);

  if (!gov.requiresMfaVerification) {
    setSessionMfaVerified(cred.user.uid, true);
  }

  await recordComplianceAuditEvent({
    uid: cred.user.uid,
    action: 'AUTH_LOGIN',
    category: 'authentication',
    summary: `Authenticated via ${providerName === 'google' ? 'Google' : 'Facebook'} OAuth popup.`,
  });

  return { user: cred.user, requiresMfaChallenge: gov.requiresMfaVerification };
}

export async function sendAccountPasswordRecovery(rawEmail: string): Promise<void> {
  const emailCheck = validateEmailInput(rawEmail);
  if (!emailCheck.valid) throw new Error(emailCheck.error);
  await sendPasswordResetEmail(auth, emailCheck.sanitized);
}

export async function resendCurrentAccountVerification(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in first to request a verification email.');
  await sendEmailVerification(user);
  await recordComplianceAuditEvent({
    uid: user.uid,
    action: 'AUTH_EMAIL_VERIFICATION_SENT',
    category: 'authentication',
    summary: 'Re-sent email verification link on user request.',
  });
}

export async function refreshCurrentEmailVerification(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  await user.reload();
  await user.getIdToken(true);
  if (user.emailVerified) {
    await bootstrapAndLoadUserGovernance(user);
  }
  return user.emailVerified;
}

export async function updateUserProfileDetails(params: {
  uid: string;
  displayName: string;
  phoneNote: string;
}): Promise<UserAccountProfile> {
  const nameCheck = validateDisplayName(params.displayName);
  if (!nameCheck.valid) throw new Error(nameCheck.error);

  const cleanPhone = sanitizePlainText(params.phoneNote, 40);
  const encryptedPhone = cleanPhone
    ? await encryptSensitiveField(params.uid, cleanPhone, BLUEPRINT_LIMITS.CIPHER_PII_MAX)
    : '';

  const user = auth.currentUser;
  if (user && user.uid === params.uid) {
    await updateProfile(user, { displayName: nameCheck.sanitized });
  }

  const localState = readLocalSecurityState(params.uid);
  if (!localState) throw new Error('Account security state not initialized.');

  localState.profile.displayName = nameCheck.sanitized;
  localState.profile.phoneNote = cleanPhone;
  localState.profile.updatedAtIso = new Date().toISOString();
  localState.encryptedPhoneCipher = encryptedPhone;
  writeLocalSecurityState(params.uid, localState);

  if (user && user.uid === params.uid && user.emailVerified) {
    try {
      await updateDoc(doc(db, 'users', params.uid), {
        displayName: nameCheck.sanitized,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${params.uid}`);
    }

    try {
      await updateDoc(doc(db, 'users', params.uid, 'private', 'pii'), {
        encryptedPhoneCipher: encryptedPhone,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${params.uid}/private/pii`);
    }
  }

  await recordComplianceAuditEvent({
    uid: params.uid,
    action: 'PROFILE_UPDATED',
    category: 'data_access',
    summary: 'Updated display profile and AES-256-GCM encrypted personal contact field.',
  });

  return localState.profile;
}

export async function enrollUserTotpMfa(params: {
  uid: string;
  totpSecret: string;
  verificationCode: string;
  recoveryCodes: string[];
}): Promise<void> {
  const isCodeValid = await verifyTotpToken(params.totpSecret, params.verificationCode);
  if (!isCodeValid) {
    throw new Error('Invalid 6-digit authenticator code. Check your authenticator clock and retry.');
  }

  const encryptedSecret = await encryptSensitiveField(
    params.uid,
    params.totpSecret,
    BLUEPRINT_LIMITS.CIPHER_PII_MAX
  );
  const recoveryHashes = await Promise.all(
    params.recoveryCodes.map(async (c) => (await computeSha256Hex(c.trim().toUpperCase())).slice(0, 32))
  );

  const localState = readLocalSecurityState(params.uid);
  if (!localState) throw new Error('Account state not found.');

  localState.profile.mfaEnabled = true;
  localState.mfaMethod = 'totp';
  localState.encryptedTotpSecretCipher = encryptedSecret;
  localState.recoveryCodeHashes = recoveryHashes;
  writeLocalSecurityState(params.uid, localState);
  setSessionMfaVerified(params.uid, true);

  const user = auth.currentUser;
  if (user && user.uid === params.uid && user.emailVerified) {
    try {
      await updateDoc(doc(db, 'users', params.uid), {
        mfaEnabled: true,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${params.uid}`);
    }

    try {
      await updateDoc(doc(db, 'users', params.uid, 'private', 'pii'), {
        encryptedTotpSecretCipher: encryptedSecret,
        mfaMethod: 'totp',
        recoveryCodesHash: recoveryHashes.join(',').slice(0, 512),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${params.uid}/private/pii`);
    }
  }

  await recordComplianceAuditEvent({
    uid: params.uid,
    action: 'MFA_ENABLED',
    category: 'mfa',
    summary: 'Enrolled RFC 6238 TOTP Multi-Factor Authentication with encrypted secret storage.',
  });
}

export async function verifyUserLoginMfaChallenge(
  uid: string,
  codeOrRecovery: string
): Promise<boolean> {
  const localState = readLocalSecurityState(uid);
  if (!localState || !localState.encryptedTotpSecretCipher) {
    setSessionMfaVerified(uid, true);
    return true;
  }

  const secret = await decryptSensitiveField(uid, localState.encryptedTotpSecretCipher);
  const trimmed = codeOrRecovery.trim().toUpperCase();

  let verified = false;
  if (/^\d{6}$/.test(trimmed) && secret) {
    verified = await verifyTotpToken(secret, trimmed);
  } else if (trimmed.length >= 8) {
    const candidateHash = (await computeSha256Hex(trimmed)).slice(0, 32);
    if (localState.recoveryCodeHashes.includes(candidateHash)) {
      verified = true;
      localState.recoveryCodeHashes = localState.recoveryCodeHashes.filter(
        (h) => h !== candidateHash
      );
      writeLocalSecurityState(uid, localState);
    }
  }

  if (verified) {
    setSessionMfaVerified(uid, true);
    await recordComplianceAuditEvent({
      uid,
      action: 'MFA_VERIFIED',
      category: 'mfa',
      summary: 'Completed multi-factor authentication challenge.',
    });
  }
  return verified;
}

export async function disableUserTotpMfa(uid: string): Promise<void> {
  const localState = readLocalSecurityState(uid);
  if (localState) {
    localState.profile.mfaEnabled = false;
    localState.mfaMethod = 'none';
    localState.encryptedTotpSecretCipher = '';
    localState.recoveryCodeHashes = [];
    writeLocalSecurityState(uid, localState);
  }
  setSessionMfaVerified(uid, true);

  const user = auth.currentUser;
  if (user && user.uid === uid && user.emailVerified) {
    try {
      await updateDoc(doc(db, 'users', uid), {
        mfaEnabled: false,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users', uid, 'private', 'pii'), {
        encryptedTotpSecretCipher: '',
        mfaMethod: 'none',
        recoveryCodesHash: '',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/private/pii`);
    }
  }

  await recordComplianceAuditEvent({
    uid,
    action: 'MFA_DISABLED',
    category: 'mfa',
    summary: 'Disabled TOTP multi-factor authentication on user request.',
  });
}

export async function updateUserPrivacyConsent(
  uid: string,
  patch: Partial<
    Pick<
      UserPrivacyConsentSettings,
      | 'cloudSyncConsent'
      | 'analyticsConsent'
      | 'marketingConsent'
      | 'doNotSellMyInfo'
      | 'auditRetentionDays'
    >
  >
): Promise<UserPrivacyConsentSettings> {
  const localState = readLocalSecurityState(uid);
  if (!localState) throw new Error('Account state not initialized.');

  const retention = Math.min(
    365,
    Math.max(30, Math.round(patch.auditRetentionDays ?? localState.consent.auditRetentionDays))
  );

  const updated: UserPrivacyConsentSettings = {
    ...localState.consent,
    ...patch,
    essentialStorage: true,
    policyVersion: CURRENT_PRIVACY_POLICY_VERSION,
    auditRetentionDays: retention,
    updatedAtIso: new Date().toISOString(),
  };

  localState.consent = updated;
  writeLocalSecurityState(uid, localState);

  const user = auth.currentUser;
  if (user && user.uid === uid && user.emailVerified) {
    try {
      await updateDoc(doc(db, 'users', uid, 'privacy', 'consent'), {
        policyVersion: updated.policyVersion,
        cloudSyncConsent: updated.cloudSyncConsent,
        analyticsConsent: updated.analyticsConsent,
        marketingConsent: updated.marketingConsent,
        doNotSellMyInfo: updated.doNotSellMyInfo,
        auditRetentionDays: updated.auditRetentionDays,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/privacy/consent`);
    }
  }

  await recordComplianceAuditEvent({
    uid,
    action: 'PRIVACY_CONSENT_UPDATED',
    category: 'privacy',
    summary: `Updated GDPR/CCPA consent (CloudSync=${updated.cloudSyncConsent}, DoNotSell=${updated.doNotSellMyInfo}, Retention=${updated.auditRetentionDays}d).`,
  });

  return updated;
}

export async function syncEncryptedVaultPartition(params: {
  uid: string;
  chunkType: 'nutrition_wellbeing' | 'workouts_sets' | 'goals_preferences';
  plainObject: unknown;
  recordCount: number;
}): Promise<boolean> {
  const user = auth.currentUser;
  if (!user || user.uid !== params.uid || !user.emailVerified) {
    return false;
  }

  const localState = readLocalSecurityState(params.uid);
  if (localState && !localState.consent.cloudSyncConsent) {
    return false;
  }

  const serialized = JSON.stringify(params.plainObject);
  const checksum = (await computeSha256Hex(serialized)).slice(0, 64);
  const cipher = await encryptSensitiveField(
    params.uid,
    serialized,
    BLUEPRINT_LIMITS.CIPHER_VAULT_MAX
  );

  const docPath = `users/${params.uid}/vault/${params.chunkType}`;
  try {
    const ref = doc(db, 'users', params.uid, 'vault', params.chunkType);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: params.uid,
        chunkType: params.chunkType,
        encryptedPayloadCipher: cipher,
        recordCount: Math.max(0, Math.min(100000, Math.round(params.recordCount))),
        checksum,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        encryptedPayloadCipher: cipher,
        recordCount: Math.max(0, Math.min(100000, Math.round(params.recordCount))),
        checksum,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }

  await recordComplianceAuditEvent({
    uid: params.uid,
    action: 'VAULT_SYNC_WRITE',
    category: 'data_access',
    summary: `Encrypted and synced ${params.chunkType} partition (${params.recordCount} records, AES-256-GCM).`,
  });

  return true;
}

export async function readEncryptedVaultPartition<T>(
  uid: string,
  chunkType: 'nutrition_wellbeing' | 'workouts_sets' | 'goals_preferences'
): Promise<T | null> {
  const user = auth.currentUser;
  if (!user || user.uid !== uid || !user.emailVerified) return null;

  const docPath = `users/${uid}/vault/${chunkType}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'vault', chunkType));
    if (!snap.exists()) return null;
    const cipher = String(snap.data().encryptedPayloadCipher || '');
    const plain = await decryptSensitiveField(uid, cipher);
    if (!plain) return null;
    await recordComplianceAuditEvent({
      uid,
      action: 'VAULT_SYNC_READ',
      category: 'data_access',
      summary: `Decrypted isolated ${chunkType} partition for authenticated owner.`,
    });
    return JSON.parse(plain) as T;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

export async function signOutCurrentAccount(): Promise<void> {
  const current = auth.currentUser;
  if (current) {
    await recordComplianceAuditEvent({
      uid: current.uid,
      action: 'AUTH_LOGOUT',
      category: 'authentication',
      summary: 'Signed out and locked isolated user session.',
    });
    setSessionMfaVerified(current.uid, false);
  }
  await signOut(auth);
}

/**
 * GDPR Art. 17 / CCPA Right to Erasure:
 * Permanently deletes all Firestore documents, encrypted PII, vault partitions,
 * audit logs, local storage keys, and the Firebase Authentication user record.
 */
export async function eraseAccountAndAllPersonalData(uid: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) {
    throw new Error('Sign in as the account owner to erase account data.');
  }

  await mirrorAuditEventToServer({
    eventId: `aud_erase_${Date.now()}`,
    uid,
    action: 'ACCOUNT_ERASURE_REQUESTED',
    category: 'erasure',
    actorUid: uid,
    summary: 'Executed permanent GDPR Art. 17 / CCPA account and personal data erasure.',
    ipHint: getClientOriginHint(),
    createdAtIso: new Date().toISOString(),
  });

  if (user.emailVerified && isValidFirestoreDocId(uid)) {
    // 1. Delete encrypted vault partitions
    for (const chunkId of ['nutrition_wellbeing', 'workouts_sets', 'goals_preferences']) {
      try {
        await deleteDoc(doc(db, 'users', uid, 'vault', chunkId));
      } catch {
        // Ignore if partition never existed
      }
    }

    // 2. Delete privacy consent & encrypted PII vault
    try {
      await deleteDoc(doc(db, 'users', uid, 'privacy', 'consent'));
    } catch {
      // Ignore if absent
    }
    try {
      await deleteDoc(doc(db, 'users', uid, 'private', 'pii'));
    } catch {
      // Ignore if absent
    }

    // 3. Delete auditLogs subcollection documents
    try {
      const q = query(collection(db, 'users', uid, 'auditLogs'), where('uid', '==', uid));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        await deleteDoc(d.ref);
      }
    } catch {
      // Ignore if empty
    }

    // 4. Delete root user profile document
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
    }
  }

  clearAllLocalUserKeys(uid);
  await deleteUser(user);
}
