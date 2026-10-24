import React, { useMemo, useState } from 'react';
import {
  EquipmentType,
  LibraryExercise,
  MajorMuscleGroup,
  MuscleId,
  MuscleLandmark,
  WorkoutTemplate,
} from '../types/workout';
import {
  getMuscleMajorGroup,
  MAJOR_MUSCLE_GROUP_ORDER,
} from '../data/exerciseCatalog';
import {
  Check,
  ExternalLink,
  Plus,
  Search,
  X,
} from 'lucide-react';

interface PageLibraryProps {
  exercises: LibraryExercise[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  templates: WorkoutTemplate[];
  onCreateExercise: (exercise: LibraryExercise) => Promise<void>;
  onAddExerciseToTemplate: (templateId: string, exercise: LibraryExercise) => Promise<void>;
}

export const PageLibrary: React.FC<PageLibraryProps> = ({
  exercises,
  landmarks,
  templates,
  onCreateExercise,
  onAddExerciseToTemplate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<MajorMuscleGroup>(MajorMuscleGroup.All);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentType>(EquipmentType.All);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>(
    exercises[0]?.id ?? 'lib_bb_bench_press'
  );

  const [targetTemplateId, setTargetTemplateId] = useState<string>(templates[0]?.id ?? '');
  const [addedBanner, setAddedBanner] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEquipment, setNewEquipment] =
    useState<Exclude<EquipmentType, EquipmentType.All>>(EquipmentType.Dumbbell);
  const [newPrimaryMuscle, setNewPrimaryMuscle] = useState<MuscleId>(MuscleId.Chest);
  const [newSecondaryMuscles, setNewSecondaryMuscles] = useState<MuscleId[]>([]);
  const [newDescription, setNewDescription] = useState('');
  const [newInstructionsText, setNewInstructionsText] = useState('');
  const [newRepRange, setNewRepRange] = useState('8–12');
  const [newRestSeconds, setNewRestSeconds] = useState(90);
  const [newVideoUrl, setNewVideoUrl] = useState('');

  const filteredExercises = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return exercises.filter((ex) => {
      if (selectedGroup !== MajorMuscleGroup.All && ex.majorGroup !== selectedGroup) {
        return false;
      }
      if (selectedEquipment !== EquipmentType.All && ex.equipment !== equipmentEquipmentMap(selectedEquipment)) {
        return false;
      }
      if (!q) return true;
      const primName = landmarks[ex.primaryMuscle]?.name.toLowerCase() ?? '';
      const secNames = ex.secondaryMuscles
        .map((m) => landmarks[m]?.name.toLowerCase() ?? '')
        .join(' ');
      return (
        ex.name.toLowerCase().includes(q) ||
        ex.description.toLowerCase().includes(q) ||
        ex.equipment.toLowerCase().includes(q) ||
        primName.includes(q) ||
        secNames.includes(q)
      );
    });
  }, [exercises, searchQuery, selectedGroup, selectedEquipment, landmarks]);

  function equipmentEquipmentMap(eq: EquipmentType): EquipmentType {
    return eq;
  }

  const activeExercise = useMemo(() => {
    return (
      filteredExercises.find((e) => e.id === selectedExerciseId) ??
      exercises.find((e) => e.id === selectedExerciseId) ??
      filteredExercises[0] ??
      exercises[0]
    );
  }, [filteredExercises, exercises, selectedExerciseId]);

  const handleToggleSecondaryMuscle = (mId: MuscleId) => {
    if (mId === newPrimaryMuscle) return;
    setNewSecondaryMuscles((prev) =>
      prev.includes(mId) ? prev.filter((x) => x !== mId) : [...prev, mId]
    );
  };

  const handleSubmitNewExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newDescription.trim()) return;

    const steps = newInstructionsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const created: LibraryExercise = {
      id: `lib_custom_${Date.now()}`,
      name: newName.trim(),
      majorGroup: getMuscleMajorGroup(newPrimaryMuscle),
      primaryMuscle: newPrimaryMuscle,
      secondaryMuscles: newSecondaryMuscles.filter((m) => m !== newPrimaryMuscle),
      equipment: newEquipment,
      description: newDescription.trim(),
      instructions:
        steps.length > 0
          ? steps
          : [
              'Establish a stable base of support and brace your core before initiating the movement.',
              'Control a 2–3 second eccentric into a full loaded stretch, then drive smoothly to peak contraction.',
            ],
      defaultRepRange: newRepRange.trim() || '8–12',
      defaultRestSeconds: Math.max(30, Math.min(300, Number(newRestSeconds) || 90)),
      defaultWeightKg: 20,
      videoUrl: newVideoUrl.trim() || undefined,
      videoSourceLabel: newVideoUrl.trim() ? 'External Demonstration Video' : undefined,
      isCustom: true,
    };

    await onCreateExercise(created);
    setSelectedExerciseId(created.id);
    setIsCreateOpen(false);
    setNewName('');
    setNewDescription('');
    setNewInstructionsText('');
    setNewSecondaryMuscles([]);
    setNewVideoUrl('');
  };

  const handleQuickAddToTemplate = async () => {
    const chosenId = targetTemplateId || templates[0]?.id;
    if (!chosenId || !activeExercise) return;
    await onAddExerciseToTemplate(chosenId, activeExercise);
    const tplName = templates.find((t) => t.id === chosenId)?.name ?? 'Template';
    setAddedBanner(`Added "${activeExercise.name}" to ${tplName}`);
    window.setTimeout(() => setAddedBanner(null), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Exercise Library
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Execution cues, primary &amp; synergist muscle mapping, and video demonstrations
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="min-h-[42px] px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          New Custom Exercise
        </button>
      </div>

      {/* Search & Multi-Axis Filters */}
      <div className="hl-card rounded-2xl p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by exercise name, muscle group, or movement pattern..."
              className="w-full min-h-[44px] pl-10 pr-4 py-2 text-sm hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 overflow-x-auto no-scrollbar">
            {Object.values(EquipmentType).map((eq) => (
              <button
                key={eq}
                type="button"
                onClick={() => setSelectedEquipment(eq)}
                className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  selectedEquipment === eq
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {eq === EquipmentType.All ? 'All Gear' : eq}
              </button>
            ))}
          </div>
        </div>

        <div
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
          role="tablist"
          aria-label="Filter library by major muscle group"
        >
          {MAJOR_MUSCLE_GROUP_ORDER.map((group) => {
            const active = selectedGroup === group.id;
            return (
              <button
                key={group.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedGroup(group.id)}
                className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-slate-900 dark:bg-blue-600 text-white'
                    : 'hl-subtle border text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {group.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Master-Detail Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 hl-card rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200">Catalog Directory</span>
            <span className="font-mono tabular-nums">
              {filteredExercises.length} of {exercises.length} movements
            </span>
          </div>

          {filteredExercises.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                No matching exercises found
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Reset your filters or add a custom movement to your local catalog.
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedGroup(MajorMuscleGroup.All);
                    setSelectedEquipment(EquipmentType.All);
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold hl-subtle border text-slate-800 dark:text-slate-200 rounded-lg"
                >
                  Reset Filters
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(true)}
                  className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg"
                >
                  Create Exercise
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-200/70 dark:divide-slate-800 max-h-[380px] lg:max-h-[620px] overflow-y-auto">
              {filteredExercises.map((ex) => {
                const isSelected = activeExercise?.id === ex.id;
                const primLm = landmarks[ex.primaryMuscle];
                const secLabels = ex.secondaryMuscles
                  .map((m) => landmarks[m]?.shortName)
                  .filter(Boolean)
                  .join(', ');

                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => setSelectedExerciseId(ex.id)}
                    className={`w-full text-left px-4 py-3.5 transition-colors ${
                      isSelected
                        ? 'bg-blue-50/75 dark:bg-blue-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {ex.name}
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                        {ex.defaultRepRange} reps
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                      <span>{ex.equipment}</span>
                      <span aria-hidden="true"> · </span>
                      <span className="text-slate-700 dark:text-slate-300 font-medium">
                        {primLm?.shortName}
                      </span>
                      {secLabels && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span>+{secLabels}</span>
                        </>
                      )}
                      {ex.isCustom && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span className="text-blue-600 dark:text-blue-400 font-semibold">Custom</span>
                        </>
                      )}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Detailed Exercise Execution & Muscle Inspector */}
        {activeExercise && (
          <div className="lg:col-span-7 hl-card rounded-2xl p-4 sm:p-6 space-y-6">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {activeExercise.equipment}
                </span>
                <span aria-hidden="true">·</span>
                <span className="capitalize">{activeExercise.majorGroup}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {activeExercise.defaultRepRange} reps · {activeExercise.defaultRestSeconds}s rest
                </span>
              </div>

              <div className="flex flex-wrap items-start justify-between gap-4">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {activeExercise.name}
                </h2>

                {activeExercise.videoUrl && (
                  <a
                    href={activeExercise.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    {activeExercise.videoSourceLabel ?? 'Watch Video Demo'}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
                {activeExercise.description}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl hl-subtle border space-y-1.5">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Primary Target Muscle
                </p>
                <p className="text-base font-bold text-slate-900 dark:text-white">
                  {landmarks[activeExercise.primaryMuscle]?.name}
                </p>
                <p className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                  MAV {landmarks[activeExercise.primaryMuscle]?.mavMin}–
                  {landmarks[activeExercise.primaryMuscle]?.mavMax} sets/wk · MRV{' '}
                  {landmarks[activeExercise.primaryMuscle]?.mrv}
                </p>
              </div>

              <div className="p-4 rounded-xl hl-subtle border space-y-1.5">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Secondary Synergist Muscles
                </p>
                {activeExercise.secondaryMuscles.length === 0 ? (
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Strict single-joint isolation (minimal synergist load)
                  </p>
                ) : (
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {activeExercise.secondaryMuscles
                      .map((m) => landmarks[m]?.name)
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Receives fractional indirect stimulus during compound execution
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                How to Perform (Step-by-Step Execution)
              </h3>
              <ol className="space-y-2.5">
                {activeExercise.instructions.map((step, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
                  >
                    <span className="font-mono tabular-nums text-xs font-bold text-slate-900 dark:text-white hl-subtle border rounded-md w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {templates.length > 0 && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                  Append Exercise Directly to a Workout Template
                </span>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <select
                    value={targetTemplateId || templates[0]?.id}
                    onChange={(e) => setTargetTemplateId(e.target.value)}
                    aria-label="Target workout template"
                    className="flex-1 min-h-[42px] px-3 py-2 text-xs font-medium hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name} ({tpl.exercises.length} exercises)
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleQuickAddToTemplate}
                    className="min-h-[42px] px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add to Template
                  </button>
                </div>

                {addedBanner && (
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 pt-1">
                    <Check className="w-3.5 h-3.5" />
                    {addedBanner}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Custom Exercise Modal */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-exercise-title"
        >
          <form
            onSubmit={handleSubmitNewExercise}
            className="hl-card w-full max-w-xl max-h-[90vh] rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-xl"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 id="new-exercise-title" className="text-base font-bold text-slate-900 dark:text-white">
                Add Custom Exercise to Library
              </h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white"
                aria-label="Close custom exercise dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Exercise Name *
                  </span>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Pendulum Squat"
                    className="mt-1 w-full min-h-[40px] px-3 py-1.5 text-sm hl-input rounded-xl"
                  />
                </label>

                <label className="block">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Equipment
                  </span>
                  <select
                    value={newEquipment}
                    onChange={(e) =>
                      setNewEquipment(
                        e.target.value as Exclude<EquipmentType, EquipmentType.All>
                      )
                    }
                    className="mt-1 w-full min-h-[40px] px-3 py-1.5 text-sm hl-input rounded-xl"
                  >
                    <option value={EquipmentType.Barbell}>Barbell</option>
                    <option value={EquipmentType.Dumbbell}>Dumbbell</option>
                    <option value={EquipmentType.Cable}>Cable</option>
                    <option value={EquipmentType.Machine}>Machine</option>
                    <option value={EquipmentType.Bodyweight}>Bodyweight</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Primary Muscle
                  </span>
                  <select
                    value={newPrimaryMuscle}
                    onChange={(e) => setNewPrimaryMuscle(e.target.value as MuscleId)}
                    className="mt-1 w-full min-h-[40px] px-2.5 py-1.5 text-xs hl-input rounded-xl"
                  >
                    {Object.values(MuscleId).map((m) => (
                      <option key={m} value={m}>
                        {landmarks[m]?.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Default Reps
                  </span>
                  <input
                    type="text"
                    value={newRepRange}
                    onChange={(e) => setNewRepRange(e.target.value)}
                    placeholder="8–12"
                    className="mt-1 w-full min-h-[40px] px-3 py-1.5 text-xs font-mono hl-input rounded-xl"
                  />
                </label>

                <label className="block">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Default Rest (sec)
                  </span>
                  <input
                    type="number"
                    min={15}
                    max={300}
                    step={15}
                    value={newRestSeconds}
                    onChange={(e) => setNewRestSeconds(Number(e.target.value))}
                    className="mt-1 w-full min-h-[40px] px-3 py-1.5 text-xs font-mono tabular-nums hl-input rounded-xl"
                  />
                </label>
              </div>

              <div>
                <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Secondary Muscles Targeted
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {Object.values(MuscleId)
                    .filter((m) => m !== newPrimaryMuscle)
                    .map((m) => {
                      const checked = newSecondaryMuscles.includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => handleToggleSecondaryMuscle(m)}
                          className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                            checked
                              ? 'bg-blue-600 text-white border-blue-500'
                              : 'hl-subtle text-slate-600 dark:text-slate-300 hover:border-slate-400'
                          }`}
                        >
                          {landmarks[m]?.shortName}
                        </button>
                      );
                    })}
                </div>
              </div>

              <label className="block">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Short Description *
                </span>
                <textarea
                  required
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe biomechanical focus and stretch/contraction profile..."
                  className="mt-1 w-full px-3 py-2 text-sm hl-input rounded-xl"
                />
              </label>

              <label className="block">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Step-by-Step Instructions (one step per line)
                </span>
                <textarea
                  rows={3}
                  value={newInstructionsText}
                  onChange={(e) => setNewInstructionsText(e.target.value)}
                  placeholder={
                    'Set foot stance hip-width apart.\nControl 3-second descent into deep knee flexion.\nDrive smoothly out of the bottom.'
                  }
                  className="mt-1 w-full px-3 py-2 text-xs hl-input rounded-xl"
                />
              </label>

              <label className="block">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Optional Video Demonstration URL
                </span>
                <input
                  type="url"
                  value={newVideoUrl}
                  onChange={(e) => setNewVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="mt-1 w-full min-h-[40px] px-3 py-1.5 text-xs hl-input rounded-xl"
                />
              </label>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 hl-subtle flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="min-h-[40px] px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hl-card rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[40px] px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl"
              >
                Save to Library
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
