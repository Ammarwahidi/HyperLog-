import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { Check, MessageSquare, Send, Star, Trash2 } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';

export const FEEDBACK_CATEGORIES = [
  'Workout Tracker',
  'Forearms & Grip',
  'Breathing Audio',
  'Indian Recipes',
  'UI Simplicity',
  'Android APK Install',
  'Bug Report',
  'Feature Request',
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

interface FeedbackItem {
  feedbackId: string;
  rating: number;
  category: FeedbackCategory;
  message: string;
  deviceInfo: string;
  status: 'open' | 'triaged' | 'resolved';
  createdAtIso: string;
  storageMode: 'cloud' | 'local';
}

const LOCAL_FEEDBACK_STORAGE_KEY = 'hyperlog_beta_feedback_v2_8';

function sanitizePlainText(input: string, maxLen: number): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function detectSanitizedDeviceInfo(): string {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'HyperLog v2.8.0 (Build 10) Web Runtime';
  }
  const ua = navigator.userAgent || 'Browser';
  const platform = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'iOS'
      : /Mac/i.test(ua)
        ? 'macOS'
        : /Win/i.test(ua)
          ? 'Windows'
          : 'Linux';
  const viewport = `${window.innerWidth}x${window.innerHeight}`;
  const raw = `HyperLog v2.8.0 (Build 10) · ${platform} · ${viewport}`;
  return sanitizePlainText(raw, 240) || 'HyperLog v2.8.0 (Build 10)';
}

function loadLocalFeedbackItems(): FeedbackItem[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_FEEDBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FeedbackItem[]) : [];
  } catch {
    return [];
  }
}

function saveLocalFeedbackItems(items: FeedbackItem[]): void {
  try {
    window.localStorage.setItem(LOCAL_FEEDBACK_STORAGE_KEY, JSON.stringify(items.slice(0, 30)));
  } catch {
    // Ignore storage quota errors
  }
}

function isFirestorePermissionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Missing or insufficient permissions') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('permission-denied')
  );
}

/**
 * Post-Testing Beta Feedback & Bug Triage Panel (v2.8.0 · Build 10)
 *
 * Beginner-friendly explanation:
 * - Lets testers rate the app (1–5 stars), pick a feature area, and describe any bug or idea.
 * - When signed in with a verified account, saves directly to the user's isolated Firestore
 *   `/users/{uid}/feedback/{feedbackId}` collection and logs a GDPR/CCPA audit entry.
 * - When testing offline without an account, stores reports locally on the device so zero
 *   feedback is ever lost.
 */
