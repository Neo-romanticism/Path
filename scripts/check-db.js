const pool = require('./server/db');

async function checkColumns() {
  try {
    const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users';
        `);
    console.log('Columns in users table:');
    res.rows.forEach((row) => console.log(`${row.column_name} (${row.data_type})`));
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

checkColumns();
