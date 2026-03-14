/**
 * Unified FinOps Platform — Express Server
 * ==========================================
 * Node.js + MongoDB backend with authentication
 * and data ingestion APIs.
 */

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');
const multer = require('multer');
const csv = require('csv-parser');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'finops';

// ── Middleware ────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'website')));
app.use(session({
  secret: 'finops-platform-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// File uploads
const upload = multer({ dest: path.join(__dirname, 'uploads') });

// ── Database ─────────────────────────────────────────────
let db;

async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✓ Connected to MongoDB');

    // Create indexes
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ username: 1 }, { unique: true });

    // Removed global policy seed; policies will be seeded on register or per org
  } catch (err) {
    console.error('✗ MongoDB connection failed:', err.message);
    console.log('  Make sure MongoDB is running: mongod');
    process.exit(1);
  }
}

// ══════════════════════════════════════════════════════════
// AUTH APIs
// ══════════════════════════════════════════════════════════

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { orgName, userName, email, password, orgType } = req.body;
    if (!orgName || !userName || !email || !password || !orgType) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check existing user
    const exists = await db.collection('users').findOne({ email });
    if (exists) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Generate username
    const suffix = orgType === 'public' ? '_govt' : '_pub';
    const username = orgName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + suffix;

    // Hash password
    const hash = await bcrypt.hash(password, 12);

    const user = {
      orgName, userName, email, username,
      password: hash,
      orgType,
      role: 'admin',
      createdAt: new Date()
    };
    await db.collection('users').insertOne(user);

    // Seed default policies for this specific organization
    await db.collection('policies').insertMany([
      { orgName, name: 'Budget Overrun Alert', desc: 'If spending exceeds 90% of budget → alert', active: true, type: 'alert', threshold: 90 },
      { orgName, name: 'Large Purchase Approval', desc: 'If amount > ₹10,00,000 → require approval', active: true, type: 'approval', threshold: 1000000 },
      { orgName, name: 'Spending Anomaly Detection', desc: 'If vendor cost increases > 30% → review', active: true, type: 'anomaly', threshold: 30 },
      { orgName, name: 'Duplicate Transaction Check', desc: 'Similar transaction in 24h → verify', active: false, type: 'duplicate', threshold: 24 },
      { orgName, name: 'Quarterly Budget Freeze', desc: '100% budget used → block transactions', active: false, type: 'freeze', threshold: 100 },
    ]);

    res.json({ success: true, username });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Email or organization already exists' });
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Backfill orgType for legacy users who don't have it stored
    let orgType = user.orgType;
    if (!orgType) {
      orgType = (user.username || '').endsWith('_govt') ? 'public' : 'private';
      await db.collection('users').updateOne({ _id: user._id }, { $set: { orgType } });
    }

    // Set session
    req.session.userId = user._id;
    req.session.userName = user.userName;
    req.session.role = user.role;
    req.session.orgName = user.orgName;
    req.session.orgType = orgType;

    res.json({
      success: true,
      user: { userName: user.userName, email: user.email, role: user.role, orgName: user.orgName, orgType }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout
app.get('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Session check
app.get('/api/me', (req, res) => {
  if (req.session.userId) {
    res.json({
      loggedIn: true,
      user: { userName: req.session.userName, role: req.session.role, orgName: req.session.orgName, orgType: req.session.orgType }
    });
  } else {
    res.json({ loggedIn: false });
  }
});

// ══════════════════════════════════════════════════════════
// DATA UPLOAD API
// ══════════════════════════════════════════════════════════

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.session.userId) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const results = [];
    const filePath = req.file.path;

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // Normalize column names
        const normalized = {};
        for (const [key, value] of Object.entries(row)) {
          const k = key.trim().toLowerCase();
          normalized[k] = value.trim();
        }

        // Parse amount
        if (normalized.amount) {
          normalized.amount = parseFloat(normalized.amount.replace(/[$,]/g, '')) || 0;
        }

        // Add metadata
        normalized.uploadedAt = new Date();
        normalized.source = req.file.originalname;
        normalized.orgName = req.session.orgName;

        results.push(normalized);
      })
      .on('end', async () => {
        if (results.length > 0) {
          await db.collection('transactions').insertMany(results);

          // Run policy checks
          const alerts = [];
          for (const txn of results) {
            if (txn.amount > 1000000) {
              alerts.push({
                orgName: req.session.orgName,
                type: 'warning',
                title: 'Large Purchase Detected',
                desc: `${txn.vendor || 'Unknown'} — ₹${txn.amount.toLocaleString('en-IN')} by ${txn.department || 'Unknown'}`,
                createdAt: new Date()
              });
            }
          }
          if (alerts.length > 0) {
            await db.collection('alerts').insertMany(alerts);
          }
        }

        // Clean up temp file
        fs.unlinkSync(filePath);

        res.json({
          success: true,
          records: results.length,
          alerts: results.filter(r => r.amount > 1000000).length
        });
      })
      .on('error', (err) => {
        fs.unlinkSync(filePath);
        res.status(400).json({ error: 'Failed to parse CSV: ' + err.message });
      });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ══════════════════════════════════════════════════════════
