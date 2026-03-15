/**
 * Workout parser for Telegram messages
 * Usage: node telegram-handler.js "Bench press 185x5, 185x5, 185x5"
 */

const { addExerciseToToday } = require('./session');

/**
 * Log a workout from Telegram message
 * Returns: { success, exercise, isPR, message }
 */
function logWorkoutFromTelegram(text) {
  const result = addExerciseToToday(text);

  if (!result.success) {
    return { success: false, message: 'Failed to parse workout. Try formats like: "bp 185x5, 185x5" or "squat 225x8 for 3 sets"' };
  }

  const { exercise, isPR, thisMax, workout } = result;

  // Build response message
  let message = `✅ Added ${exercise} to today's workout`;
  message += '\n\n📋 Today\'s session:';
  message += workout.exercises.map(e => {
    return `\n• ${e.name}: ${e.sets.map(s => `${s.weight}x${s.reps}`).join(', ')}`;
  }).join('');

  if (isPR) {
    message += `\n\n🏆 PR! New max for ${exercise}: ${thisMax} lbs`;
  }

  return {
    success: true,
    exercise,
    isPR,
    message
  };
}

/**
 * Get last workout date for streak checking
 */
function getLastWorkoutDate() {
  try {
    const { loadData } = require('./session');
    const data = loadData();
    if (data.workouts.length === 0) return null;
    return new Date(data.workouts[0].date);
  } catch {
    return null;
  }
}

/**
 * Check if workout logged today
 */
function hasWorkoutToday() {
  const { loadData } = require('./session');
  const data = loadData();
  if (data.workouts.length === 0) return false;

  const today = new Date().toISOString().split('T')[0];
  return data.workouts[0].date === today;
}

module.exports = { logWorkoutFromTelegram, getLastWorkoutDate, hasWorkoutToday };

// If run directly with text argument
if (require.main === module) {
  const text = process.argv.slice(2).join(' ');
  if (!text) {
    console.log('Usage: node telegram-handler.js "Bench press 185x5, 185x5, 185x5"');
    process.exit(1);
  }
  const result = logWorkoutFromTelegram(text);
  console.log(result.message);
}
