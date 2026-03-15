/**
 * Workout parser for Telegram messages
 * Usage: node log-workout.js "Bench press 185x5, 185x5, 185x5"
 */

const fs = require('fs');
const path = require('path');
const { parseWorkout } = require('./parser');

const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { workouts: [], meals: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function addWorkout(text) {
  const parsed = parseWorkout(text);
  if (!parsed) {
    console.error('Could not parse workout. Try formats like: "bp 185x5, 185x5" or "squat 225x8 for 3 sets"');
    process.exit(1);
  }

  const data = loadData();

  // Check for PR BEFORE saving
  const previousWorkouts = data.workouts
    .filter(w => w.exercise.toLowerCase() === parsed.exercise.toLowerCase());

  const previousMax = previousWorkouts.length > 0
    ? Math.max(...previousWorkouts.map(w => Math.max(...w.sets.map(s => s.weight))))
    : 0;

  const workout = {
    id: Date.now(),
    date: new Date().toISOString(),
    exercise: parsed.exercise,
    sets: parsed.sets
  };

  data.workouts.unshift(workout);
  saveData(data);

  console.log(`✅ Logged: ${parsed.exercise}`);
  console.log(parsed.sets.map(s => `   ${s.weight} lbs × ${s.reps} reps`).join('\n'));

  // Check for PR
  const thisMax = Math.max(...parsed.sets.map(s => s.weight));
  const isPR = thisMax > previousMax && previousWorkouts.length > 0;

  if (isPR) {
    console.log(`🏆 PR_DETECTED:${parsed.exercise}:${thisMax}`);
  }

  return { workout, isPR, thisMax, previousMax };
}

// If run from command line
if (require.main === module) {
  const input = process.argv.slice(2).join(' ');
  if (!input) {
    console.log('Usage: node log-workout.js "Bench press 185x5, 185x5, 185x5"');
    console.log('Shorthand: bp, bench, squat, sq, dl, deadlift, ohp, press, etc.');
    process.exit(1);
  }
  addWorkout(input);
}

module.exports = { parseWorkout, addWorkout };