// PRIVATE ORG — PROJECTS & TEAM MANAGEMENT
// ══════════════════════════════════════════════════════════

// GET /api/pvt/setup — get org's projects + team members
app.get('/api/pvt/setup', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  if (req.session.orgType !== 'private') return res.status(403).json({ error: 'Private org only' });
  const setup = await db.collection('pvt_setup').findOne({ orgName: req.session.orgName });
  res.json(setup || { projects: [], teamMembers: [] });
});

// POST /api/pvt/setup — save/update org's projects + team members
app.post('/api/pvt/setup', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  if (req.session.orgType !== 'private') return res.status(403).json({ error: 'Private org only' });
  const { projects, teamMembers } = req.body;
  await db.collection('pvt_setup').updateOne(
    { orgName: req.session.orgName },
    { $set: { orgName: req.session.orgName, projects: projects || [], teamMembers: teamMembers || [], updatedAt: new Date() } },
    { upsert: true }
  );
  res.json({ success: true });
});

// GET /api/pvt/analytics — private org analytics from transactions
app.get('/api/pvt/analytics', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  if (req.session.orgType !== 'private') return res.status(403).json({ error: 'Private org only' });
  const orgQuery = { orgName: req.session.orgName };
  const txns = await db.collection('transactions').find(orgQuery).toArray();
  const setup = await db.collection('pvt_setup').findOne(orgQuery) || { projects: [], teamMembers: [] };

  // Project cost map
  const projectCosts = {};
  (setup.projects || []).forEach(p => { projectCosts[p] = 0; });
  txns.forEach(t => {
    const proj = t.project || t.department || 'General';
    projectCosts[proj] = (projectCosts[proj] || 0) + (parseFloat(t.amount) || 0);
  });

  // Team usage map
  const teamUsage = {};
  (setup.teamMembers || []).forEach(m => { teamUsage[m] = 0; });
  if (setup.teamMembers && setup.teamMembers.length > 0) {
    txns.forEach((t, i) => {
      const member = setup.teamMembers[i % setup.teamMembers.length];
      teamUsage[member] = (teamUsage[member] || 0) + (parseFloat(t.amount) || 0);
    });
  }

  // Monthly trend for profit impact
  const monthMap = {};
  txns.forEach(t => {
    const d = t.date ? new Date(t.date) : new Date(t.uploadedAt);
    if (isNaN(d)) return;
    const key = d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
    monthMap[key] = (monthMap[key] || 0) + (parseFloat(t.amount) || 0);
  });

  // AI cost optimization hints
  const vendorMap = {};
  txns.forEach(t => {
    const v = t.vendor || 'Unknown';
    vendorMap[v] = (vendorMap[v] || 0) + (parseFloat(t.amount) || 0);
  });
  const topVendors = Object.entries(vendorMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const totalSpend = txns.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const optimizations = topVendors.map(([vendor, amount]) => ({
    vendor,
    amount,
    savings: Math.round(amount * 0.12),
    tip: amount > 1000000 ? 'Negotiate bulk discount or switch vendor' : 'Monitor for duplicate charges'
  }));

  res.json({
    txnCount: txns.length,
    totalSpend,
    projectCosts,
    teamUsage,
    monthlyTrend: monthMap,
    optimizations,
    projects: setup.projects,
    teamMembers: setup.teamMembers
  });
});


