/**
 * Input Validation, Injection/XSS Defense, AES-256-GCM Encryption at Rest,
 * and RFC 6238 WebCrypto TOTP Multi-Factor Authentication (MFA).
 *
 * Volumetric bounds and regex guards strictly mirror `firebase-blueprint.json`
 * and `firestore.rules`.
 */

export const BLUEPRINT_LIMITS = {
  UID_MAX: 128,
  UID_REGEX: /^[a-zA-Z0-9_-]+$/,
  DISPLAY_NAME_MIN: 1,
  DISPLAY_NAME_MAX: 80,
  POLICY_VERSION_MAX: 32,
  CIPHER_PII_MAX: 1024,
  CIPHER_VAULT_MAX: 450000,
  AUDIT_SUMMARY_MAX: 280,
  IP_HINT_MAX: 64,
} as const;

const XSS_AND_INJECTION_PATTERNS: RegExp[] = [
  /<\s*script\b/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /data\s*:\s*text\/html/i,
  /\bon(?:error|load|click|mouseover|focus|submit)\s*=/i,
  /<\s*(?:iframe|object|embed|svg|meta|link)\b/i,
  /\b(?:UNION\s+SELECT|DROP\s+TABLE|INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+\w+\s+SET)\b/i,
  /(?:'\s*OR\s*'1'\s*=\s*'1'|"\s*OR\s*"1"\s*=\s*"1"|--\s*$|;\s*DROP\s+)/i,
  /\$(?:where|ne|gt|lt|regex)\b/i,
];

export interface ValidationOutcome {
  valid: boolean;
  sanitized: string;
  error?: string;
}

export function detectMaliciousInput(raw: string): string | null {
  for (const pattern of XSS_AND_INJECTION_PATTERNS) {
    if (pattern.test(raw)) {
      return 'Input contains disallowed script or query injection characters.';
    }
  }
  return null;
}

export function sanitizePlainText(raw: string, maxLength: number): string {
  const withoutNulls = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  const strippedHtml = withoutNulls.replace(/<[^>]*>/g, '');
  return strippedHtml.trim().slice(0, maxLength);
}

export function validateDisplayName(rawName: string): ValidationOutcome {
  const injectionErr = detectMaliciousInput(rawName);
  if (injectionErr) {
    return { valid: false, sanitized: '', error: injectionErr };
  }
  const clean = sanitizePlainText(rawName, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX);
  if (clean.length < BLUEPRINT_LIMITS.DISPLAY_NAME_MIN) {
    return {
      valid: false,
      sanitized: clean,
      error: 'Display name must be between 1 and 80 characters.',
    };
  }
  return { valid: true, sanitized: clean };
}

export function validateEmailInput(rawEmail: string): ValidationOutcome {
  const injectionErr = detectMaliciousInput(rawEmail);
  if (injectionErr) {
    return { valid: false, sanitized: '', error: injectionErr };
  }
  const clean = sanitizePlainText(rawEmail, 160).toLowerCase();
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  if (!emailRegex.test(clean)) {
    return {
      valid: false,
      sanitized: clean,
      error: 'Enter a valid email address (for example, alex@domain.com).',
    };
  }
  return { valid: true, sanitized: clean };
}

export interface PasswordStrengthAnalysis {
  valid: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too Short' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
  checks: {
    minLength: boolean;
    hasUpper: boolean;
    hasLower: boolean;
    hasNumber: boolean;
    hasSymbol: boolean;
  };
  error?: string;
}

export function validatePasswordStrength(password: string): PasswordStrengthAnalysis {
  const checks = {
    minLength: password.length >= 8 && password.length <= 128,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSymbol: /[^A-Za-z0-9]/.test(password),
  };

  if (!checks.minLength) {
    return {
      valid: false,
      score: 0,
      label: 'Too Short',
      checks,
      error: 'Password must be at least 8 characters long.',
    };
  }

  const varietyCount =
    Number(checks.hasUpper) +
    Number(checks.hasLower) +
    Number(checks.hasNumber) +
    Number(checks.hasSymbol);

  const score = Math.min(4, Math.max(1, varietyCount)) as 1 | 2 | 3 | 4;
  const labelMap: Record<1 | 2 | 3 | 4, PasswordStrengthAnalysis['label']> = {
    1: 'Weak',
    2: 'Fair',
    3: 'Strong',
    4: 'Very Strong',
  };

  const valid = checks.minLength && varietyCount >= 3;
  return {
    valid,
    score,
    label: labelMap[score],
    checks,
    error: valid
      ? undefined
      : 'Include at least 3 of: uppercase letter, lowercase letter, number, and symbol.',
  };
}

export function isValidFirestoreDocId(id: string): boolean {
  return (
    typeof id === 'string' &&
    id.length >= 1 &&
    id.length <= BLUEPRINT_LIMITS.UID_MAX &&
    BLUEPRINT_LIMITS.UID_REGEX.test(id)
  );
}

/* ============================================================================
 * WebCrypto AES-256-GCM Field & Vault Encryption at Rest
 * ========================================================================== */

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function getOrCreateUserDevicePepper(uid: string): string {
  const storageKey = `hyperlog_vault_pepper_${uid}`;
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing && existing.length >= 16) return existing;
    const rand = new Uint8Array(24);
    crypto.getRandomValues(rand);
    const encoded = bytesToBase64(rand);
    window.localStorage.setItem(storageKey, encoded);
    return encoded;
  } catch {
    return 'hyperlog-isolated-fallback-pepper-v1';
  }
}

