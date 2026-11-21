import { DatabaseSync } from 'node:sqlite';

export function openStore(filename, seed) {
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS catalog (
      id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL, products TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, receipt TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS orders_created_at ON orders(created_at DESC);
  `);
  db.prepare('INSERT OR IGNORE INTO catalog VALUES (1, 0, ?)').run(JSON.stringify(seed));

  function transaction(action) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function catalog() {
    const current = db.prepare('SELECT revision, products FROM catalog WHERE id = 1').get();
    return { revision: current.revision, products: JSON.parse(current.products) };
  }
  function saveCatalog(products, revision) {
    return db.prepare('UPDATE catalog SET products = ?, revision = revision + 1 WHERE id = 1 AND revision = ?')
      .run(JSON.stringify(products), revision).changes === 1;
  }

  function create(order) {
    db.prepare('INSERT INTO orders VALUES (?, ?, ?, ?)').run(order.id, order.receipt, order.createdAt, JSON.stringify(order));
  }
  function get(id) {
    const value = db.prepare('SELECT data FROM orders WHERE id = ?').get(id);
    return value ? JSON.parse(value.data) : null;
  }
  function byReceipt(receipt) {
    const value = db.prepare('SELECT data FROM orders WHERE receipt = ?').get(receipt);
    return value ? JSON.parse(value.data) : null;
  }
  function update(order) {
    db.prepare('UPDATE orders SET data = ? WHERE id = ?').run(JSON.stringify(order), order.id);
  }
  function orders() {
    return db.prepare('SELECT data FROM orders ORDER BY created_at DESC LIMIT 200').all()
      .map(value => JSON.parse(value.data));
  }

  return { close: () => db.close(), transaction, catalog, saveCatalog, create, get, byReceipt, update, orders };
}
