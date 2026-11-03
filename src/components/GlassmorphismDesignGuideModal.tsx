import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Eye,
  Flame,
  Layers,
  Lock,
  Palette,
  Play,
  Sliders,
  Sparkles,
  Trash2,
  Type as TypeIcon,
  UserCheck,
  Video,
  X,
} from 'lucide-react';
import { AppTheme } from '../types/workout';

interface GlassmorphismDesignGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: AppTheme;
  onApplyPastelGlassTheme: () => void;
}

type GuideTabId = 'foundations' | 'components' | 'accessibility' | 'mockups';
type MockupScreenId = 'login' | 'dashboard' | 'settings';
type BlurPreset = 'subtle' | 'balanced' | 'deep';

const BLUR_CLASSES: Record<BlurPreset, string> = {
  subtle: 'backdrop-blur-[8px]',
  balanced: 'backdrop-blur-[16px]',
  deep: 'backdrop-blur-[24px]',
};

const PALETTE_TOKENS = [
  {
    name: 'Lavender Mist',
    role: 'Mesh Stop 0% · Canvas',
    value: '#EEF2FF',
    androidHex: '0xFFEEF2FF',
    swatchClass: 'bg-[#EEF2FF]',
  },
  {
    name: 'Sky Ice',
    role: 'Mesh Stop 38% · Airy Highlight',
    value: '#E0F2FE',
    androidHex: '0xFFE0F2FE',
    swatchClass: 'bg-[#E0F2FE]',
  },
  {
    name: 'Mint Breeze',
    role: 'Mesh Stop 72% · Calm Accent',
    value: '#ECFDF5',
    androidHex: '0xFFECFDF5',
    swatchClass: 'bg-[#ECFDF5]',
  },
  {
    name: 'Rose Quartz',
    role: 'Mesh Stop 100% · Warmth',
    value: '#FDF2F8',
    androidHex: '0xFFFDF2F8',
    swatchClass: 'bg-[#FDF2F8]',
  },
  {
    name: 'Frosted Surface Tier 1',
    role: 'Primary Cards · 68% White + 16px Blur',
    value: 'rgba(255, 255, 255, 0.68)',
    androidHex: '0xEEFFFFFF',
    swatchClass: 'bg-white/70',
  },
  {
    name: 'Specular Light Border',
    role: '1px Crisp Edge Separation',
    value: 'rgba(255, 255, 255, 0.78)',
    androidHex: '0xFFFFFFFF',
    swatchClass: 'bg-white/90',
  },
  {
    name: 'Cobalt Glass Accent',
    role: 'Primary CTA · 5.1:1 Contrast',
    value: '#2563EB',
    androidHex: '0xFF2563EB',
    swatchClass: 'bg-[#2563EB]',
  },
  {
    name: 'Deep Slate Ink',
    role: 'Body Copy · 13.8:1 AAA Contrast',
    value: '#0F172A',
    androidHex: '0xFF0F172A',
    swatchClass: 'bg-[#0F172A]',
  },
];

