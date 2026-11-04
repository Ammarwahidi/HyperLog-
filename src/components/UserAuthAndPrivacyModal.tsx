import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileText,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  ComplianceAuditEntry,
  UserAccountProfile,
  UserPrivacyConsentSettings,
  disableUserTotpMfa,
  enrollUserTotpMfa,
  eraseAccountAndAllPersonalData,
  formatFirebaseAuthError,
  loginUserWithEmailPassword,
  recordComplianceAuditEvent,
  refreshCurrentEmailVerification,
  registerUserWithEmailPassword,
  resendCurrentAccountVerification,
  sendAccountPasswordRecovery,
  signInWithSocialProvider,
  signOutCurrentAccount,
  updateUserPrivacyConsent,
  updateUserProfileDetails,
  verifyUserLoginMfaChallenge,
} from '../services/userManagementService';
import {
  buildOtpAuthUri,
  generateBackupRecoveryCodes,
  generateBase32TotpSecret,
  generateTotpCode,
  validatePasswordStrength,
} from '../utils/securityValidationAndCrypto';

export interface UserAuthAndPrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
  firebaseUser: User | null;
  profile: UserAccountProfile | null;
  consent: UserPrivacyConsentSettings | null;
  auditLogs: ComplianceAuditEntry[];
  requiresMfaChallenge: boolean;
  onRefreshGovernance: () => Promise<void>;
  onSyncEncryptedCloudVault: () => Promise<void>;
  onRestoreEncryptedCloudVault: () => Promise<void>;
  onExportGdprJson: () => Promise<void>;
  onAccountErased: (erasedUid: string) => Promise<void>;
}

type UnauthView = 'login' | 'register' | 'recovery' | 'policy';
type AccountTab = 'overview' | 'security_mfa' | 'privacy_gdpr' | 'audit_logs';

