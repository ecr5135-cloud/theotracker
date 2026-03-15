/**
 * Flexible workout parser
 * Handles shorthand, natural language, various formats
 */

const EXERCISE_ALIASES = {
  // Bench
  'bp': 'Bench Press',
  'bench': 'Bench Press',
  'benchpress': 'Bench Press',
  'cgbp': 'Close Grip Bench Press',
  
  // Squat
  'sq': 'Squat',
  'squat': 'Squat',
  'backsquat': 'Back Squat',
  'fs': 'Front Squat',
  'frontsquat': 'Front Squat',
  'gobletsquat': 'Goblet Squat',
  
  // Deadlift
  'dl': 'Deadlift',
  'deadlift': 'Deadlift',
  'sumo': 'Sumo Deadlift',
  'sumodl': 'Sumo Deadlift',
  'rdl': 'Romanian Deadlift',
  'sldl': 'Stiff Leg Deadlift',
  
  // Press
  'ohp': 'Overhead Press',
  'press': 'Overhead Press',
  'militarypress': 'Overhead Press',
  'shoulderpress': 'Overhead Press',
  'incline': 'Incline Press',
  'inclinebench': 'Incline Bench Press',
  'decline': 'Decline Press',
  
  // Row
  'row': 'Barbell Row',
  'barbellrow': 'Barbell Row',
  'pendlay': 'Pendlay Row',
  'cable': 'Cable Row',
  'tbar': 'T-Bar Row',
  
  // Pull
  'pullup': 'Pull-up',
  'pullups': 'Pull-up',
  'chinup': 'Chin-up',
  'chinups': 'Chin-up',
  'latpulldown': 'Lat Pulldown',
  'pulldown': 'Lat Pulldown',
  
  // Arms
  'curl': 'Bicep Curl',
  'barbellcurl': 'Barbell Curl',
  'dbcurl': 'Dumbbell Curl',
  'tricep': 'Tricep Extension',
  'skullcrusher': 'Skull Crusher',
  'dips': 'Dips',
  'dip': 'Dips',
  
  // Legs
  'legpress': 'Leg Press',
  'legcurl': 'Leg Curl',
  'legextension': 'Leg Extension',
  'calf': 'Calf Raise',
  'calves': 'Calf Raise',
  'lunges': 'Lunges',
  'lunge': 'Lunges',
  'bulgarian': 'Bulgarian Split Squat',
  'hipthrust': 'Hip Thrust',
  
  // Core
  'plank': 'Plank',
  'crunch': 'Crunch',
  'legraises': 'Leg Raises',
  
  // Machines
  'chestfly': 'Chest Fly',
  'pecdeck': 'Pec Deck',
  'cables': 'Cable Crossover'
};

function normalizeExercise(name) {
  const key = name.toLowerCase().replace(/[^a-z]/g, '');
  return EXERCISE_ALIASES[key] || name;
}

