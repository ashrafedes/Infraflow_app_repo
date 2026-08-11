const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

async function main() {
  const client = new Client({
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.smhckogpgkdppdvranqh',
    password: 'Wali2061ero$',
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '022_auto_confirm_emails.sql'), 'utf8')
  console.log('=== Applying Migration 022 ===')
  try {
    await client.query(sql)
    console.log('[OK] Migration 022 applied successfully.')
  } catch (err) {
    console.error('[FAILED]', err.message)
    await client.end()
    process.exit(1)
  }

  await client.end()
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1) })
