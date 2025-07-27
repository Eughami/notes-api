const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./notes.db', (err) => {
  if (err) {
    console.error(err.message);
  }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT
    )`);

  db.run(`CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        deleted_at DATETIME,
        is_hidden BOOLEAN NOT NULL,
        user_id INTEGER,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);
});

const userFromHeader = (req, res, next) => {
  const userId = req.headers['x-user-id'];
  console.log({ userId });
  if (!userId) {
    return res.status(400).json({ error: 'User ID header is required.' });
  }
  req.userId = parseInt(userId, 10);
  next();
};

app.post('/users', (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username is required.' });
  }

  const insertSql = `INSERT INTO users (username) VALUES (?)`;

  db.run(insertSql, [username], function (err) {
    if (err) {
      // If the error is because the username is not unique
      if (err.message.includes('UNIQUE constraint failed')) {
        // Find the existing user and return their details
        const selectSql = `SELECT * FROM users WHERE username = ?`;
        db.get(selectSql, [username], (err, row) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          // Respond with 200 OK and the existing user's data
          return res.status(200).json(row);
        });
      } else {
        // For any other errors, return a server error
        return res.status(500).json({ error: err.message });
      }
    } else {
      // If the user was created successfully, return 201 Created
      res.status(201).json({
        id: this.lastID,
        username,
      });
    }
  });
});

app.get('/users/:id', (req, res) => {
  const { id } = req.params;
  const sql = 'SELECT * FROM users WHERE id = ?';
  db.get(sql, [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (row) {
      res.json({ status: 'ok', user: row });
    } else {
      res.status(404).json({ status: 'not found' });
    }
  });
});

app.get('/notes', userFromHeader, (req, res) => {
  const { userId } = req;
  db.all(
    'SELECT * FROM notes WHERE user_id = ? AND deleted_at IS NULL',
    [userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

app.post('/notes', userFromHeader, (req, res) => {
  const { userId } = req;
  const {
    id = Date.now(),
    title,
    content,
    is_hidden = false,
    createdAt = new Date().toISOString(),
  } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required.' });
  }

  const sql = `INSERT INTO notes (id, title, content, created_at, updated_at, is_hidden, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const params = [id, title, content, createdAt, createdAt, is_hidden, userId];

  db.run(sql, params, function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({
      id: this.lastID,
      title,
      content,
      created_at: createdAt,
      updated_at: createdAt,
      is_hidden,
      user_id: userId,
    });
  });
});

app.patch('/notes/:id', userFromHeader, (req, res) => {
  const { userId } = req;
  const { id } = req.params;
  const { title, content, is_hidden } = req.body;
  const updatedAt = new Date().toISOString();

  if (title === undefined && content === undefined && is_hidden === undefined) {
    return res.status(400).json({
      error: 'At least one field (title, content, is_hidden) must be provided.',
    });
  }

  const fields = [];
  const params = [];

  if (title !== undefined) {
    fields.push('title = ?');
    params.push(title);
  }
  if (content !== undefined) {
    fields.push('content = ?');
    params.push(content);
  }
  if (is_hidden !== undefined) {
    fields.push('is_hidden = ?');
    params.push(is_hidden);
  }

  fields.push('updated_at = ?');
  params.push(updatedAt);
  params.push(id, userId);

  const sql = `UPDATE notes SET ${fields.join(
    ', '
  )} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`;

  db.run(sql, params, function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({
        error: 'Note not found or you do not have permission to edit it.',
      });
    }
    res.json({ message: 'Note updated successfully.' });
  });
});

app.delete('/notes/:id', userFromHeader, (req, res) => {
  const { userId } = req;
  const { id } = req.params;
  const deletedAt = new Date().toISOString();

  const sql = `UPDATE notes SET deleted_at = ? WHERE id = ? AND user_id = ?`;

  db.run(sql, [deletedAt, id, userId], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({
        error: 'Note not found or you do not have permission to delete it.',
      });
    }
    res.json({ message: 'Note deleted successfully.' });
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(port, () => {
  // App listening
  console.log(`App runnning on port ${port}`);
});