function parseWorkout(text) {
  text = text.toLowerCase().trim();

  // Handle "X sets of Y@Z on EXERCISE" pattern
  const setsOnMatch = text.match(/^(\d+)\s*(?:sets?|s)\s*(?:of\s*)?(\d+(?:\.5)?)\s*[@x×]\s*(\d+)\s+on\s+(.+)$/);
  if (setsOnMatch) {
    const setCount = parseInt(setsOnMatch[1]);
    const weight = parseFloat(setsOnMatch[2]);
    const reps = parseInt(setsOnMatch[3]);
    const exercise = normalizeExercise(setsOnMatch[4].trim());
    const sets = [];
    for (let i = 0; i < setCount; i++) {
      sets.push({ weight, reps });
    }
    return { exercise, sets };
  }

  // Remove common filler words
  text = text.replace(/\b(hit|got|about|around|roughly|like)\b/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();

  // Try to find exercise name
  let exercise = null;
  let remaining = text;

  // Check for exact alias matches first
  for (const [alias, fullName] of Object.entries(EXERCISE_ALIASES)) {
    const regex = new RegExp('^' + alias + '\\b', 'i');
    if (regex.test(text)) {
      exercise = fullName;
      remaining = text.replace(regex, '').trim();
      break;
    }
  }

  // If no alias match, extract everything before first number
  if (!exercise) {
    const match = text.match(/^(.+?)\s*(\d|@|with|for)/);
    if (match) {
      exercise = normalizeExercise(match[1].trim());
      remaining = text.substring(match[0].lastIndexOf(match[1]) + match[1].length).trim();
    }
  }

  if (!exercise) return null;

  const sets = [];

  // Pattern: "3 sets of 185x5" or "3s of 185x8"
  const setsOfPattern = remaining.match(/(\d+)\s*(?:sets?|s)\s*(?:of\s*)?(\d+(?:\.5)?)\s*[@x×]\s*(\d+)/);
  if (setsOfPattern) {
    const setCount = parseInt(setsOfPattern[1]);
    const weight = parseFloat(setsOfPattern[2]);
    const reps = parseInt(setsOfPattern[3]);
    for (let i = 0; i < setCount; i++) {
      sets.push({ weight, reps });
    }
    return { exercise, sets };
  }

  // Pattern: 225 @ 8 for 3 sets OR 225x8 for 3 sets
  const multiPattern = remaining.match(/(\d+(?:\.5)?)\s*[@x×]\s*(\d+)\s+for\s+(\d+)\s*(?:sets?|s)?/);
  if (multiPattern) {
    const weight = parseFloat(multiPattern[1]);
    const reps = parseInt(multiPattern[2]);
    const setCount = parseInt(multiPattern[3]);
    for (let i = 0; i < setCount; i++) {
      sets.push({ weight, reps });
    }
    return { exercise, sets };
  }

  // Pattern: 315x5x3 (weight x reps x sets)
  const wxhxsPattern = remaining.match(/(\d+(?:\.5)?)\s*[@x×]\s*(\d+)\s*[@x×\*]\s*(\d+)/);
  if (wxhxsPattern) {
    const weight = parseFloat(wxhxsPattern[1]);
    const reps = parseInt(wxhxsPattern[2]);
    const setCount = parseInt(wxhxsPattern[3]);
    for (let i = 0; i < setCount; i++) {
      sets.push({ weight, reps });
    }
    return { exercise, sets };
  }

  // Pattern: 185x5, 185x5, 190x5 (various separators)
  const setPattern = /(\d+(?:\.5)?)\s*[@x×]\s*(\d+)/g;
  let match;
  while ((match = setPattern.exec(remaining)) !== null) {
    sets.push({ weight: parseFloat(match[1]), reps: parseInt(match[2]) });
  }

  if (sets.length > 0) {
    return { exercise, sets };
  }

  // Pattern: 185 lbs for 5 (single set)
  const singlePattern = remaining.match(/(\d+(?:\.5)?)\s*(?:lbs?|pounds?)?\s*(?:for\s*)?(\d+)\s*(?:reps?)?/);
  if (singlePattern) {
    sets.push({
      weight: parseFloat(singlePattern[1]),
      reps: parseInt(singlePattern[2])
    });
    return { exercise, sets };
  }

  return null;
}

module.exports = { parseWorkout, normalizeExercise, EXERCISE_ALIASES };

// Test if run directly
if (require.main === module) {
  const testCases = [
    'bp 185x5, 185x5, 190x5',
    'bench 225@8 for 3 sets',
    'squat 315x5x3',
    'dl 405x1',
    'ohp 135 lbs for 5',
    'did 3 sets of 185x8 on bench',
    'pullups bw x 10, bw x 8',
    'hit incline at 185 for 8 reps'
  ];
  
  testCases.forEach(t => {
    console.log('\nInput: "' + t + '"');
    const result = parseWorkout(t);
    console.log(result ? '✓ ' + result.exercise + ': ' + result.sets.map(s => s.weight + 'x' + s.reps).join(', ') : '✗ Failed to parse');
  });
}
