import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("jeba.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    memories TEXT,
    score INTEGER DEFAULT 0,
    joinedDate INTEGER,
    currentMood TEXT DEFAULT 'happy'
  );
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    userId TEXT,
    title TEXT,
    messages TEXT,
    timestamp INTEGER,
    FOREIGN KEY(userId) REFERENCES users(id)
  );
`);

// Migration: Add missing columns if they don't exist
const tableInfo = db.prepare("PRAGMA table_info(users)").all() as any[];
const columns = tableInfo.map(c => c.name);

if (!columns.includes("joinedDate")) {
  try { db.exec("ALTER TABLE users ADD COLUMN joinedDate INTEGER"); } catch (e) {}
}
if (!columns.includes("currentMood")) {
  try { db.exec("ALTER TABLE users ADD COLUMN currentMood TEXT DEFAULT 'happy'"); } catch (e) {}
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Auth API
  app.post("/api/auth/signup", (req, res) => {
    const { username, password } = req.body;
    const id = Math.random().toString(36).substr(2, 9);
    const joinedDate = Date.now();
    try {
      db.prepare("INSERT INTO users (id, username, password, memories, joinedDate) VALUES (?, ?, ?, ?, ?)").run(id, username, password, "[]", joinedDate);
      res.json({ id, username, joinedDate });
    } catch (e) {
      res.status(400).json({ error: "Username already exists" });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username = ? AND password = ?").get(username, password) as any;
    if (user) {
      res.json({ 
        id: user.id, 
        username: user.username, 
        memories: JSON.parse(user.memories), 
        score: user.score,
        joinedDate: user.joinedDate,
        currentMood: user.currentMood
      });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  // Data Sync API
  app.get("/api/chats/:userId", (req, res) => {
    const chats = db.prepare("SELECT * FROM chats WHERE userId = ? ORDER BY timestamp DESC").all(req.params.userId) as any[];
    res.json(chats.map(c => ({ ...c, messages: JSON.parse(c.messages) })));
  });

  app.post("/api/sync", (req, res) => {
    const { userId, chats, memories, score, currentMood } = req.body;
    
    db.transaction(() => {
      // Update user memories, score and mood
      db.prepare("UPDATE users SET memories = ?, score = ?, currentMood = ? WHERE id = ?").run(JSON.stringify(memories), score, currentMood, userId);
      
      // Update chats
      for (const chat of chats) {
        db.prepare(`
          INSERT INTO chats (id, userId, title, messages, timestamp)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            messages = excluded.messages,
            timestamp = excluded.timestamp
        `).run(chat.id, userId, chat.title, JSON.stringify(chat.messages), chat.timestamp);
      }
    })();
    
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