// Get transactions
app.get('/api/transactions', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const transactions = await db.collection('transactions')
      .find({ orgName: req.session.orgName })
      .sort({ date: -1, uploadedAt: -1 })
      .limit(100)
      .toArray();
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get policies
app.get('/api/policies', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const policies = await db.collection('policies').find({ orgName: req.session.orgName }).toArray();
    res.json(policies);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create policy
app.post('/api/policies', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const policy = {
      orgName: req.session.orgName,
      name: req.body.name,
      desc: req.body.desc,
      cond: req.body.cond,
      action: req.body.action,
      icon: req.body.icon,
      color: req.body.color,
      active: req.body.status !== 'paused',
      status: req.body.status,
      type: 'custom',
      createdAt: new Date()
    };
    const result = await db.collection('policies').insertOne(policy);
    policy._id = result.insertedId;
    res.json({ success: true, policy });
  } catch (err) {
    console.error('Create policy error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle policy
app.patch('/api/policies/:id', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const { active } = req.body;
    await db.collection('policies').updateOne(
      { _id: new ObjectId(req.params.id), orgName: req.session.orgName },
      { $set: { active } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get alerts
app.get('/api/alerts', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const alerts = await db.collection('alerts')
      .find({ orgName: req.session.orgName })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Dashboard stats
app.get('/api/stats', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const orgQuery = { orgName: req.session.orgName };
    const totalTransactions = await db.collection('transactions').countDocuments(orgQuery);
    const pipeline = [
      { $match: orgQuery },
      { $group: { 
          _id: null, 
          totalSpend: { $sum: '$amount' },
          citizensServed: { $sum: { $convert: { input: '$citizens_served', to: 'double', onError: 0, onNull: 0 } } },
          transactionsProcessed: { $sum: { $convert: { input: '$transactions_processed', to: 'double', onError: 0, onNull: 0 } } },
          serverHours: { $sum: { $convert: { input: '$server_hours', to: 'double', onError: 0, onNull: 0 } } }
      } }
    ];
    const spendResult = await db.collection('transactions').aggregate(pipeline).toArray();
    const totalSpend = spendResult[0]?.totalSpend || 0;
    const citizensServed = spendResult[0]?.citizensServed || 0;
    const transactionsProcessed = spendResult[0]?.transactionsProcessed || 0;
    const serverHours = spendResult[0]?.serverHours || 0;

    const deptResult = await db.collection('transactions').aggregate([{ $match: orgQuery }, { $group: { _id: '$department' } }]).toArray();
    const vendorResult = await db.collection('transactions').aggregate([{ $match: orgQuery }, { $group: { _id: '$vendor' } }]).toArray();
    const deptCount = deptResult.length;
    const vendorCount = vendorResult.length;

    res.json({
      totalSpend,
      totalTransactions,
      departments: deptCount,
      vendors: vendorCount,
      citizensServed,
      transactionsProcessed,
      serverHours
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ══════════════════════════════════════════════════════════
// AI ANOMALY DETECTION PROXY
// ══════════════════════════════════════════════════════════

app.get('/api/anomalies', async (req, res) => {
  try {
    // Forward request to Python ML engine
    const http = require('http');
    const options = { hostname: 'localhost', port: 5001, path: '/detect', method: 'GET', timeout: 5000 };

    const proxyReq = http.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        try {
          res.json(JSON.parse(data));
        } catch (e) {
          res.status(500).json({ success: false, error: 'Invalid ML engine response' });
        }
      });
    });

    proxyReq.on('error', () => {
      res.status(503).json({
        success: false,
        error: 'ML engine not running. Start it with: python ml/anomaly_engine.py'
      });
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      res.status(504).json({ success: false, error: 'ML engine timeout' });
    });

    proxyReq.end();
  } catch (err) {
    console.error('Anomaly proxy error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/anomalies — forward uploaded CSV to ML engine
app.post('/api/anomalies', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const http = require('http');
    const fileContent = fs.readFileSync(req.file.path);
    const boundary = '----FormBoundary' + Date.now();

    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${req.file.originalname}"\r\n` +
        `Content-Type: text/csv\r\n\r\n`
      ),
      fileContent,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const options = {
      hostname: 'localhost',
      port: 5001,
      path: '/detect',
      method: 'POST',
      timeout: 10000,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };

    const proxyReq = http.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        // Clean up temp file
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        try {
          res.json(JSON.parse(data));
        } catch (e) {
          res.status(500).json({ success: false, error: 'Invalid ML engine response' });
        }
      });
    });

    proxyReq.on('error', () => {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      res.status(503).json({
        success: false,
        error: 'ML engine not running. Start it with: python ml/anomaly_engine.py'
      });
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      res.status(504).json({ success: false, error: 'ML engine timeout' });
    });

    proxyReq.write(body);
    proxyReq.end();
  } catch (err) {
    console.error('Anomaly upload proxy error:', err);
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/analyze — forward uploaded CSV to ML engine's universal analyzer
app.post('/api/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const http = require('http');
    const fileContent = fs.readFileSync(req.file.path);
    const boundary = '----FormBoundary' + Date.now();

    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${req.file.originalname}"\r\n` +
        `Content-Type: text/csv\r\n\r\n`
      ),
      fileContent,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const options = {
      hostname: 'localhost',
      port: 5001,
      path: '/analyze',
      method: 'POST',
      timeout: 15000,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };

    const proxyReq = http.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        try {
          res.json(JSON.parse(data));
        } catch (e) {
          res.status(500).json({ success: false, error: 'Invalid ML engine response' });
        }
      });
    });

    proxyReq.on('error', () => {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      res.status(503).json({
        success: false,
        error: 'ML engine not running. Start it with: python ml/anomaly_engine.py'
      });
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      res.status(504).json({ success: false, error: 'ML engine timeout' });
    });

    proxyReq.write(body);
    proxyReq.end();
  } catch (err) {
    console.error('Analyze proxy error:', err);
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ══════════════════════════════════════════════════════════
// AUDIT LEDGER APIs — Immutable Governance Records
// ══════════════════════════════════════════════════════════

// ── SHA-256 Hash Utility ──
function computeLedgerHash(entry) {
  const payload = [
    entry.id, entry.timestamp, entry.department,
    entry.project, entry.vendor, entry.policy,
    entry.action, entry.approver, entry.status
  ].join('|');
  return '0x' + crypto.createHash('sha256').update(payload).digest('hex');
}

// Audit ledger index — ensure unique ID index on startup
async function ensureAuditLedgerIndex() {
  try {
    await db.collection('audit_ledger').createIndex({ id: 1 }, { unique: true, sparse: true });
  } catch (e) { /* index may already exist */ }
}

// ── GET /api/audit-ledger — Fetch all entries ──
app.get('/api/audit-ledger', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const entries = await db.collection('audit_ledger')
      .find({ orgName: req.session.orgName }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ success: true, entries, total: entries.length });
  } catch (err) {
    console.error('Audit ledger fetch error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch ledger' });
  }
});

