#!/usr/bin/env node
/**
 * Check for PR and return status
 * Usage: node check-pr.js "Exercise Name" weight
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { workouts: [], meals: [] };
  }
}

function checkPR(exercise, weight) {
  const data = loadData();
  const exerciseWorkouts = data.workouts.filter(w => 
    w.exercise.toLowerCase() === exercise.toLowerCase()
  );
  
  if (exerciseWorkouts.length === 0) {
    console.log(JSON.stringify({ isPR: true, previousMax: 0 }));
    return;
  }
  
  const previousMax = Math.max(...exerciseWorkouts.map(w => 
    Math.max(...w.sets.map(s => s.weight))
  ));
  
  const isPR = weight > previousMax;
  console.log(JSON.stringify({ isPR, previousMax, newMax: weight }));
}

const exercise = process.argv[2];
const weight = parseFloat(process.argv[3]);

if (!exercise || isNaN(weight)) {
  console.error('Usage: node check-pr.js "Bench Press" 185');
  process.exit(1);
}

checkPR(exercise, weight);
