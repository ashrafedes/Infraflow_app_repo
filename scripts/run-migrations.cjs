const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
const dns = require('dns')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations')
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  // Try all Supabase pooler regions to find the right one
  const regions = ['us-east-1', 'ap-southeast-1', 'eu-west-1', 'us-west-1', 'eu-central-1', 'ap-northeast-1', 'ap-south-1', 'sa-east-1', 'ca-central-1']
  let client = null
  let connectedRegion = null

  for (const region of regions) {
    const hostname = `aws-0-${region}.pooler.supabase.com`
    console.log(`Trying pooler region: ${region}...`)
    try {
      const c = new Client({
        host: hostname,
        port: 6543,
        database: 'postgres',
        user: `postgres.${PROJECT_REF}`,
        password: DB_PASSWORD,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      })
      await c.connect()
      console.log(`Connected via ${region}!\n`)
      client = c
      connectedRegion = region
      break
    } catch (err) {
      console.log(`  Failed: ${err.message}`)
    }
  }

  if (!client) {
    console.error('Could not connect to any pooler region.')
    process.exit(1)
  }

  try {
    // Create migrations tracking table
    await client.query(`CREATE TABLE IF NOT EXISTS _migrations (id text primary key, applied_at timestamptz default now())`)

    for (const file of files) {
      // Check if already applied
      const { rows } = await client.query('SELECT id FROM _migrations WHERE id = $1', [file])
      if (rows.length > 0) {
        console.log(`Skipping (already applied): ${file}`)
        continue
      }

      const filePath = path.join(migrationsDir, file)
      const sql = fs.readFileSync(filePath, 'utf8')
      console.log(`Running: ${file}`)
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('INSERT INTO _migrations (id) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`  ✓ Done\n`)
      } catch (err) {
        await client.query('ROLLBACK')
        console.error(`  ✗ Failed: ${err.message}`)
        if (err.detail) console.error('  Detail:', err.detail)
        if (err.hint) console.error('  Hint:', err.hint)
        console.log(`  Skipping this migration.\n`)
      }
    }

    console.log('Migration run complete!')
  } catch (err) {
    console.error('Fatal error:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigrations()