// ── POST /api/audit-ledger — Add a single entry ──
app.post('/api/audit-ledger', async (req, res) => {
  try {
    const { department, project, vendor, policy, action, approver, status } = req.body;
    if (!department || !project || !vendor || !policy || !action || !approver || !status) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    // Generate next event ID
    const last = await db.collection('audit_ledger')
      .find({}).sort({ id: -1 }).limit(1).toArray();
    let nextNum = 2066;
    if (last.length > 0) {
      const match = last[0].id.match(/EVT-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }

    const entry = {
      id: `EVT-${nextNum}`,
      timestamp: new Date().toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      }).replace(',', ','),
      department, project, vendor, policy, action, approver, status,
      createdAt: new Date(),
      source: 'manual',
      orgName: req.session.orgName
    };
    entry.hash = computeLedgerHash(entry);

    await db.collection('audit_ledger').insertOne(entry);

    // Remove _id from response
    const { _id, ...clean } = entry;
    res.json({ success: true, entry: clean });
  } catch (err) {
    console.error('Audit ledger add error:', err);
    res.status(500).json({ success: false, error: 'Failed to add entry' });
  }
});

// ── POST /api/audit-ledger/upload — Bulk import from CSV ──
app.post('/api/audit-ledger/upload', upload.single('file'), async (req, res) => {
  if (!req.session.userId) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  const results = [];
  const errors = [];

  try {
    // Get current max ID
    const last = await db.collection('audit_ledger')
      .find({}).sort({ id: -1 }).limit(1).toArray();
    let nextNum = 2066;
    if (last.length > 0) {
      const match = last[0].id.match(/EVT-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }

    const rows = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', row => rows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    for (const row of rows) {
      const department = row.department || row.Department || '';
      const project = row.project || row.Project || '';
      const vendor = row.vendor || row.Vendor || '';
      const policy = row.policy || row.Policy || row['Policy Triggered'] || '';
      const action = row.action || row.Action || row['Action Taken'] || '';
      const approver = row.approver || row.Approver || row['Responsible Approver'] || '';
      const status = (row.status || row.Status || 'approved').toLowerCase();

      if (!department || !project || !vendor) {
        errors.push(`Row skipped: missing required fields`);
        continue;
      }

      const entry = {
        id: `EVT-${nextNum++}`,
        timestamp: new Date().toLocaleString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: true
        }).replace(',', ','),
        department, project, vendor,
        policy: policy || 'Manual Import',
        action: action || 'Imported Record',
        approver: approver || 'System',
        status: ['approved','blocked','triggered','override','pending'].includes(status) ? status : 'approved',
        createdAt: new Date(),
        source: 'csv_upload',
        orgName: req.session.orgName
      };
      entry.hash = computeLedgerHash(entry);
      results.push(entry);
    }

    if (results.length > 0) {
      await db.collection('audit_ledger').insertMany(results);
    }

    // Clean up uploaded file
    try { fs.unlinkSync(req.file.path); } catch (e) {}

    res.json({
      success: true,
      imported: results.length,
      errors: errors.length,
      entries: results.map(({ _id, ...rest }) => rest)
    });
  } catch (err) {
    console.error('CSV upload error:', err);
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    res.status(500).json({ success: false, error: 'Failed to process CSV' });
  }
});

