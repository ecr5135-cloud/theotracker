const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { addExerciseToToday, loadData, saveData } = require('./session');

const PORT = 8081;

// Batched auto-commit - commit 30 seconds after last change
let commitTimeout = null;
function gitCommit(message) {
  if (commitTimeout) clearTimeout(commitTimeout);
  commitTimeout = setTimeout(() => {
    exec(`cd "${__dirname}" && git add data.json && git commit -m "${message}" && git push`, (err) => {
      if (err) console.log('Git commit skipped or failed:', err.message);
    });
  }, 30000); // 30 second delay
}

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // API: Get data
  if (url.pathname === '/api/data' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(loadData()));
    return;
  }

  // API: Add exercise to today's workout session
  if (url.pathname === '/api/workout' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { exercise, sets } = JSON.parse(body);
        const text = `${exercise} ${sets.map(s => `${s.weight}x${s.reps}`).join(', ')}`;
        const result = addExerciseToToday(text);

        if (result.success) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, isPR: result.isPR }));
          gitCommit(`Workout: ${result.exercise} ${result.thisMax}lbs`);
        } else {
          res.writeHead(400);
          res.end(JSON.stringify({ error: result.error }));
        }
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: Add meal
  if (url.pathname === '/api/meal' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const meal = JSON.parse(body);
        meal.id = Date.now();
        meal.date = new Date().toISOString();

        const data = loadData();
        data.meals.unshift(meal);
        saveData(data);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        gitCommit(`Meal: ${meal.meal.substring(0, 30)}${meal.meal.length > 30 ? '...' : ''}`);
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: Analyze meal (save image for later analysis)
  if (url.pathname === '/api/analyze-meal' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { image } = JSON.parse(body);
        const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        const filename = `meal-${Date.now()}.jpg`;
        const filepath = path.join(__dirname, 'uploads', filename);

        // Ensure uploads dir exists
        if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
          fs.mkdirSync(path.join(__dirname, 'uploads'));
        }

        fs.writeFileSync(filepath, buffer);

        // Return a generic response - user should ask Theo on Telegram for analysis
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          description: 'Photo captured - ask Theo on Telegram to analyze this meal',
          calories: '',
          protein: ''
        }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: Add bodyweight
  if (url.pathname === '/api/bodyweight' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { weight, date } = JSON.parse(body);
        const data = loadData();
        if (!data.bodyweights) data.bodyweights = [];
        
        // Check if entry for this date already exists
        const existingIndex = data.bodyweights.findIndex(bw => bw.date === date);
        if (existingIndex >= 0) {
          data.bodyweights[existingIndex].weight = weight;
        } else {
          data.bodyweights.push({ weight, date, id: Date.now() });
        }
        
        saveData(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        gitCommit(`Bodyweight: ${weight} lbs`);
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Serve static files
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.join(__dirname, filePath);

  const ext = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json'
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TheoTracker running at http://localhost:${PORT}`);
});
