/**
 * Daily workout session manager
 * Groups all exercises by day into one session
 */

const fs = require('fs');
const path = require('path');
const { parseWorkout } = require('./parser');

const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { workouts: [], meals: [], bodyweights: [], recovery: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getTodayKey() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function getTodayWorkout(data) {
  const todayKey = getTodayKey();
  return data.workouts.find(w => {
    // Handle both new format (date string) and legacy format (ISO timestamp)
    const workoutDate = w.date.includes('T') ? w.date.split('T')[0] : w.date;
    return workoutDate === todayKey && w.exercises;
  });
}

function addExerciseToToday(text) {
  const parsed = parseWorkout(text);
  if (!parsed) {
    return { success: false, error: 'Could not parse workout' };
  }

  const data = loadData();
  const todayKey = getTodayKey();

  // Check for PR before adding - handle both new and legacy formats
  const allSetsForExercise = data.workouts.flatMap(w => {
    // New format: w.exercises array
    if (w.exercises) {
      return w.exercises
        .filter(e => e.name.toLowerCase() === parsed.exercise.toLowerCase())
        .flatMap(e => e.sets);
    }
    // Legacy format: single exercise per workout
    if (w.exercise && w.exercise.toLowerCase() === parsed.exercise.toLowerCase()) {
      return w.sets || [];
    }
    return [];
  });

  const previousMax = allSetsForExercise.length > 0
    ? Math.max(...allSetsForExercise.map(s => s.weight))
    : 0;

  const thisMax = Math.max(...parsed.sets.map(s => s.weight));
  const isPR = thisMax > previousMax && allSetsForExercise.length > 0;

  // Find or create today's workout
  let todayWorkout = getTodayWorkout(data);

  if (!todayWorkout) {
    todayWorkout = {
      id: Date.now(),
      date: todayKey,
      exercises: []
    };
    data.workouts.unshift(todayWorkout);
  }

  // Ensure exercises array exists (for legacy data)
  if (!todayWorkout.exercises) {
    todayWorkout.exercises = [];
  }

  // Check if exercise already exists today, if so append sets
  const existingExercise = todayWorkout.exercises.find(
    e => e.name.toLowerCase() === parsed.exercise.toLowerCase()
  );

  if (existingExercise) {
    existingExercise.sets.push(...parsed.sets);
  } else {
    todayWorkout.exercises.push({
      name: parsed.exercise,
      sets: parsed.sets
    });
  }

  saveData(data);

  return {
    success: true,
    exercise: parsed.exercise,
    isPR,
    thisMax,
    previousMax,
    workout: todayWorkout
  };
}

function getExerciseMax(exerciseName) {
  const data = loadData();
  const allSets = data.workouts.flatMap(w =>
    w.exercises
      .filter(e => e.name.toLowerCase() === exerciseName.toLowerCase())
      .flatMap(e => e.sets)
  );

  if (allSets.length === 0) return 0;
  return Math.max(...allSets.map(s => s.weight));
}

module.exports = {
  addExerciseToToday,
  getTodayWorkout,
  getExerciseMax,
  loadData,
  saveData
};

// CLI usage
if (require.main === module) {
  const input = process.argv.slice(2).join(' ');
  if (!input) {
    console.log('Usage: node session.js "bp 185x5, 185x5"');
    process.exit(1);
  }

  const result = addExerciseToToday(input);
  if (result.success) {
    console.log(`✅ Added ${result.exercise} to today's workout`);
    console.log(result.workout.exercises.map(e =>
      `  ${e.name}: ${e.sets.map(s => `${s.weight}x${s.reps}`).join(', ')}`
    ).join('\n'));

    if (result.isPR) {
      console.log(`\n🏆 PR! New max for ${result.exercise}: ${result.thisMax} lbs`);
    }
  } else {
    console.error('❌', result.error);
    process.exit(1);
  }
}
