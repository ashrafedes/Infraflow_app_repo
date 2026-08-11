const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function applyMigration() {
  const client = new Client({
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: `postgres.${PROJECT_REF}`,
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  })

  await client.connect()
  try {
    const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '016_create_movement_with_lines_rpc.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    await client.query(sql)
    console.log('Migration 016 applied successfully')

    // Verify the function exists
    const { rows } = await client.query(`
      SELECT proname, pg_get_function_arguments(oid) as args
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'create_movement_with_lines'
    `)
    console.log('Function created:', JSON.stringify(rows[0], null, 2))
  } catch (e) {
    console.error('Migration error:', e.message)
    console.error(e.detail || '')
  } finally {
    await client.end()
  }
}

applyMigration().catch(console.error)