export const BetaFeedbackPanel: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => auth.currentUser);
  const [rating, setRating] = useState<number>(5);
  const [category, setCategory] = useState<FeedbackCategory>('Android APK Install');
  const [message, setMessage] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedbackNotice, setFeedbackNotice] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);
  const [items, setItems] = useState<FeedbackItem[]>(() => loadLocalFeedbackItems());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUser(u);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let active = true;
    const fetchCloudFeedback = async () => {
      const localItems = loadLocalFeedbackItems();
      if (!currentUser || !currentUser.emailVerified) {
        if (active) setItems(localItems);
        return;
      }

      const uid = currentUser.uid;
      const feedbackColPath = `users/${uid}/feedback`;
      try {
        const q = query(
          collection(db, 'users', uid, 'feedback'),
          where('uid', '==', uid),
          limit(15)
        );
        const snap = await getDocs(q);
        const cloudItems: FeedbackItem[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          const ts = d.createdAt instanceof Timestamp ? d.createdAt.toDate().toISOString() : new Date().toISOString();
          cloudItems.push({
            feedbackId: String(d.feedbackId || docSnap.id),
            rating: Number(d.rating) || 5,
            category: (FEEDBACK_CATEGORIES.includes(d.category)
              ? d.category
              : 'Bug Report') as FeedbackCategory,
            message: String(d.message || ''),
            deviceInfo: String(d.deviceInfo || 'HyperLog v2.8.0'),
            status:
              d.status === 'resolved' || d.status === 'triaged' ? d.status : 'open',
            createdAtIso: ts,
            storageMode: 'cloud',
          });
        });

        const seen = new Set(cloudItems.map((c) => c.feedbackId));
        const merged = [
          ...cloudItems,
          ...localItems.filter((l) => !seen.has(l.feedbackId)),
        ].sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));

        if (active) setItems(merged);
      } catch (err) {
        if (isFirestorePermissionError(err)) {
          handleFirestoreError(err, OperationType.LIST, feedbackColPath);
        }
        if (active) setItems(localItems);
      }
    };

    void fetchCloudFeedback();
    return () => {
      active = false;
    };
  }, [currentUser]);

  const ensureActiveUserRootDoc = async (user: User): Promise<void> => {
    const uid = user.uid;
    const userPath = `users/${uid}`;
    const userRef = doc(db, 'users', uid);
    try {
      const existingSnap = await getDoc(userRef);
      if (existingSnap.exists() && existingSnap.data()?.accountStatus === 'active') {
        return;
      }
    } catch (err) {
      if (isFirestorePermissionError(err)) {
        handleFirestoreError(err, OperationType.GET, userPath);
      }
      throw err;
    }

    const rawProvider = user.providerData[0]?.providerId || 'password';
    const authProvider =
      rawProvider === 'google.com' || rawProvider === 'facebook.com'
        ? rawProvider
        : 'password';
    const cleanDisplayName =
      sanitizePlainText(
        user.displayName || user.email?.split('@')[0] || 'HyperLog Athlete',
        80
      ) || 'HyperLog Athlete';

    try {
      await setDoc(userRef, {
        uid,
        displayName: cleanDisplayName,
        authProvider,
        mfaEnabled: false,
        accountStatus: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      if (isFirestorePermissionError(err)) {
        handleFirestoreError(err, OperationType.CREATE, userPath);
      }
      throw err;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const cleanMessage = sanitizePlainText(message, 1200);
    if (cleanMessage.length < 3) {
      setFeedbackNotice({
        tone: 'error',
        text: 'Please enter at least 3 characters describing your test result or suggestion.',
      });
      return;
    }

    setSubmitting(true);
    setFeedbackNotice(null);

    const feedbackId = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8).replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const deviceInfo = detectSanitizedDeviceInfo();
    const safeRating = Math.min(5, Math.max(1, Math.round(rating)));
    const nowIso = new Date().toISOString();

    if (currentUser && currentUser.emailVerified && /^[a-zA-Z0-9_-]+$/.test(currentUser.uid)) {
      const uid = currentUser.uid;
      const feedbackDocPath = `users/${uid}/feedback/${feedbackId}`;
      const auditId = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7).replace(/[^a-zA-Z0-9_-]/g, '')}`;
      const auditPath = `users/${uid}/auditLogs/${auditId}`;

      try {
        await ensureActiveUserRootDoc(currentUser);

        await setDoc(doc(db, 'users', uid, 'feedback', feedbackId), {
          uid,
          feedbackId,
          rating: safeRating,
          category,
          message: cleanMessage,
          deviceInfo,
          status: 'open',
          createdAt: serverTimestamp(),
        });

        try {
          await setDoc(doc(db, 'users', uid, 'auditLogs', auditId), {
            uid,
            eventId: auditId,
            action: 'FEEDBACK_SUBMITTED',
            category: 'data_access',
            actorUid: uid,
            summary: sanitizePlainText(
              `Submitted ${safeRating}/5 beta feedback under ${category}`,
              280
            ),
            ipHint: 'client-session',
            createdAt: serverTimestamp(),
          });
        } catch (auditErr) {
          if (isFirestorePermissionError(auditErr)) {
            handleFirestoreError(auditErr, OperationType.CREATE, auditPath);
          }
        }

        const newItem: FeedbackItem = {
          feedbackId,
          rating: safeRating,
          category,
          message: cleanMessage,
          deviceInfo,
          status: 'open',
          createdAtIso: nowIso,
          storageMode: 'cloud',
        };
        setItems((prev) => [newItem, ...prev]);
        setMessage('');
        setFeedbackNotice({
          tone: 'success',
          text: 'Feedback saved to your isolated Cloud Vault for v2.8 triage.',
        });
        setSubmitting(false);
        return;
      } catch (err) {
        if (isFirestorePermissionError(err)) {
          handleFirestoreError(err, OperationType.CREATE, feedbackDocPath);
        }
        // Network offline fallback: persist locally below
      }
    }

    const localEntry: FeedbackItem = {
      feedbackId,
      rating: safeRating,
      category,
      message: cleanMessage,
      deviceInfo,
      status: 'open',
      createdAtIso: nowIso,
      storageMode: 'local',
    };
    const nextLocal = [localEntry, ...loadLocalFeedbackItems()].slice(0, 30);
    saveLocalFeedbackItems(nextLocal);
    setItems((prev) => [localEntry, ...prev.filter((p) => p.feedbackId !== feedbackId)]);
    setMessage('');
    setFeedbackNotice({
      tone: 'success',
      text: 'Feedback saved offline on this device. Sign in to Cloud Vault anytime to sync.',
    });
    setSubmitting(false);
  };

  const handleRemoveLocal = (feedbackId: string) => {
    const remaining = loadLocalFeedbackItems().filter((i) => i.feedbackId !== feedbackId);
    saveLocalFeedbackItems(remaining);
    setItems((prev) => prev.filter((i) => i.feedbackId !== feedbackId));
  };

  return (
    <section
      data-testid="beta-feedback-panel"
      className="hl-card rounded-2xl p-4 sm:p-6 space-y-4"
    >
      <div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <span>Post-Testing Beta Feedback &amp; Bug Triage</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Tested the v2.8.0 Android APK or web app? Log device results, UI notes, or bug reports
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
        {/* Star Rating Row (44px touch hitboxes) */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Overall Build Experience
          </span>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
            {[1, 2, 3, 4, 5].map((starVal) => {
              const active = starVal <= rating;
              return (
                <button
                  key={starVal}
                  type="button"
                  role="radio"
                  aria-checked={rating === starVal}
                  aria-label={`${starVal} out of 5 stars`}
                  onClick={() => setRating(starVal)}
                  className="min-h-[44px] min-w-[44px] rounded-xl hl-subtle border flex items-center justify-center transition-colors hover:border-blue-500"
                >
                  <Star
                    className={`w-4 h-4 ${
                      active
                        ? 'text-amber-500 fill-amber-500'
                        : 'text-slate-400 dark:text-slate-600'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Category Select */}
        <div className="space-y-1">
          <label
            htmlFor="beta-feedback-category"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            Feature Area
          </label>
          <select
            id="beta-feedback-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
            className="w-full min-h-[44px] px-3.5 py-2 text-xs font-medium hl-input rounded-xl"
          >
            {FEEDBACK_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Feedback Notes */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <label
              htmlFor="beta-feedback-message"
              className="font-semibold text-slate-700 dark:text-slate-300"
            >
              Observations or Steps to Reproduce
            </label>
            <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
              {message.length}/1200
            </span>
          </div>
          <textarea
            id="beta-feedback-message"
            rows={3}
            maxLength={1200}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Share how APK installation, set haptics, forearm workouts, Indian recipes, or breathing audio performed on your phone…"
            className="w-full px-3.5 py-2.5 text-xs hl-input rounded-xl resize-y"
          />
        </div>

        {feedbackNotice && (
          <div
            className={`px-3.5 py-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
              feedbackNotice.tone === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200'
            }`}
          >
            {feedbackNotice.tone === 'success' && <Check className="w-4 h-4 shrink-0" />}
            <span>{feedbackNotice.text}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-60"
        >
          <Send className="w-3.5 h-3.5 shrink-0" />
          <span>{submitting ? 'Saving Report…' : 'Submit Testing Feedback'}</span>
        </button>
      </form>

      {items.length > 0 && (
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Recent Reports ({items.length})
          </div>
          <div className="max-h-52 overflow-y-auto divide-y divide-slate-200/80 dark:divide-slate-800 pr-1">
            {items.slice(0, 6).map((item) => (
              <div key={item.feedbackId} className="py-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 font-sans">
                      {item.category}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{item.rating}/5</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.status}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.storageMode === 'cloud' ? 'Cloud Vault' : 'Device Local'}</span>
                  </div>
                  {item.storageMode === 'local' && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLocal(item.feedbackId)}
                      className="min-h-[32px] min-w-[32px] flex items-center justify-center text-slate-400 hover:text-red-500 shrink-0"
                      aria-label="Delete local feedback note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed break-words">
                  {item.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
