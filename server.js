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
    req.on('end', async () => {
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

        // Analyze with OpenAI if API key available
        let analysis = null;
        const openaiKey = process.env.OPENAI_API_KEY;
        
        if (openaiKey) {
          try {
            const https = require('https');
            const postData = JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: 'Analyze this meal photo. Estimate calories and protein. Respond in JSON format: {"description": "brief description", "calories": number, "protein": number}' },
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
                  ]
                }
              ],
              max_tokens: 300
            });

            const response = await new Promise((resolve, reject) => {
              const req = https.request({
                hostname: 'api.openai.com',
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${openaiKey}`
                }
              }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
              });
              req.on('error', reject);
              req.write(postData);
              req.end();
            });

            const result = JSON.parse(response);
            const content = result.choices?.[0]?.message?.content || '';
            
            // Try to extract JSON from the response
            const jsonMatch = content.match(/\{[^}]+\}/);
            if (jsonMatch) {
              analysis = JSON.parse(jsonMatch[0]);
            }
          } catch (e) {
            console.log('OpenAI analysis failed:', e.message);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          filename: filename,
          analysis: analysis || { description: 'Photo saved. Add OPENAI_API_KEY for auto-analysis.', calories: null, protein: null }
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

  // API: Add recovery data
  if (url.pathname === '/api/recovery' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const recovery = JSON.parse(body);
        const data = loadData();
        if (!data.recovery) data.recovery = [];
        
        // Replace if entry for today exists
        const today = new Date().toISOString().split('T')[0];
        const existingIndex = data.recovery.findIndex(r => r.date === today);
        if (existingIndex >= 0) {
          data.recovery[existingIndex] = recovery;
        } else {
          data.recovery.push(recovery);
        }
        
        saveData(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        gitCommit(`Recovery: ${recovery.sleep}h sleep, feeling ${recovery.feeling}`);
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

// Handle port conflicts gracefully
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is busy, waiting...`);
    setTimeout(() => {
      server.close();
      server.listen(PORT, '0.0.0.0');
    }, 5000);
  } else {
    console.error('Server error:', err);
  }
});