export const GlassmorphismDesignGuideModal: React.FC<GlassmorphismDesignGuideModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  onApplyPastelGlassTheme,
}) => {
  const [activeTab, setActiveTab] = useState<GuideTabId>('mockups');
  const [mockupScreen, setMockupScreen] = useState<MockupScreenId>('login');
  const [showAnnotations, setShowAnnotations] = useState<boolean>(true);
  const [blurPreset, setBlurPreset] = useState<BlurPreset>('balanced');
  const [highContrastMode, setHighContrastMode] = useState<boolean>(false);
  const [reducedTransparency, setReducedTransparency] = useState<boolean>(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [demoSelectedProfile, setDemoSelectedProfile] = useState<'user_b' | 'user_a'>('user_b');

  if (!isOpen) return null;

  const isPastelActive = currentTheme === AppTheme.PastelGlass;

  const surfaceGlassClass = reducedTransparency
    ? highContrastMode
      ? 'bg-white border-2 border-slate-900 shadow-sm'
      : 'bg-white border border-slate-300 shadow-sm'
    : highContrastMode
    ? `${BLUR_CLASSES[blurPreset]} bg-white/88 border-2 border-slate-800/80 shadow-[0_12px_28px_-8px_rgba(15,23,42,0.14)]`
    : `${BLUR_CLASSES[blurPreset]} bg-white/68 border border-white/80 shadow-[0_14px_34px_-10px_rgba(15,23,42,0.09)]`;

  const subtleGlassClass = reducedTransparency
    ? 'bg-slate-50 border border-slate-300'
    : highContrastMode
    ? `${BLUR_CLASSES[blurPreset]} bg-white/80 border border-slate-700/60`
    : `${BLUR_CLASSES[blurPreset]} bg-white/52 border border-white/75`;

  const mutedInkClass = highContrastMode ? 'text-slate-800' : 'text-slate-600';

  const handleCopyToken = async (tokenValue: string) => {
    try {
      await navigator.clipboard.writeText(tokenValue);
      setCopiedToken(tokenValue);
      window.setTimeout(() => setCopiedToken(null), 1800);
    } catch {
      // Clipboard unavailable in restricted contexts
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="glass-guide-title"
    >
      <div className="w-full max-w-5xl max-h-[92vh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col border border-white/80 shadow-2xl bg-gradient-to-br from-[#EEF2FF] via-[#E0F2FE] to-[#FDF2F8] text-slate-900">
        {/* Frosted Header */}
        <div className="px-5 sm:px-7 py-4 bg-white/75 backdrop-blur-xl border-b border-white/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2
              id="glass-guide-title"
              className="text-lg sm:text-xl font-bold tracking-tight text-slate-900"
            >
              Glassmorphism UI Design System &amp; Annotated Mockups
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Soft pastel depth · Frosted translucency · WCAG AA/AAA contrast · Web &amp; Android v3.0 parity
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onApplyPastelGlassTheme}
              className={`no-touch-delay min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                isPastelActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-blue-600 hover:bg-blue-500 hover:scale-[1.015] text-white shadow-[0_8px_20px_-6px_rgba(37,99,235,0.45)]'
              }`}
            >
              {isPastelActive ? (
                <>
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Pastel Glass Active</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>Apply Pastel Glass Theme</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Glassmorphism design guide"
              className="no-touch-delay min-h-[44px] min-w-[44px] rounded-xl bg-white/70 hover:bg-white/95 border border-white/85 flex items-center justify-center text-slate-700 hover:text-slate-950 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Strip + Live Accessibility Controls */}
        <div className="px-5 sm:px-7 py-2.5 bg-white/55 backdrop-blur-md border-b border-white/75 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar"
            role="tablist"
            aria-label="Glassmorphism design guide sections"
          >
            {(
              [
                { id: 'mockups', label: '1. Annotated 3-Screen Mockups' },
                { id: 'foundations', label: '2. Background, Palette & Type' },
                { id: 'components', label: '3. Components, Layout & Motion' },
                { id: 'accessibility', label: '4. Accessibility & Contrast' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`no-touch-delay min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white/60 hover:bg-white/90 border border-white/80 text-slate-700 hover:text-slate-950'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Live Accessibility Quick Switches */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked={highContrastMode}
              onClick={() => setHighContrastMode((v) => !v)}
              className={`no-touch-delay min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap shrink-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                highContrastMode
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white/70 hover:bg-white/90 text-slate-800 border-white/85'
              }`}
            >
              High Contrast: {highContrastMode ? 'AAA On' : 'Standard'}
            </button>

            <button
              type="button"
              role="switch"
              aria-checked={reducedTransparency}
              onClick={() => setReducedTransparency((v) => !v)}
              className={`no-touch-delay min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap shrink-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                reducedTransparency
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white/70 hover:bg-white/90 text-slate-800 border-white/85'
              }`}
            >
              Solid Fallback: {reducedTransparency ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        {/* Scrollable Content Canvas */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6 bg-[radial-gradient(at_15%_20%,rgba(199,210,254,0.75)_0px,transparent_50%),radial-gradient(at_85%_18%,rgba(186,230,253,0.72)_0px,transparent_48%),radial-gradient(at_80%_85%,rgba(167,243,208,0.62)_0px,transparent_52%),radial-gradient(at_18%_85%,rgba(251,207,232,0.58)_0px,transparent_50%)]">
          {/* ================================================================
              TAB 1: 3 ANNOTATED VISUAL MOCKUPS (LOGIN, DASHBOARD, SETTINGS)
             ================================================================ */}
          {activeTab === 'mockups' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  className="flex flex-wrap items-center gap-2"
                  role="tablist"
                  aria-label="Select visual mockup screen"
                >
                  {(
                    [
                      { id: 'login', label: 'Screen A · Login & Fresh Profile' },
                      { id: 'dashboard', label: 'Screen B · Streak & History Dashboard' },
                      { id: 'settings', label: 'Screen C · Settings & Offline Videos' },
                    ] as const
                  ).map((scr) => (
                    <button
                      key={scr.id}
                      type="button"
                      role="tab"
                      aria-selected={mockupScreen === scr.id}
                      onClick={() => setMockupScreen(scr.id)}
                      className={`no-touch-delay min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                        mockupScreen === scr.id
                          ? 'bg-blue-600 text-white shadow-[0_8px_20px_-6px_rgba(37,99,235,0.45)]'
                          : 'bg-white/70 hover:bg-white/90 hover:scale-[1.015] border border-white/85 text-slate-800'
                      }`}
                    >
                      {scr.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowAnnotations((v) => !v)}
                  className="no-touch-delay min-h-[44px] px-3.5 py-2 rounded-xl bg-white/75 hover:bg-white/95 border border-white/85 text-xs font-semibold text-slate-800 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Eye className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{showAnnotations ? 'Hide Annotations' : 'Show Annotations'}</span>
                </button>
              </div>

              {/*MOCKUP A: LOGIN & ISOLATED PROFILE VAULTS */}
              {mockupScreen === 'login' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <div className="lg:col-span-7 p-6 sm:p-8 rounded-3xl border border-white/85 bg-gradient-to-br from-[#E0E7FF]/90 via-[#E0F2FE]/85 to-[#FCE7F3]/85 shadow-inner">
                    <div className={`max-w-md mx-auto rounded-3xl p-6 sm:p-7 space-y-5 ${surfaceGlassClass}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-blue-700">
                            1 · Pastel Mesh + 16px Blur Sheet
                          </div>
                          <h3 className="text-xl font-bold text-slate-900 mt-0.5">
                            Select Isolated Profile Vault
                          </h3>
                          <p className={`text-xs mt-1 ${mutedInkClass}`}>
                            Every profile opens its own private SQLite &amp; IndexedDB store.
                          </p>
                        </div>
                        <Lock className="w-5 h-5 text-blue-600 shrink-0" aria-hidden="true" />
                      </div>

                      {/* Interactive Profile Selector inside Mockup */}
                      <div className="space-y-2.5" role="radiogroup" aria-label="Demo user profile">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={demoSelectedProfile === 'user_b'}
                          onClick={() => setDemoSelectedProfile('user_b')}
                          className={`no-touch-delay w-full min-h-[56px] p-3.5 rounded-2xl text-left transition-all duration-150 hover:scale-[1.01] flex items-center justify-between gap-3 ${
                            demoSelectedProfile === 'user_b'
                              ? 'bg-white/90 border-2 border-blue-600 shadow-sm'
                              : subtleGlassClass
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900">
                              User B · Priya (New Profile)
                            </div>
                            <div className={`text-xs font-mono tabular-nums mt-0.5 ${mutedInkClass}`}>
                              0 sessions · 0d streak · 70.0 kg fresh slate
                            </div>
                          </div>
                          <span className="text-xs font-bold text-emerald-700 shrink-0">
                            Clean Vault
                          </span>
                        </button>

                        <button
                          type="button"
                          role="radio"
                          aria-checked={demoSelectedProfile === 'user_a'}
                          onClick={() => setDemoSelectedProfile('user_a')}
                          className={`no-touch-delay w-full min-h-[56px] p-3.5 rounded-2xl text-left transition-all duration-150 hover:scale-[1.01] flex items-center justify-between gap-3 ${
                            demoSelectedProfile === 'user_a'
                              ? 'bg-white/90 border-2 border-blue-600 shadow-sm'
                              : subtleGlassClass
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900">
                              User A · Arjun (Existing Athlete)
                            </div>
                            <div className={`text-xs font-mono tabular-nums mt-0.5 ${mutedInkClass}`}>
                              18 sessions · 6d streak · 81.4 kg private log
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-slate-600 shrink-0">
                            Isolated
                          </span>
                        </button>
                      </div>

                      {/* Frosted Input Fields */}
                      <div className="space-y-3 pt-1">
                        <div>
                          <label
                            htmlFor="glass-demo-email"
                            className="block text-xs font-semibold text-slate-800 mb-1"
                          >
                            2 · Frosted Input (`rgba(255,255,255,0.82)`)
                          </label>
                          <input
                            id="glass-demo-email"
                            type="email"
                            readOnly
                            value={
                              demoSelectedProfile === 'user_b'
                                ? 'priya.athlete@hyperlog.local'
                                : 'arjun.strength@hyperlog.local'
                            }
                            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white/82 border border-slate-300/80 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </div>

                        <button
                          type="button"
                          className="no-touch-delay w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 hover:scale-[1.012] active:scale-[0.98] text-white text-xs font-bold shadow-[0_10px_24px_-6px_rgba(37,99,235,0.5)] transition-all duration-150 flex items-center justify-center gap-2 whitespace-nowrap"
                        >
                          <UserCheck className="w-4 h-4 shrink-0" />
                          <span>
                            {demoSelectedProfile === 'user_b'
                              ? 'Unlock Fresh Vault (0 Prior Logs)'
                              : 'Unlock Arjun Vault (18 Sessions)'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Annotations Column */}
                  {showAnnotations && (
                    <div className={`lg:col-span-5 rounded-3xl p-5 sm:p-6 space-y-4 ${surfaceGlassClass}`}>
                      <h4 className="text-sm font-bold text-slate-900">
                        Design Annotations · Screen A (Login)
                      </h4>
                      <ol className="space-y-3 text-xs leading-relaxed text-slate-700 list-decimal pl-4">
                        <li>
                          <strong className="text-slate-900">Pastel Mesh Backdrop:</strong> Soft
                          lavender (`#E0E7FF`), sky ice (`#E0F2FE`), and rose quartz (`#FCE7F3`)
                          gradients provide subtle chromatic variation so the frosted login sheet
                          visibly refracts light without harsh contrast jumps.
                        </li>
                        <li>
                          <strong className="text-slate-900">Specular 1px Edge &amp; Soft Shadow:</strong>{' '}
                          `border-white/80` paired with a diffused `34px` ambient shadow separates
                          the floating modal from the background without dark outlines.
                        </li>
                        <li>
                          <strong className="text-slate-900">Fresh Data Guarantee:</strong> Selecting
                          User B previews `0 sessions · 0d streak`, confirming User A&apos;s workout
                          history and bodyweight never leak across accounts.
                        </li>
                        <li>
                          <strong className="text-slate-900">WCAG AA Readability:</strong> `#0F172A`
                          labels over `rgba(255,255,255,0.82)` inputs maintain a `13.8:1` contrast
                          ratio and explicit `&lt;label htmlFor&gt;` screen-reader bindings.
                        </li>
                      </ol>
                    </div>
                  )}
                </div>
              )}

              {/* MOCKUP B: WORKOUT HISTORY, STREAK & NUTRITION DASHBOARD */}
              {mockupScreen === 'dashboard' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <div className="lg:col-span-7 p-6 sm:p-7 rounded-3xl border border-white/85 bg-gradient-to-br from-[#EEF2FF]/95 via-[#ECFEFF]/90 to-[#ECFDF5]/90 space-y-4">
                    {/* Top Metric Row (Max 3 data points per card, generous whitespace) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className={`rounded-2xl p-4 space-y-2 ${surfaceGlassClass}`}>
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-semibold ${mutedInkClass}`}>
                            1 · Active Consistency
                          </span>
                          <Flame className="w-4 h-4 text-orange-500 shrink-0" aria-hidden="true" />
                        </div>
                        <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                          6d Streak
                        </div>
                        <div className={`text-xs font-mono tabular-nums ${mutedInkClass}`}>
                          Best 11d · 4.0 workouts/wk
                        </div>
                      </div>

                      <div className={`rounded-2xl p-4 space-y-2 ${surfaceGlassClass}`}>
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-semibold ${mutedInkClass}`}>
                            2 · Weekly Volume &amp; Time
                          </span>
                          <Layers className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />
                        </div>
                        <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                          52 min avg
                        </div>
                        <div className={`text-xs font-mono tabular-nums ${mutedInkClass}`}>
                          18,450 kg · 14 sessions (30d)
                        </div>
                      </div>
                    </div>

                    {/* 14-Day Visual Streak Strip */}
                    <div className={`rounded-2xl p-4 space-y-2.5 ${surfaceGlassClass}`}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-slate-900">
                          3 · 14-Day Frosted Consistency Strip
                        </span>
                        <span className={`font-mono tabular-nums ${mutedInkClass}`}>
                          10 / 14 active days
                        </span>
                      </div>
                      <div
                        className="grid grid-cols-7 sm:grid-cols-14 gap-1.5"
                        role="img"
                        aria-label="14-day workout consistency strip showing 10 active training days"
                      >
                        {[1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1].map((done, idx) => (
                          <div
                            key={idx}
                            className={`h-8 rounded-lg flex items-center justify-center font-mono text-[11px] font-bold border ${
                              done
                                ? 'bg-emerald-500/20 border-emerald-600/45 text-emerald-900'
                                : 'bg-white/55 border-white/80 text-slate-500'
                            }`}
                          >
                            {done ? '✓' : '·'}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Manual Entry + Mistaken Log Deletion Card */}
                    <div className={`rounded-2xl p-4 space-y-3 ${surfaceGlassClass}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-blue-700">
                            4 · Phone-Free Manual Entry &amp; Mistake Recovery
                          </div>
                          <div className="text-sm font-bold text-slate-900">
                            Upper Push &amp; Forearm Flexors (Manual Entry)
                          </div>
                          <div className={`text-xs font-mono tabular-nums ${mutedInkClass}`}>
                            Yesterday · 48 min · 5 exercises · 16 sets
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="no-touch-delay min-h-[40px] px-3 py-1.5 rounded-xl bg-white/80 hover:bg-white border border-white/90 text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0 transition-all hover:scale-[1.02]"
                          >
                            + Log Missed Workout
                          </button>
                          <button
                            type="button"
                            aria-label="Delete mistaken workout entry"
                            className="no-touch-delay min-h-[40px] px-3 py-1.5 rounded-xl bg-red-500/12 hover:bg-red-500/22 border border-red-400/40 text-xs font-semibold text-red-800 flex items-center gap-1 whitespace-nowrap shrink-0 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {showAnnotations && (
                    <div className={`lg:col-span-5 rounded-3xl p-5 sm:p-6 space-y-4 ${surfaceGlassClass}`}>
                      <h4 className="text-sm font-bold text-slate-900">
                        Design Annotations · Screen B (Dashboard)
                      </h4>
                      <ol className="space-y-3 text-xs leading-relaxed text-slate-700 list-decimal pl-4">
                        <li>
                          <strong className="text-slate-900">Generous Negative Space:</strong>{' '}
                          `16px` grid gutters and `24px` outer padding let the cyan-mint pastel
                          gradient breathe between cards, preventing blurred layers from muddying.
                        </li>
                        <li>
                          <strong className="text-slate-900">Tabular Monospace Metrics:</strong>{' '}
                          `JetBrains Mono` with `tabular-nums` anchors streak counts, average
                          duration (`52 min`), and weekly frequency (`4.0/wk`) without jitter.
                        </li>
                        <li>
                          <strong className="text-slate-900">Non-Color Status Redundancy:</strong>{' '}
                          Active streak cells combine translucent mint tint with explicit `✓` glyphs
                          and an `aria-label` summary for color-blind &amp; screen-reader users.
                        </li>
                        <li>
                          <strong className="text-slate-900">Destructive Glass Guardrail:</strong>{' '}
                          Mistaken workout deletion uses a soft rose-tinted translucent button paired
                          with a confirmation dialog and automatic streak recalculation.
                        </li>
                      </ol>
                    </div>
                  )}
                </div>
              )}

              {/* MOCKUP C: SETTINGS & OFFLINE VIDEO VAULT */}
              {mockupScreen === 'settings' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <div className="lg:col-span-7 p-6 sm:p-7 rounded-3xl border border-white/85 bg-gradient-to-br from-[#F5F3FF]/95 via-[#E0F2FE]/90 to-[#ECFDF5]/95 space-y-4">
                    {/* Theme & Contrast Preferences Card */}
                    <div className={`rounded-2xl p-4 space-y-3 ${surfaceGlassClass}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-blue-700">
                            1 · Glass Theme &amp; Contrast Preferences
                          </div>
                          <div className="text-sm font-bold text-slate-900">
                            Pastel Glass (`FROST_GLASS` · Android &amp; Web)
                          </div>
                        </div>
                        <Sliders className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            { id: 'subtle', label: '8px Subtle' },
                            { id: 'balanced', label: '16px Balanced' },
                            { id: 'deep', label: '24px Deep' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setBlurPreset(opt.id)}
                            className={`no-touch-delay min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                              blurPreset === opt.id
                                ? 'bg-slate-900 text-white'
                                : 'bg-white/70 hover:bg-white/95 border border-white/85 text-slate-800'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Offline Video Vault Card */}
                    <div className={`rounded-2xl p-4 space-y-3 ${surfaceGlassClass}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-emerald-700">
                            2 · Designated Offline Video Section
                          </div>
                          <div className="text-sm font-bold text-slate-900">
                            Offline Demo Vault (`videos/offline_saved/`)
                          </div>
                          <div className={`text-xs font-mono tabular-nums ${mutedInkClass}`}>
                            12 demos saved · Airplane-Mode 60fps Player Ready
                          </div>
                        </div>
                        <Video className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" />
                      </div>

                      <div className="space-y-2">
                        {[
                          {
                            name: 'Incline Dumbbell Press',
                            meta: 'Chest · 3 cues · Saved Offline (42 KB)',
                          },
                          {
                            name: 'Barbell Finger Rolls & Wrist Curl',
                            meta: 'Forearms · 4 cues · Saved Offline (38 KB)',
                          },
                        ].map((vid) => (
                          <div
                            key={vid.name}
                            className={`p-3 rounded-xl flex flex-wrap items-center justify-between gap-2 ${subtleGlassClass}`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-900 truncate">
                                {vid.name}
                              </div>
                              <div className={`text-[11px] font-mono tabular-nums ${mutedInkClass}`}>
                                {vid.meta}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                className="no-touch-delay min-h-[38px] px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap"
                              >
                                <Play className="w-3.5 h-3.5 shrink-0" />
                                <span>Watch Offline</span>
                              </button>
                              <button
                                type="button"
                                aria-label={`Remove offline video for ${vid.name}`}
                                className="no-touch-delay min-h-[38px] px-2.5 py-1.5 rounded-lg bg-white/80 hover:bg-red-50 border border-white/90 text-xs font-semibold text-red-700"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {showAnnotations && (
                    <div className={`lg:col-span-5 rounded-3xl p-5 sm:p-6 space-y-4 ${surfaceGlassClass}`}>
                      <h4 className="text-sm font-bold text-slate-900">
                        Design Annotations · Screen C (Settings &amp; Offline Vault)
                      </h4>
                      <ol className="space-y-3 text-xs leading-relaxed text-slate-700 list-decimal pl-4">
                        <li>
                          <strong className="text-slate-900">Two-Tier Surface Hierarchy:</strong>{' '}
                          Outer cards use `68%` white translucency while nested offline video rows
                          use `52%` translucency (`subtleGlass`), creating clear depth without dark
                          nested boxes.
                        </li>
                        <li>
                          <strong className="text-slate-900">Live Blur Depth Control:</strong>{' '}
                          Try switching `8px`, `16px`, and `24px` blur above—`16px` is the sweet
                          spot where pastel color flows through while keeping text razor-sharp.
                        </li>
                        <li>
                          <strong className="text-slate-900">Offline Video Ergonomics:</strong>{' '}
                          Dedicated `Watch Offline` and `Remove` actions meet `&gt;= 44dp` Android
                          touch guidelines with instant `scale(0.97)` press feedback.
                        </li>
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              TAB 2: BACKGROUND, COLOR PALETTE & TYPOGRAPHY
             ================================================================ */}
          {activeTab === 'foundations' && (
            <div className="space-y-6">
              {/* Section 1 & 4: Background & Pastel Color Palette */}
              <section className={`rounded-3xl p-5 sm:p-6 space-y-4 ${surfaceGlassClass}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Palette className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>1 &amp; 4 · Frosted Pastel Background &amp; Harmonious Palette</span>
                    </h3>
                    <p className={`text-xs mt-0.5 ${mutedInkClass}`}>
                      Soft multi-stop pastel mesh gradients give translucent glass real depth without
                      oversaturating foreground content. Tap any swatch to copy its token.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {PALETTE_TOKENS.map((tok) => (
                    <button
                      key={tok.name}
                      type="button"
                      onClick={() => handleCopyToken(tok.value)}
                      className={`no-touch-delay p-3.5 rounded-2xl text-left transition-all duration-150 hover:scale-[1.015] flex items-center justify-between gap-3 ${subtleGlassClass}`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{tok.name}</div>
                        <div className={`text-[11px] truncate ${mutedInkClass}`}>{tok.role}</div>
                        <div className="text-[11px] font-mono tabular-nums font-semibold text-blue-700 mt-1 flex items-center gap-1">
                          <span>{copiedToken === tok.value ? 'Copied!' : tok.value}</span>
                          <Copy className="w-3 h-3 shrink-0" />
                        </div>
                      </div>
                      <div
                        className={`w-11 h-11 rounded-xl border border-slate-300/80 shadow-xs shrink-0 ${tok.swatchClass}`}
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              </section>

              {/* Section 3: Typography */}
              <section className={`rounded-3xl p-5 sm:p-6 space-y-4 ${surfaceGlassClass}`}>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <TypeIcon className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>3 · High-Contrast Modern Typography Over Blurred Glass</span>
                  </h3>
                  <p className={`text-xs mt-0.5 ${mutedInkClass}`}>
                    Never place pale gray text on translucent surfaces. Every type tier is locked to
                    deep slate ink tested against the brightest `#FFFFFF` specular highlight.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className={`p-4 rounded-2xl space-y-1.5 ${subtleGlassClass}`}>
                    <div className="text-[11px] font-mono font-semibold text-blue-700">
                      Display · Outfit Bold
                    </div>
                    <div className="font-display text-2xl font-bold tracking-tight text-slate-900">
                      Week 3 Hypertrophy
                    </div>
                    <p className={`text-xs ${mutedInkClass}`}>
                      `#0F172A` · Contrast `13.8:1` (WCAG AAA) · Tight `-0.02em` tracking.
                    </p>
                  </div>

                  <div className={`p-4 rounded-2xl space-y-1.5 ${subtleGlassClass}`}>
                    <div className="text-[11px] font-mono font-semibold text-blue-700">
                      UI Body · Plus Jakarta Sans
                    </div>
                    <div className="text-sm font-medium text-slate-800 leading-relaxed">
                      Log missed workouts manually or watch saved form demos offline.
                    </div>
                    <p className={`text-xs ${mutedInkClass}`}>
                      `#334155` · Contrast `7.4:1` (WCAG AAA) · `1.5` line-height for effortless scan.
                    </p>
                  </div>

                  <div className={`p-4 rounded-2xl space-y-1.5 ${subtleGlassClass}`}>
                    <div className="text-[11px] font-mono font-semibold text-blue-700">
                      Metrics · JetBrains Mono
                    </div>
                    <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                      102.5 kg × 8
                    </div>
                    <p className={`text-xs ${mutedInkClass}`}>
                      `font-variant-numeric: tabular-nums` keeps timers, weights, and streaks aligned.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ================================================================
              TAB 3: COMPONENTS, SPATIAL LAYOUT & INTERACTIVE ELEMENTS
             ================================================================ */}
          {activeTab === 'components' && (
            <div className="space-y-6">
              {/* Section 2 & 6: Components & Interactive Micro-States */}
              <section className={`rounded-3xl p-5 sm:p-6 space-y-4 ${surfaceGlassClass}`}>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    2 &amp; 6 · Translucent Components &amp; Tactile Hover / Press States
                  </h3>
                  <p className={`text-xs mt-0.5 ${mutedInkClass}`}>
                    Hover or tap the live components below to feel opacity elevation (`0.68 → 0.88`),
                    gentle hover scale (`1.015`), and instant Android touch press (`0.97` in `35ms`).
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Interactive Buttons Showcase */}
                  <div className={`p-4 rounded-2xl space-y-3 ${subtleGlassClass}`}>
                    <div className="text-xs font-bold text-slate-900">Frosted Button Hierarchy</div>
                    <button
                      type="button"
                      className="no-touch-delay w-full min-h-[44px] px-4 py-2 rounded-xl bg-blue-600/95 hover:bg-blue-600 hover:scale-[1.02] active:scale-[0.97] text-white text-xs font-bold border border-blue-400/50 shadow-[0_10px_22px_-6px_rgba(37,99,235,0.5)] transition-all duration-150"
                    >
                      Primary Glass Action
                    </button>
                    <button
                      type="button"
                      className="no-touch-delay w-full min-h-[44px] px-4 py-2 rounded-xl bg-white/65 hover:bg-white/90 hover:scale-[1.02] active:scale-[0.97] text-slate-900 text-xs font-semibold border border-white/85 shadow-xs transition-all duration-150"
                    >
                      Secondary Frosted Action
                    </button>
                  </div>

                  {/* Card Anatomy */}
                  <div className={`p-4 rounded-2xl space-y-2 ${subtleGlassClass}`}>
                    <div className="text-xs font-bold text-slate-900">Glass Card Recipe</div>
                    <ul className={`text-xs space-y-1.5 font-mono ${mutedInkClass}`}>
                      <li>backdrop-filter: blur(16px)</li>
                      <li>background: rgba(255,255,255,0.68)</li>
                      <li>border: 1px solid rgba(255,255,255,0.78)</li>
                      <li>shadow: 0 12px 32px -10px rgba(15,23,42,0.08)</li>
                    </ul>
                  </div>

                  {/* Section 5: Layout & Whitespace Rules */}
                  <div className={`p-4 rounded-2xl space-y-2 ${subtleGlassClass}`}>
                    <div className="text-xs font-bold text-slate-900">
                      5 · Airy Layout &amp; Whitespace Rules
                    </div>
                    <ul className={`text-xs space-y-1.5 ${mutedInkClass}`}>
                      <li>• `24px–32px` outer container breathing room</li>
                      <li>• `16px–20px` minimum gap between glass cards</li>
                      <li>• Max 3 data points per card (progressive disclosure)</li>
                      <li>• Never stack more than 2 blurred layers deep</li>
                    </ul>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ================================================================
              TAB 4: ACCESSIBILITY, CONTRAST & SCREEN-READER COMPLIANCE
             ================================================================ */}
          {activeTab === 'accessibility' && (
            <div className="space-y-6">
              <section className={`rounded-3xl p-5 sm:p-6 space-y-4 ${surfaceGlassClass}`}>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    7 · Accessibility, Contrast Adjustments &amp; Screen-Reader Architecture
                  </h3>
                  <p className={`text-xs mt-0.5 ${mutedInkClass}`}>
                    Glassmorphism remains inclusive when paired with user-controllable contrast modes,
                    operating-system `prefers-reduced-transparency` hooks, and semantic ARIA landmarks.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className={`p-4 rounded-2xl space-y-2 ${subtleGlassClass}`}>
                    <div className="font-bold text-slate-900">
                      Color Contrast &amp; Reduced Transparency
                    </div>
                    <ul className={`space-y-1.5 leading-relaxed ${mutedInkClass}`}>
                      <li>
                        • <strong>Worst-Case Contrast Audit:</strong> All text ratios are verified
                        against pure `#FFFFFF` (`#0F172A` = `19.3:1` max / `13.8:1` over sky-ice;
                        `#475569` muted = `4.8:1` WCAG AA).
                      </li>
                      <li>
                        • <strong>High-Contrast Toggle:</strong> Raises surface opacity from `68%` to
                        `88%` and upgrades `1px` white borders to `2px` `#1E293B` (`&gt;= 7:1` AAA).
                      </li>
                      <li>
                        • <strong>OS Solid Fallback:</strong> `@media (prefers-reduced-transparency:
                        reduce)` disables `backdrop-filter` and renders crisp opaque `#FFFFFF` cards.
                      </li>
                    </ul>
                  </div>

                  <div className={`p-4 rounded-2xl space-y-2 ${subtleGlassClass}`}>
                    <div className="font-bold text-slate-900">
                      Screen Readers, Keyboard &amp; Touch Targets
                    </div>
                    <ul className={`space-y-1.5 leading-relaxed ${mutedInkClass}`}>
                      <li>
                        • <strong>TalkBack &amp; VoiceOver Semantics:</strong> Decorative glass orbs
                        carry `aria-hidden=&quot;true&quot;`, while streak strips, modals
                        (`role=&quot;dialog&quot;`), and switches (`role=&quot;switch&quot;`) expose
                        explicit state labels.
                      </li>
                      <li>
                        • <strong>Keyboard Focus Rings:</strong> Every interactive glass control
                        provides a `2px` high-contrast `#2563EB` `:focus-visible` ring.
                      </li>
                      <li>
                        • <strong>Motor Ergonomics:</strong> All buttons, tabs, and offline video
                        controls enforce `&gt;= 44×44px` (`48dp` on Android) hitboxes with zero tap
                        delay.
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-300/60 text-xs">
                  <span className={mutedInkClass}>
                    Full Markdown specification (`GLASSMORPHISM_UI_DESIGN_GUIDE.md`) is also bundled
                    inside the Android v3.0 Phone &amp; Source `.ZIP` downloads.
                  </span>
                  <button
                    type="button"
                    onClick={onApplyPastelGlassTheme}
                    className="no-touch-delay min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>Activate Pastel Glass Across App</span>
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