export const UserAuthAndPrivacyModal: React.FC<UserAuthAndPrivacyModalProps> = ({
  isOpen,
  onClose,
  firebaseUser,
  profile,
  consent,
  auditLogs,
  requiresMfaChallenge,
  onRefreshGovernance,
  onSyncEncryptedCloudVault,
  onRestoreEncryptedCloudVault,
  onExportGdprJson,
  onAccountErased,
}) => {
  const [unauthView, setUnauthView] = useState<UnauthView>('login');
  const [accountTab, setAccountTab] = useState<AccountTab>('overview');

  // Auth form fields
  const [displayName, setDisplayName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [privacyAccepted, setPrivacyAccepted] = useState<boolean>(true);
  const [marketingOptIn, setMarketingOptIn] = useState<boolean>(false);

  // Profile edit state
  const [editDisplayName, setEditDisplayName] = useState<string>('');
  const [editPhoneNote, setEditPhoneNote] = useState<string>('');

  // MFA Enrollment & Challenge state
  const [mfaChallengeInput, setMfaChallengeInput] = useState<string>('');
  const [enrollSecret, setEnrollSecret] = useState<string>('');
  const [enrollRecoveryCodes, setEnrollRecoveryCodes] = useState<string[]>([]);
  const [enrollCodeInput, setEnrollCodeInput] = useState<string>('');
  const [liveTotpPreview, setLiveTotpPreview] = useState<string>('');
  const [showMfaWizard, setShowMfaWizard] = useState<boolean>(false);
  const [copiedSecret, setCopiedSecret] = useState<boolean>(false);

  // Audit Log search/filter
  const [auditQuery, setAuditQuery] = useState<string>('');
  const [auditCategoryFilter, setAuditCategoryFilter] = useState<string>('all');

  // Account Deletion Confirmation
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  const [showDeleteConfirmBox, setShowDeleteConfirmBox] = useState<boolean>(false);

  // Status & Loading
  const [busy, setBusy] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setEditDisplayName(profile.displayName);
      setEditPhoneNote(profile.phoneNote || '');
    }
  }, [profile]);

  // Listen for server-assisted OAuth popup postMessage completion
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin || '';
      if (
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost') &&
        origin !== window.location.origin
      ) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setSuccessMessage('OAuth provider callback verified.');
        void onRefreshGovernance();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onRefreshGovernance]);

  // Keep a live 30-second TOTP helper preview during enrollment so users can test immediately
  useEffect(() => {
    if (!showMfaWizard || !enrollSecret) return;
    let active = true;
    const refreshCode = async () => {
      const code = await generateTotpCode(enrollSecret);
      if (active) setLiveTotpPreview(code);
    };
    void refreshCode();
    const timer = window.setInterval(() => {
      void refreshCode();
    }, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [showMfaWizard, enrollSecret]);

  const passwordStrength = useMemo(() => validatePasswordStrength(password), [password]);

  const filteredAuditLogs = useMemo(() => {
    const q = auditQuery.trim().toLowerCase();
    return auditLogs.filter((entry) => {
      if (auditCategoryFilter !== 'all' && entry.category !== auditCategoryFilter) {
        return false;
      }
      if (!q) return true;
      return `${entry.action} ${entry.category} ${entry.summary} ${entry.ipHint}`
        .toLowerCase()
        .includes(q);
    });
  }, [auditLogs, auditQuery, auditCategoryFilter]);

  if (!isOpen) return null;

  const clearFeedback = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setBusy(true);
    try {
      const res = await registerUserWithEmailPassword({
        displayName,
        email,
        password,
        privacyAccepted,
        marketingConsent: marketingOptIn,
      });
      setPassword('');
      await onRefreshGovernance();
      setSuccessMessage(
        res.verificationEmailSent
          ? 'Account created in isolated database. Verification email sent — check your inbox to activate cloud sync.'
          : 'Account created in isolated database.'
      );
    } catch (err) {
      setErrorMessage(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setBusy(true);
    try {
      const res = await loginUserWithEmailPassword({ email, password });
      setPassword('');
      await onRefreshGovernance();
      setSuccessMessage(
        res.requiresMfaChallenge
          ? 'Password verified. Enter your 6-digit MFA code to unlock your vault.'
          : 'Signed in securely to your isolated workspace.'
      );
    } catch (err) {
      setErrorMessage(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSocialAuth = async (provider: 'google' | 'facebook') => {
    clearFeedback();
    setBusy(true);
    try {
      const res = await signInWithSocialProvider(provider);
      await onRefreshGovernance();
      setSuccessMessage(
        res.requiresMfaChallenge
          ? 'Social sign-in verified. Complete MFA challenge to unlock.'
          : `Authenticated via ${provider === 'google' ? 'Google' : 'Facebook'}.`
      );
    } catch (err) {
      setErrorMessage(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setBusy(true);
    try {
      await sendAccountPasswordRecovery(email);
      setSuccessMessage(
        'If an account matches that email, a secure password recovery link has been sent.'
      );
    } catch (err) {
      setErrorMessage(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleMfaChallengeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    clearFeedback();
    setBusy(true);
    try {
      const ok = await verifyUserLoginMfaChallenge(firebaseUser.uid, mfaChallengeInput);
      if (!ok) {
        setErrorMessage('Invalid 6-digit authenticator code or backup recovery code.');
      } else {
        setMfaChallengeInput('');
        await onRefreshGovernance();
        setSuccessMessage('Multi-factor authentication verified. Vault unlocked.');
      }
    } catch (err) {
      setErrorMessage(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleStartMfaEnrollment = () => {
    clearFeedback();
    const secret = generateBase32TotpSecret(20);
    const codes = generateBackupRecoveryCodes(6);
    setEnrollSecret(secret);
    setEnrollRecoveryCodes(codes);
    setEnrollCodeInput('');
    setShowMfaWizard(true);
  };

  const handleConfirmMfaEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    clearFeedback();
    setBusy(true);
    try {
      await enrollUserTotpMfa({
        uid: firebaseUser.uid,
        totpSecret: enrollSecret,
        verificationCode: enrollCodeInput,
        recoveryCodes: enrollRecoveryCodes,
      });
      setShowMfaWizard(false);
      await onRefreshGovernance();
      setSuccessMessage('TOTP Multi-Factor Authentication is now active on your account.');
    } catch (err) {
      setErrorMessage(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!firebaseUser) return;
    clearFeedback();
    setBusy(true);
    try {
      await disableUserTotpMfa(firebaseUser.uid);
      await onRefreshGovernance();
      setSuccessMessage('Multi-Factor Authentication disabled.');
    } catch (err) {
      setErrorMessage(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    clearFeedback();
    setBusy(true);
    try {
      await updateUserProfileDetails({
        uid: firebaseUser.uid,
        displayName: editDisplayName,
        phoneNote: editPhoneNote,
      });
      await onRefreshGovernance();
      setSuccessMessage('Profile updated and personal fields encrypted with AES-256-GCM.');
    } catch (err) {
      setErrorMessage(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleConsentChange = async (
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
  ) => {
    if (!firebaseUser) return;
    clearFeedback();
    setBusy(true);
    try {
      await updateUserPrivacyConsent(firebaseUser.uid, patch);
      await onRefreshGovernance();
      setSuccessMessage('GDPR / CCPA privacy preferences updated and logged.');
    } catch (err) {
      setErrorMessage(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handlePermanentAccountErasure = async () => {
    if (!firebaseUser || deleteConfirmText.trim().toUpperCase() !== 'DELETE') return;
    const targetUid = firebaseUser.uid;
    clearFeedback();
    setBusy(true);
    try {
      await eraseAccountAndAllPersonalData(targetUid);
      await onAccountErased(targetUid);
      setDeleteConfirmText('');
      setShowDeleteConfirmBox(false);
      onClose();
    } catch (err) {
      setErrorMessage(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    clearFeedback();
    setBusy(true);
    try {
      await signOutCurrentAccount();
      onClose();
    } catch (err) {
      setErrorMessage(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="User Account, Security and Privacy Center"
      data-testid="user-auth-privacy-modal"
      className="fixed inset-0 z-50 bg-indigo-950/55 dark:bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        data-testid="claymorphism-auth-shell"
        className="w-full max-w-2xl hl-clay-auth-shell rounded-[32px] max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Claymorphism Top Header with Soft Inner Highlight */}
        <div className="px-5 sm:px-7 py-5 border-b border-indigo-200/70 dark:border-indigo-400/20 bg-gradient-to-b from-white/75 to-indigo-50/40 dark:from-indigo-950/40 dark:to-transparent flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/pwa-192x192.png"
              alt="HyperLog"
              referrerPolicy="no-referrer"
              className="w-11 h-11 rounded-2xl object-cover shrink-0 shadow-sm"
            />
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
                {firebaseUser
                  ? requiresMfaChallenge
                    ? 'Multi-Factor Verification Required'
                    : 'Account, Security & Privacy Center'
                  : 'HyperLog Clay Vault · Sign In'}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                AES-256-GCM Encrypted Vault · Isolated Per-User Data · Zero Cross-Profile Bleed
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="close-clay-auth-modal-btn"
            onClick={onClose}
            aria-label="Close account modal"
            className="no-touch-delay min-h-[42px] min-w-[42px] rounded-2xl hl-clay-auth-panel flex items-center justify-center text-slate-600 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status / Error Alerts */}
        {(errorMessage || successMessage) && (
          <div className="px-5 sm:px-7 pt-3.5">
            {errorMessage && (
              <div className="p-3.5 rounded-2xl bg-red-50/90 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-xs text-red-800 dark:text-red-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}
            {successMessage && (
              <div className="p-3.5 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-2">
                <Check className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="p-5 sm:p-7 overflow-y-auto space-y-5 flex-1">
          {!firebaseUser ? (
            <>
              {/* Claymorphism Segmented Switcher */}
              <div className="flex items-center gap-1.5 p-1.5 rounded-2xl hl-clay-auth-input overflow-x-auto no-scrollbar">
                {(
                  [
                    { id: 'login', label: 'Sign In' },
                    { id: 'register', label: 'Create Account' },
                    { id: 'recovery', label: 'Recovery' },
                    { id: 'policy', label: 'Privacy (GDPR)' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`auth-mode-${item.id}-btn`}
                    onClick={() => {
                      clearFeedback();
                      setUnauthView(item.id);
                    }}
                    className={`no-touch-delay flex-1 min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                      unauthView === item.id
                        ? 'hl-clay-auth-cta text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {(unauthView === 'login' || unauthView === 'register') && (
                <div className="hl-clay-auth-panel p-4 sm:p-5 space-y-4">
                  {/* Social Media Authentication Buttons (Claymorphic 3D Tactile Buttons) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      data-testid="oauth-google-btn"
                      onClick={() => void handleSocialAuth('google')}
                      className="no-touch-delay min-h-[46px] px-4 py-2.5 rounded-2xl hl-clay-auth-panel hover:border-indigo-400 text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center justify-center gap-2.5 transition-transform active:scale-[0.985] disabled:opacity-50"
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                        />
                      </svg>
                      <span>Continue with Google</span>
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      data-testid="oauth-facebook-btn"
                      onClick={() => void handleSocialAuth('facebook')}
                      className="no-touch-delay min-h-[46px] px-4 py-2.5 rounded-2xl bg-gradient-to-b from-[#2583FF] to-[#1464D6] shadow-md text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2.5 transition-transform active:scale-[0.985] disabled:opacity-50"
                    >
                      <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                      <span>Continue with Facebook</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] font-semibold tracking-wider text-slate-500 dark:text-slate-400">
                    <div className="h-px flex-1 bg-indigo-200/80 dark:bg-indigo-800/50" />
                    <span>OR EMAIL &amp; PASSWORD</span>
                    <div className="h-px flex-1 bg-indigo-200/80 dark:bg-indigo-800/50" />
                  </div>

                  {unauthView === 'login' ? (
                    <form onSubmit={(e) => void handleEmailLogin(e)} className="space-y-3.5">
                      <label className="block text-xs space-y-1.5">
                        <span className="font-bold text-slate-700 dark:text-slate-200">
                          Email Address
                        </span>
                        <input
                          type="email"
                          required
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="athlete@domain.com"
                          className="w-full min-h-[46px] px-4 text-sm text-slate-900 dark:text-white hl-clay-auth-input focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </label>

                      <label className="block text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-700 dark:text-slate-200">
                            Password
                          </span>
                          <button
                            type="button"
                            onClick={() => setUnauthView('recovery')}
                            className="no-touch-delay text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                          >
                            Forgot password?
                          </button>
                        </div>
                        <input
                          type="password"
                          required
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your password"
                          className="w-full min-h-[46px] px-4 text-sm text-slate-900 dark:text-white hl-clay-auth-input focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </label>

                      <button
                        type="submit"
                        disabled={busy}
                        data-testid="email-login-submit"
                        className="no-touch-delay w-full min-h-[48px] px-4 py-2.5 hl-clay-auth-cta text-white text-sm font-bold flex items-center justify-center gap-2 transition-transform active:scale-[0.985] disabled:opacity-50"
                      >
                        <UserCheck className="w-4 h-4" />
                        <span>{busy ? 'Signing In…' : 'Sign In to Isolated Clay Vault'}</span>
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={(e) => void handleEmailRegister(e)} className="space-y-3.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block text-xs space-y-1.5">
                          <span className="font-bold text-slate-700 dark:text-slate-200">
                            Display Name
                          </span>
                          <input
                            type="text"
                            required
                            maxLength={80}
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Alex Morgan"
                            className="w-full min-h-[46px] px-4 text-sm text-slate-900 dark:text-white hl-clay-auth-input focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </label>

                        <label className="block text-xs space-y-1.5">
                          <span className="font-bold text-slate-700 dark:text-slate-200">
                            Email Address
                          </span>
                          <input
                            type="email"
                            required
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="athlete@domain.com"
                            className="w-full min-h-[46px] px-4 text-sm text-slate-900 dark:text-white hl-clay-auth-input focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </label>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-700 dark:text-slate-200">
                              Strong Password (8+ chars, mixed case, number/symbol)
                            </span>
                            <span className="font-mono tabular-nums text-[11px] font-semibold text-slate-500">
                              Strength: {passwordStrength.label}
                            </span>
                          </div>
                          <input
                            type="password"
                            required
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Create a strong password"
                            className="w-full min-h-[46px] px-4 text-sm text-slate-900 dark:text-white hl-clay-auth-input focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </label>

                        <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                          {[1, 2, 3, 4].map((bar) => (
                            <div
                              key={bar}
                              className={`h-1.5 rounded-full ${
                                passwordStrength.score >= bar
                                  ? passwordStrength.score >= 3
                                    ? 'bg-emerald-600'
                                    : 'bg-amber-500'
                                  : 'bg-slate-200 dark:bg-slate-800'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-2xl hl-clay-auth-input space-y-2 text-xs">
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={privacyAccepted}
                            onChange={(e) => setPrivacyAccepted(e.target.checked)}
                            className="mt-0.5 accent-indigo-600"
                          />
                          <span className="text-slate-700 dark:text-slate-300">
                            I agree to the{' '}
                            <button
                              type="button"
                              onClick={() => setUnauthView('policy')}
                              className="no-touch-delay text-indigo-600 dark:text-indigo-400 underline font-semibold"
                            >
                              GDPR &amp; CCPA Privacy Policy ({CURRENT_PRIVACY_POLICY_VERSION})
                            </button>{' '}
                            and understand my workouts, meals, and PII are stored in an isolated per-user encrypted vault.
                          </span>
                        </label>

                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={marketingOptIn}
                            onChange={(e) => setMarketingOptIn(e.target.checked)}
                            className="mt-0.5 accent-indigo-600"
                          />
                          <span className="text-slate-500 dark:text-slate-400">
                            Optional: Receive training &amp; nutrition release notes (can revoke anytime).
                          </span>
                        </label>
                      </div>

                      <button
                        type="submit"
                        disabled={busy}
                        data-testid="email-register-submit"
                        className="no-touch-delay w-full min-h-[48px] px-4 py-2.5 hl-clay-auth-cta text-white text-sm font-bold flex items-center justify-center gap-2 transition-transform active:scale-[0.985] disabled:opacity-50"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>{busy ? 'Creating Isolated Account…' : 'Create Secure Clay Vault'}</span>
                      </button>
                    </form>
                  )}
                </div>
              )}

              {unauthView === 'recovery' && (
                <form
                  onSubmit={(e) => void handlePasswordReset(e)}
                  className="hl-clay-auth-panel p-4 sm:p-5 space-y-4"
                >
                  <div className="p-3.5 rounded-2xl hl-clay-auth-input text-xs text-slate-600 dark:text-slate-300 space-y-1">
                    <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Mail className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span>Email Password Recovery</span>
                    </p>
                    <p>
                      Enter your registered email address. We will send a time-limited password reset link directly to your inbox.
                    </p>
                  </div>

                  <label className="block text-xs space-y-1.5">
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      Registered Email Address
                    </span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="athlete@domain.com"
                      className="w-full min-h-[46px] px-4 text-sm text-slate-900 dark:text-white hl-clay-auth-input focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={busy}
                    className="no-touch-delay w-full min-h-[48px] px-4 py-2.5 hl-clay-auth-cta text-white text-sm font-bold disabled:opacity-50"
                  >
                    {busy ? 'Sending Reset Link…' : 'Send Password Recovery Email'}
                  </button>
                </form>
              )}

              {unauthView === 'policy' && <PrivacyPolicyNoticeCard />}
            </>
          ) : requiresMfaChallenge ? (
            /* TOTP MFA Login Challenge Gate */
            <form onSubmit={(e) => void handleMfaChallengeSubmit(e)} className="space-y-4">
              <div className="p-4 rounded-xl hl-subtle border space-y-1.5">
                <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Two-Factor Authentication Active</span>
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Enter the 6-digit code from your Authenticator app or one of your 8-character backup recovery codes to unlock your isolated data vault.
                </p>
              </div>

              <label className="block text-xs space-y-1">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  6-Digit Authenticator Code or Recovery Code
                </span>
                <input
                  type="text"
                  required
                  value={mfaChallengeInput}
                  onChange={(e) => setMfaChallengeInput(e.target.value)}
                  placeholder="123456 or ABCD-EFGH"
                  className="w-full min-h-[46px] px-4 text-center font-mono tabular-nums text-lg tracking-widest hl-input rounded-xl"
                />
              </label>

              <div className="flex items-center gap-2.5">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold"
                >
                  {busy ? 'Verifying…' : 'Verify & Unlock Vault'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Sign Out
                </button>
              </div>
            </form>
          ) : (
            /* Authenticated Governance Workspace */
            <>
              <div className="flex items-center gap-1 p-1 rounded-xl hl-subtle border overflow-x-auto no-scrollbar">
                {(
                  [
                    { id: 'overview', label: 'Account & Isolation' },
                    { id: 'security_mfa', label: 'Security & MFA' },
                    { id: 'privacy_gdpr', label: 'Privacy & GDPR/CCPA' },
                    { id: 'audit_logs', label: `Audit Logs (${auditLogs.length})` },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      clearFeedback();
                      setAccountTab(t.id);
                    }}
                    className={`flex-1 min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      accountTab === t.id
                        ? 'bg-slate-900 dark:bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Email Verification Banner (if Email/Password user not yet verified) */}
              {!firebaseUser.emailVerified && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-amber-900 dark:text-amber-200 space-y-0.5">
                    <p className="font-bold">Verify Your Email to Enable Cloud Vault Replication</p>
                    <p>
                      Your local database is already isolated (`mesotrack-rp-db-u-{firebaseUser.uid.slice(0, 8)}`). Zero-Trust Firestore rules require a verified email before replicating to cloud storage.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        clearFeedback();
                        setBusy(true);
                        try {
                          await resendCurrentAccountVerification();
                          setSuccessMessage('Verification email sent. Check your inbox.');
                        } catch (err) {
                          setErrorMessage(formatFirebaseAuthError(err));
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg hl-card border text-xs font-semibold text-slate-800 dark:text-slate-100"
                    >
                      Resend Link
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        clearFeedback();
                        setBusy(true);
                        try {
                          const verified = await refreshCurrentEmailVerification();
                          await onRefreshGovernance();
                          if (verified) {
                            setSuccessMessage('Email verified! Encrypted cloud vault activated.');
                          } else {
                            setErrorMessage('Email is not marked verified yet. Click the link in your email first.');
                          }
                        } catch (err) {
                          setErrorMessage(formatFirebaseAuthError(err));
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold flex items-center gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>I&apos;ve Verified</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 1: OVERVIEW & ISOLATED STORAGE */}
              {accountTab === 'overview' && profile && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl hl-subtle border">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Auth Provider</p>
                      <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                        {profile.authProvider}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl hl-subtle border">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Email &amp; MFA Status</p>
                      <p className="text-sm font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">
                        {firebaseUser.emailVerified ? 'Verified' : 'Pending'} ·{' '}
                        {profile.mfaEnabled ? '2FA On' : '2FA Off'}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl hl-subtle border">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Isolated DB Partition</p>
                      <p className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1 truncate">
                        users/{firebaseUser.uid.slice(0, 12)}…
                      </p>
                    </div>
                  </div>

                  <form onSubmit={(e) => void handleSaveProfile(e)} className="p-4 rounded-xl hl-subtle border space-y-3.5">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Personal Profile &amp; Encrypted Contact Vault
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <label className="block space-y-1">
                        <span className="text-slate-600 dark:text-slate-300 font-semibold">
                          Display Name (Public Meta)
                        </span>
                        <input
                          type="text"
                          required
                          maxLength={80}
                          value={editDisplayName}
                          onChange={(e) => setEditDisplayName(e.target.value)}
                          className="w-full min-h-[42px] px-3 text-sm hl-input rounded-xl"
                        />
                      </label>

                      <label className="block space-y-1">
                        <span className="text-slate-600 dark:text-slate-300 font-semibold">
                          Recovery Phone / Emergency Note (AES-256-GCM Encrypted)
                        </span>
                        <input
                          type="text"
                          maxLength={40}
                          value={editPhoneNote}
                          onChange={(e) => setEditPhoneNote(e.target.value)}
                          placeholder="+1 555-0199 (encrypted at rest)"
                          className="w-full min-h-[42px] px-3 text-sm hl-input rounded-xl"
                        />
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] font-mono tabular-nums text-slate-500">
                        Account Email: {firebaseUser.email || 'OAuth Account'}
                      </span>
                      <button
                        type="submit"
                        disabled={busy}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                      >
                        Save Encrypted Profile
                      </button>
                    </div>
                  </form>

                  <div className="p-4 rounded-xl hl-subtle border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Encrypted Cloud Vault Sync
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Encrypt your isolated workouts, nutrition logs, and goals with AES-256-GCM before syncing to Firestore
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busy || !firebaseUser.emailVerified}
                        onClick={async () => {
                          clearFeedback();
                          setBusy(true);
                          try {
                            await onSyncEncryptedCloudVault();
                            await onRefreshGovernance();
                            setSuccessMessage('Encrypted workout & nutrition partitions synced to Firestore.');
                          } catch (err) {
                            setErrorMessage(formatFirebaseAuthError(err));
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold disabled:opacity-50"
                      >
                        Backup to Cloud Vault
                      </button>
                      <button
                        type="button"
                        disabled={busy || !firebaseUser.emailVerified}
                        onClick={async () => {
                          clearFeedback();
                          setBusy(true);
                          try {
                            await onRestoreEncryptedCloudVault();
                            await onRefreshGovernance();
                            setSuccessMessage('Restored isolated user data from encrypted cloud vault.');
                          } catch (err) {
                            setErrorMessage(formatFirebaseAuthError(err));
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl hl-card border text-xs font-semibold text-slate-800 dark:text-slate-100 disabled:opacity-50"
                      >
                        Restore Vault
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      className="min-h-[40px] px-4 py-2 rounded-xl hl-subtle border text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-red-400 flex items-center gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out of Session</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: SECURITY & MULTI-FACTOR AUTHENTICATION */}
              {accountTab === 'security_mfa' && profile && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl hl-subtle border space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          <span>Multi-Factor Authentication (RFC 6238 TOTP)</span>
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Protect your account with a 6-digit time-based one-time passcode (Google Authenticator, Authy, 1Password) plus single-use recovery codes.
                        </p>
                      </div>

                      {profile.mfaEnabled ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDisableMfa()}
                          className="min-h-[40px] px-3.5 py-2 rounded-xl hl-card border border-red-300 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-300"
                        >
                          Disable 2FA
                        </button>
                      ) : (
                        !showMfaWizard && (
                          <button
                            type="button"
                            onClick={handleStartMfaEnrollment}
                            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                          >
                            Set Up 2FA Authenticator
                          </button>
                        )
                      )}
                    </div>

                    {showMfaWizard && !profile.mfaEnabled && (
                      <form
                        onSubmit={(e) => void handleConfirmMfaEnrollment(e)}
                        className="p-4 rounded-xl hl-card border space-y-3.5 text-xs"
                      >
                        <div className="space-y-1">
                          <p className="font-bold text-slate-900 dark:text-white">
                            Step 1 · Add Secret Key to Your Authenticator App
                          </p>
                          <p className="text-slate-500 dark:text-slate-400">
                            Enter this Base32 key into Google Authenticator, Authy, or Apple Passwords (30s SHA-1, 6 digits):
                          </p>
                        </div>

                        <div className="p-3 rounded-xl hl-subtle border flex items-center justify-between gap-2">
                          <code className="font-mono tabular-nums font-bold text-slate-900 dark:text-white break-all">
                            {enrollSecret}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard?.writeText(enrollSecret);
                              setCopiedSecret(true);
                              window.setTimeout(() => setCopiedSecret(false), 1800);
                            }}
                            className="min-h-[36px] px-2.5 py-1 rounded-lg hl-card border font-semibold flex items-center gap-1 shrink-0"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>

                        <p className="text-[11px] font-mono tabular-nums text-slate-500 break-all">
                          URI: {buildOtpAuthUri(firebaseUser.email || profile.displayName, enrollSecret)}
                        </p>

                        <div className="space-y-1.5">
                          <p className="font-bold text-slate-900 dark:text-white">
                            Step 2 · Save Your 6 Single-Use Backup Recovery Codes
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {enrollRecoveryCodes.map((code) => (
                              <div
                                key={code}
                                className="p-2 rounded-lg hl-subtle border font-mono tabular-nums font-semibold text-center text-slate-800 dark:text-slate-200"
                              >
                                {code}
                              </div>
                            ))}
                          </div>
                        </div>

                        <label className="block space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 dark:text-white">
                              Step 3 · Enter 6-Digit Verification Code
                            </span>
                            {liveTotpPreview && (
                              <span className="font-mono tabular-nums text-[11px] text-blue-600 dark:text-blue-400">
                                Current sync token: {liveTotpPreview}
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            required
                            maxLength={6}
                            value={enrollCodeInput}
                            onChange={(e) => setEnrollCodeInput(e.target.value)}
                            placeholder="Enter 6-digit code"
                            className="w-full min-h-[42px] px-3 font-mono tabular-nums text-base tracking-widest hl-input rounded-xl"
                          />
                        </label>

                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            disabled={busy}
                            className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                          >
                            {busy ? 'Activating…' : 'Verify & Enable MFA'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowMfaWizard(false)}
                            className="min-h-[40px] px-3.5 py-2 rounded-xl hl-subtle border font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                  {/* Active Security Controls Matrix */}
                  <div className="p-4 rounded-xl hl-subtle border space-y-2.5 text-xs">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>Active Defense-in-Depth Controls</span>
                    </h3>
                    <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
                      <div className="py-2 flex items-center justify-between gap-3">
                        <span className="text-slate-600 dark:text-slate-300">PII &amp; Secret Encryption at Rest</span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                          AES-256-GCM (PBKDF2-SHA256 · 100k iter)
                        </span>
                      </div>
                      <div className="py-2 flex items-center justify-between gap-3">
                        <span className="text-slate-600 dark:text-slate-300">Database Tenant Isolation</span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                          Split-Collection Firestore + UID IndexedDB
                        </span>
                      </div>
                      <div className="py-2 flex items-center justify-between gap-3">
                        <span className="text-slate-600 dark:text-slate-300">Input Validation &amp; Transport</span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                          XSS/SQLi Regex Guard + HTTPS HSTS
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: PRIVACY POLICY, GDPR & CCPA RIGHTS */}
              {accountTab === 'privacy_gdpr' && consent && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl hl-subtle border space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Granular Privacy &amp; Consent Controls
                      </h3>
                      <span className="font-mono tabular-nums text-[11px] text-slate-500">
                        Policy {consent.policyVersion}
                      </span>
                    </div>

                    <label className="flex items-center justify-between gap-3 py-2 border-t border-slate-200/80 dark:border-slate-800">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          Essential Isolated Storage (Required)
                        </p>
                        <p className="text-slate-500 dark:text-slate-400">
                          Required for core authentication, session security, and local workout logs.
                        </p>
                      </div>
                      <input type="checkbox" checked disabled className="accent-blue-600" />
                    </label>

                    <label className="flex items-center justify-between gap-3 py-2 border-t border-slate-200/80 dark:border-slate-800 cursor-pointer">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          Encrypted Cloud Vault Replication
                        </p>
                        <p className="text-slate-500 dark:text-slate-400">
                          Replicate AES-256-GCM encrypted workouts and nutrition logs to your Firestore vault.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={consent.cloudSyncConsent}
                        onChange={(e) =>
                          void handleConsentChange({ cloudSyncConsent: e.target.checked })
                        }
                        className="accent-blue-600"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 py-2 border-t border-slate-200/80 dark:border-slate-800 cursor-pointer">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          CCPA &ldquo;Do Not Sell or Share My Personal Information&rdquo;
                        </p>
                        <p className="text-slate-500 dark:text-slate-400">
                          Enforces strict zero third-party data broker or cross-context ad sharing.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={consent.doNotSellMyInfo}
                        onChange={(e) =>
                          void handleConsentChange({ doNotSellMyInfo: e.target.checked })
                        }
                        className="accent-blue-600"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 py-2 border-t border-slate-200/80 dark:border-slate-800 cursor-pointer">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          Anonymous Product Diagnostics
                        </p>
                        <p className="text-slate-500 dark:text-slate-400">
                          Optional crash and performance telemetry without personal identifiers.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={consent.analyticsConsent}
                        onChange={(e) =>
                          void handleConsentChange({ analyticsConsent: e.target.checked })
                        }
                        className="accent-blue-600"
                      />
                    </label>

                    <div className="flex items-center justify-between gap-3 py-2 border-t border-slate-200/80 dark:border-slate-800">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          Audit Log Retention Window
                        </p>
                        <p className="text-slate-500 dark:text-slate-400">
                          Compliance retention period for security access logs (30–365 days).
                        </p>
                      </div>
                      <select
                        value={consent.auditRetentionDays}
                        onChange={(e) =>
                          void handleConsentChange({
                            auditRetentionDays: Number(e.target.value) || 180,
                          })
                        }
                        className="min-h-[38px] px-2.5 font-mono tabular-nums hl-input rounded-lg"
                      >
                        <option value={30}>30 days</option>
                        <option value={90}>90 days</option>
                        <option value={180}>180 days</option>
                        <option value={365}>365 days</option>
                      </select>
                    </div>
                  </div>

                  {/* GDPR Data Portability & Right to Erasure */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-xl hl-subtle border space-y-2.5 flex flex-col justify-between">
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-blue-600" />
                          <span>GDPR Art. 20 · Data Portability</span>
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Download a machine-readable JSON archive of your profile, consents, audit logs, workouts, and nutrition records.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          clearFeedback();
                          await recordComplianceAuditEvent({
                            uid: firebaseUser.uid,
                            action: 'DATA_EXPORT_GDPR',
                            category: 'privacy',
                            summary: 'Exported portable GDPR/CCPA personal data JSON archive.',
                          });
                          await onExportGdprJson();
                          await onRefreshGovernance();
                          setSuccessMessage('Portable GDPR/CCPA data archive downloaded.');
                        }}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export Personal Data (.JSON)</span>
                      </button>
                    </div>

                    <div className="p-4 rounded-xl hl-subtle border border-red-200 dark:border-red-900/60 space-y-2.5 flex flex-col justify-between">
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                          <Trash2 className="w-4 h-4" />
                          <span>GDPR Art. 17 · Right to Erasure</span>
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Permanently delete your account, encrypted PII vault, cloud workouts, and isolated local database.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirmBox((v) => !v)}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
                      >
                        Delete Account &amp; Erase Data
                      </button>
                    </div>
                  </div>

                  {showDeleteConfirmBox && (
                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 space-y-3 text-xs">
                      <p className="font-bold text-red-900 dark:text-red-200">
                        Irreversible Action: Type <code className="font-mono">DELETE</code> to permanently erase your account and all stored personal data.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          placeholder="Type DELETE"
                          className="min-h-[40px] px-3 font-mono hl-input rounded-xl"
                        />
                        <button
                          type="button"
                          disabled={busy || deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
                          onClick={() => void handlePermanentAccountErasure()}
                          className="min-h-[40px] px-4 py-2 rounded-xl bg-red-600 text-white font-semibold disabled:opacity-40"
                        >
                          {busy ? 'Erasing All Data…' : 'Confirm Permanent Erasure'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowDeleteConfirmBox(false);
                            setDeleteConfirmText('');
                          }}
                          className="min-h-[40px] px-3 py-2 rounded-xl hl-card border font-semibold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <PrivacyPolicyNoticeCard />
                </div>
              )}

              {/* TAB 4: COMPLIANCE AUDIT LOGS */}
              {accountTab === 'audit_logs' && (
                <div className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <div className="sm:col-span-8 relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={auditQuery}
                        onChange={(e) => setAuditQuery(e.target.value)}
                        placeholder="Search access & security audit events…"
                        className="w-full min-h-[40px] pl-9 pr-3 text-xs hl-input rounded-xl"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <select
                        value={auditCategoryFilter}
                        onChange={(e) => setAuditCategoryFilter(e.target.value)}
                        className="w-full min-h-[40px] px-2.5 text-xs font-semibold hl-input rounded-xl"
                      >
                        <option value="all">All Audit Categories</option>
                        <option value="authentication">Authentication</option>
                        <option value="mfa">MFA / 2FA</option>
                        <option value="privacy">GDPR / Privacy</option>
                        <option value="data_access">Vault Data Access</option>
                      </select>
                    </div>
                  </div>

                  {filteredAuditLogs.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500 hl-subtle rounded-xl border">
                      No audit events match the current filter.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                      <div className="max-h-80 overflow-y-auto divide-y divide-slate-200/80 dark:divide-slate-800">
                        {filteredAuditLogs.map((log) => (
                          <div key={log.eventId} className="px-3.5 py-2.5 text-xs space-y-0.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                                {log.action}
                              </span>
                              <span className="font-mono tabular-nums text-[11px] text-slate-500">
                                {new Date(log.createdAtIso).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-slate-600 dark:text-slate-300">{log.summary}</p>
                            <p className="font-mono tabular-nums text-[10px] text-slate-400">
                              Category: {log.category} · Actor: {log.actorUid.slice(0, 10)}… · Origin:{' '}
                              {log.ipHint}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const PrivacyPolicyNoticeCard: React.FC = () => (
  <div className="p-4 rounded-xl hl-subtle border space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
    <div className="flex items-center justify-between gap-2">
      <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
        <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        <span>Privacy Policy &amp; Data Protection Notice (GDPR &amp; CCPA)</span>
      </h4>
      <span className="font-mono tabular-nums text-[11px] text-slate-500">
        {CURRENT_PRIVACY_POLICY_VERSION}
      </span>
    </div>
    <p>
      <strong>1. Data Collected &amp; Purpose:</strong> We store your authentication identifier, chosen display name, workout logs, bodyweight/nutrition logs, and security audit trail solely to provide personalized training &amp; nutrition tracking across sessions.
    </p>
    <p>
      <strong>2. Strict Tenant Isolation &amp; Encryption:</strong> Each user&apos;s data is isolated in a dedicated IndexedDB namespace on device and under owner-locked Split-Collection Firestore paths (`users/&#123;uid&#125;/private/pii` and `users/&#123;uid&#125;/vault/*`) encrypted with WebCrypto `AES-256-GCM` (`PBKDF2-SHA256`). Passwords are never stored in plain text.
    </p>
    <p>
      <strong>3. Your Rights (GDPR Art. 15–20 &amp; CCPA):</strong> You have the right to inspect, rectify, export in portable JSON format, restrict optional processing, opt out of any personal data sale/sharing, and permanently erase your account and all associated records at any time.
    </p>
  </div>
);
