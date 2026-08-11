const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function rerunMigration() {
  const client = new Client({
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: `postgres.${PROJECT_REF}`,
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  })

  try {
    await client.connect()
    console.log('Connected')

    // Remove 004 from _migrations so it can re-run
    await client.query("DELETE FROM _migrations WHERE id = '004_auth_trigger.sql'")
    console.log('Removed 004 from migrations tracking')

    // Run the migration
    const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '004_auth_trigger.sql'), 'utf8')
    console.log('Running 004_auth_trigger.sql...')
    await client.query(sql)
    console.log('Done!')

    // Re-add to _migrations
    await client.query("INSERT INTO _migrations (id) VALUES ('004_auth_trigger.sql')")
    console.log('Marked as applied')
  } catch (err) {
    console.error('Error:', err.message)
    if (err.detail) console.error('Detail:', err.detail)
    if (err.hint) console.error('Hint:', err.hint)
  } finally {
    await client.end()
  }
}

rerunMigration()