async function deriveUserAesKey(uid: string, portable = true): Promise<CryptoKey> {
  const enc = new TextEncoder();
  // Portable key uses deterministic UID-bound PBKDF2 material so user's encrypted Firestore vault
  // can be decrypted across sessions when authenticated as that exact UID.
  const secretSeed = portable
    ? `hyperlog-aes256-gcm::uid=${uid}::domain=isolated-user-vault-v1`
    : `hyperlog-aes256-gcm::uid=${uid}::pepper=${getOrCreateUserDevicePepper(uid)}`;

  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretSeed),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const salt = enc.encode(`hyperlog-salt::${uid}`);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptSensitiveField(
  uid: string,
  plaintext: string,
  maxCipherLength: number = BLUEPRINT_LIMITS.CIPHER_VAULT_MAX
): Promise<string> {
  if (!plaintext) return '';
  const key = await deriveUserAesKey(uid, true);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const payload = `enc1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipherBuf))}`;
  if (payload.length > maxCipherLength) {
    throw new Error(`Encrypted payload exceeds maximum vault bound (${maxCipherLength} chars).`);
  }
  return payload;
}

export async function decryptSensitiveField(uid: string, cipherText: string): Promise<string> {
  if (!cipherText) return '';
  if (!cipherText.startsWith('enc1.')) return '';
  const parts = cipherText.split('.');
  if (parts.length !== 3) return '';
  try {
    const iv = base64ToBytes(parts[1]);
    const cipherBytes = base64ToBytes(parts[2]);
    const key = await deriveUserAesKey(uid, true);
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      cipherBytes as BufferSource
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    return '';
  }
}

export async function computeSha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ============================================================================
 * RFC 6238 TOTP Multi-Factor Authentication (WebCrypto HMAC-SHA1)
 * ========================================================================== */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32TotpSecret(length = 20): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += BASE32_ALPHABET[bytes[i] % 32];
  }
  return out;
}

function decodeBase32(base32: string): Uint8Array {
  const clean = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (let i = 0; i < clean.length; i += 1) {
    const val = BASE32_ALPHABET.indexOf(clean[i]);
    if (val >= 0) {
      bits += val.toString(2).padStart(5, '0');
    }
  }
  const byteCount = Math.floor(bits.length / 8);
  const out = new Uint8Array(byteCount);
  for (let i = 0; i < byteCount; i += 1) {
    out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return out;
}

export function buildOtpAuthUri(email: string, secret: string): string {
  const issuer = encodeURIComponent('HyperLog');
  const label = encodeURIComponent(`HyperLog:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export async function generateTotpCode(
  base32Secret: string,
  timestampMs = Date.now()
): Promise<string> {
  const keyBytes = decodeBase32(base32Secret);
  const counter = Math.floor(timestampMs / 1000 / 30);
  const counterBytes = new Uint8Array(8);
  let rem = counter;
  for (let i = 7; i >= 0; i -= 1) {
    counterBytes[i] = rem & 0xff;
    rem = Math.floor(rem / 256);
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const hmacBuf = await crypto.subtle.sign('HMAC', cryptoKey, counterBytes as BufferSource);
  const hmac = new Uint8Array(hmacBuf);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1_000_000;
  return String(otp).padStart(6, '0');
}

export async function verifyTotpToken(
  base32Secret: string,
  candidateToken: string,
  nowMs = Date.now()
): Promise<boolean> {
  const clean = candidateToken.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean) || !base32Secret) return false;
  for (const stepOffset of [-1, 0, 1]) {
    const expected = await generateTotpCode(base32Secret, nowMs + stepOffset * 30_000);
    if (expected === clean) return true;
  }
  return false;
}

export function generateBackupRecoveryCodes(count = 6): string[] {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codes: string[] = [];
  for (let c = 0; c < count; c += 1) {
    const rand = new Uint8Array(8);
    crypto.getRandomValues(rand);
    const partA = Array.from(rand.slice(0, 4))
      .map((b) => chars[b % chars.length])
      .join('');
    const partB = Array.from(rand.slice(4, 8))
      .map((b) => chars[b % chars.length])
      .join('');
    codes.push(`${partA}-${partB}`);
  }
  return codes;
}
