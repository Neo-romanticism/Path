const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    console.error('[FATAL] DATABASE_URL 환경변수가 설정되지 않았습니다. PostgreSQL 연결 문자열이 필요합니다.');
    console.error('[FATAL] 예시: DATABASE_URL=postgresql://user:password@host:5432/dbname');
    process.exit(1);
}

const needsSsl = process.env.NODE_ENV === 'production' ||
    (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=require'));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: needsSsl ? { rejectUnauthorized: false } : false
});

module.exports = pool;
