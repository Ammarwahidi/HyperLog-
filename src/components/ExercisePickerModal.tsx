import React, { useMemo, useState } from 'react';
import {
  EquipmentType,
  LibraryExercise,
  MajorMuscleGroup,
  MuscleId,
  MuscleLandmark,
} from '../types/workout';
import { MAJOR_MUSCLE_GROUP_ORDER } from '../data/exerciseCatalog';
import { Check, Plus, Search, X } from 'lucide-react';

interface ExercisePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  exercises: LibraryExercise[];
  landmarks: Record<MuscleId, MuscleLandmark>;
  onSelectExercise: (exercise: LibraryExercise) => void;
  alreadySelectedIds?: string[];
  title?: string;
}

export const ExercisePickerModal: React.FC<ExercisePickerModalProps> = ({
  isOpen,
  onClose,
  exercises,
  landmarks,
  onSelectExercise,
  alreadySelectedIds = [],
  title = 'Select Exercise from Library',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<MajorMuscleGroup>(MajorMuscleGroup.All);
  const [equipmentFilter, setEquipmentFilter] = useState<EquipmentType>(EquipmentType.All);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return exercises.filter((ex) => {
      if (groupFilter !== MajorMuscleGroup.All && ex.majorGroup !== groupFilter) {
        return false;
      }
      if (equipmentFilter !== EquipmentType.All && ex.equipment !== equipmentFilter) {
        return false;
      }
      if (!q) return true;
      const primaryName = landmarks[ex.primaryMuscle]?.name.toLowerCase() ?? '';
      return (
        ex.name.toLowerCase().includes(q) ||
        ex.description.toLowerCase().includes(q) ||
        ex.equipment.toLowerCase().includes(q) ||
        primaryName.includes(q)
      );
    });
  }, [exercises, groupFilter, equipmentFilter, searchQuery, landmarks]);

  if (!isOpen) return null;

  const selectedSet = new Set(alreadySelectedIds);

  const handlePick = (ex: LibraryExercise) => {
    onSelectExercise(ex);
    setJustAddedId(ex.id);
    window.setTimeout(() => setJustAddedId(null), 1200);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exercise-picker-title"
    >
      <div className="hl-card w-full max-w-3xl max-h-[88vh] rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-xl">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2 id="exercise-picker-title" className="text-base font-bold text-slate-900 dark:text-white">
              {title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Search by movement, muscle group, or equipment
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close exercise picker"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 hl-subtle border-b space-y-3 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search exercises (e.g. Bench Press, Rear Delt, Squat)..."
              className="w-full min-h-[42px] pl-9 pr-4 py-2 text-sm hl-input rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
            {MAJOR_MUSCLE_GROUP_ORDER.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGroupFilter(g.id)}
                className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  groupFilter === g.id
                    ? 'bg-slate-900 dark:bg-blue-600 text-white'
                    : 'hl-card text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
            {Object.values(EquipmentType).map((eq) => (
              <button
                key={eq}
                type="button"
                onClick={() => setEquipmentFilter(eq)}
                className={`min-h-[32px] px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  equipmentFilter === eq
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'hl-card text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {eq === EquipmentType.All ? 'All Equipment' : eq}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-200/70 dark:divide-slate-800 px-5 py-2">
          {filtered.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No exercises match your current search and filters.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setGroupFilter(MajorMuscleGroup.All);
                  setEquipmentFilter(EquipmentType.All);
                }}
                className="min-h-[38px] px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg"
              >
                Clear All Filters
              </button>
            </div>
          ) : (
            filtered.map((ex) => {
              const primaryLm = landmarks[ex.primaryMuscle];
              const secondaryNames = ex.secondaryMuscles
                .map((m) => landmarks[m]?.shortName)
                .filter(Boolean)
                .join(', ');
              const isAdded = justAddedId === ex.id || selectedSet.has(ex.id);

              return (
                <div
                  key={ex.id}
                  className="py-3.5 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {ex.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      <span>{ex.equipment}</span>
                      <span aria-hidden="true"> · </span>
                      <span>Primary: {primaryLm?.shortName}</span>
                      {secondaryNames && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span>Secondary: {secondaryNames}</span>
                        </>
                      )}
                      <span aria-hidden="true"> · </span>
                      <span className="font-mono tabular-nums">{ex.defaultRestSeconds}s rest</span>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePick(ex)}
                    className={`min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      justAddedId === ex.id
                        ? 'bg-emerald-600 text-white'
                        : isAdded
                        ? 'hl-subtle border text-slate-800 dark:text-slate-200'
                        : 'bg-blue-600 text-white hover:bg-blue-500'
                    }`}
                  >
                    {justAddedId === ex.id ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Added
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        {isAdded ? 'Add Again' : 'Add'}
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 hl-subtle flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Showing {filtered.length} of {exercises.length} exercises
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
