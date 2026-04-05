import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 初始化数据库
  const db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });

  // 创建排行榜表
  await db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL,
      score INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  app.use(cors());
  app.use(express.json());

  // API: 提交分数
  app.post('/api/scores', async (req, res) => {
    const { nickname, score } = req.body;
    if (!nickname || score === undefined) {
      return res.status(400).json({ error: 'Missing nickname or score' });
    }
    try {
      await db.run('INSERT INTO scores (nickname, score) VALUES (?, ?)', [nickname, score]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // API: 获取排行榜 (天榜和周榜)
  app.get('/api/leaderboard', async (req, res) => {
    try {
      const daily = await db.all(`
        SELECT nickname, MAX(score) as score 
        FROM scores 
        WHERE created_at >= date('now', 'start of day')
        GROUP BY nickname 
        ORDER BY score DESC 
        LIMIT 50
      `);

      const weekly = await db.all(`
        SELECT nickname, MAX(score) as score 
        FROM scores 
        WHERE created_at >= date('now', '-7 days')
        GROUP BY nickname 
        ORDER BY score DESC 
        LIMIT 50
      `);

      res.json({ daily, weekly });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite 整合
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