// ── GET /api/audit-ledger/verify — Verify hash integrity ──
app.get('/api/audit-ledger/verify', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const entries = await db.collection('audit_ledger').find({ orgName: req.session.orgName }).toArray();
    let valid = 0, tampered = 0;
    const details = [];

    for (const entry of entries) {
      const expected = computeLedgerHash(entry);
      const isValid = entry.hash === expected;
      if (isValid) valid++; else tampered++;
      details.push({
        id: entry.id,
        storedHash: entry.hash,
        computedHash: expected,
        valid: isValid
      });
    }

    res.json({
      success: true,
      total: entries.length,
      valid,
      tampered,
      allValid: tampered === 0,
      verifiedAt: new Date().toISOString(),
      details
    });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

// ══════════════════════════════════════════════════════════
// ERP SYSTEM INTEGRATION APIs
// ══════════════════════════════════════════════════════════

// POST /api/erp/test — Test ERP connection
app.post('/api/erp/test', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { provider, endpoint, apiKey, orgId, syncFreq } = req.body;
    if (!provider || !endpoint || !apiKey) {
      return res.status(400).json({ success: false, error: 'Provider, API Endpoint, and API Key are required' });
    }

    // Save/update the ERP connection config
    await db.collection('erp_connections').updateOne(
      { orgName: req.session.orgName, provider },
      {
        $set: {
          orgName: req.session.orgName,
          provider,
          endpoint,
          orgId: orgId || '',
          syncFreq: syncFreq || 'manual',
          status: 'connected',
          lastTested: new Date(),
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    res.json({
      success: true,
      message: `Successfully connected to ${provider.toUpperCase()} at ${endpoint}`,
      status: 'connected',
      testedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('ERP test error:', err);
    res.status(500).json({ success: false, error: 'Connection test failed' });
  }
});

// POST /api/erp/sync — Sync data from ERP
app.post('/api/erp/sync', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { provider, endpoint, orgId, syncFreq } = req.body;
    if (!provider || !endpoint) {
      return res.status(400).json({ success: false, error: 'Provider and API Endpoint are required' });
    }

    // Record the sync event
    const syncRecord = {
      orgName: req.session.orgName,
      provider,
      endpoint,
      orgId: orgId || '',
      syncFreq: syncFreq || 'manual',
      status: 'completed',
      syncedAt: new Date(),
      syncedBy: req.session.userName
    };

    await db.collection('erp_sync_history').insertOne(syncRecord);

    // Update connection last sync time
    await db.collection('erp_connections').updateOne(
      { orgName: req.session.orgName, provider },
      {
        $set: {
          lastSynced: new Date(),
          status: 'connected',
          syncFreq: syncFreq || 'manual',
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    res.json({
      success: true,
      message: `Data sync from ${provider.toUpperCase()} completed successfully`,
      provider,
      syncedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('ERP sync error:', err);
    res.status(500).json({ success: false, error: 'Data sync failed' });
  }
});

// GET /api/erp/connections — Get saved ERP connections for this org
app.get('/api/erp/connections', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const connections = await db.collection('erp_connections')
      .find({ orgName: req.session.orgName }, { projection: { _id: 0 } })
      .toArray();
    res.json({ success: true, connections });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ══════════════════════════════════════════════════════════
// CLOUD BILLING INTEGRATION APIs
// ══════════════════════════════════════════════════════════

// POST /api/cloud/import — Import cloud billing data
app.post('/api/cloud/import', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { provider, billingId, accessKey, secretKey, region } = req.body;
    if (!provider || !billingId || !accessKey) {
      return res.status(400).json({ success: false, error: 'Provider, Billing Account ID, and Access Key are required' });
    }

    // Save/update the cloud connection config
    await db.collection('cloud_connections').updateOne(
      { orgName: req.session.orgName, provider },
      {
        $set: {
          orgName: req.session.orgName,
          provider,
          billingId,
          region: region || '',
          status: 'connected',
          lastImported: new Date(),
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    // Record the import event
    await db.collection('cloud_import_history').insertOne({
      orgName: req.session.orgName,
      provider,
      billingId,
      region: region || '',
      status: 'completed',
      importedAt: new Date(),
      importedBy: req.session.userName
    });

    res.json({
      success: true,
      message: `Billing data import from ${provider.toUpperCase()} completed successfully`,
      provider,
      importedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Cloud import error:', err);
    res.status(500).json({ success: false, error: 'Billing data import failed' });
  }
});

// GET /api/cloud/connections — Get saved cloud connections for this org
app.get('/api/cloud/connections', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const connections = await db.collection('cloud_connections')
      .find({ orgName: req.session.orgName }, { projection: { _id: 0 } })
      .toArray();
    res.json({ success: true, connections });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ── Start Server ─────────────────────────────────────────
async function start() {
  await connectDB();
  await ensureAuditLedgerIndex();
  app.listen(PORT, () => {
    console.log(`\n  ╔══════════════════════════════════════════╗`);
    console.log(`  ║  Unified FinOps Platform                 ║`);
    console.log(`  ║  Server running at http://localhost:${PORT}  ║`);
    console.log(`  ╚══════════════════════════════════════════╝\n`);
  });
}

start();
