const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function main() {
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
  console.log('Connected to database')

  const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '028_movements_page_performance.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')
  console.log(`Loaded migration: ${sql.length} bytes`)

  try {
    await client.query(sql)
    console.log('Migration 028 applied successfully!')
  } catch (err) {
    console.error('Migration failed:', err.message)
    throw err
  }

  // Verify indexes
  const { rows: indexes } = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'material_movements' AND indexname = 'idx_movements_company_created'
       OR tablename = 'material_movement_lines' AND indexname = 'idx_movement_lines_movement_material'
    ORDER BY indexname
  `)
  console.log('\nNew indexes:')
  for (const idx of indexes) {
    console.log(`  ${idx.indexname}: ${idx.indexdef}`)
  }

  await client.end()
  console.log('\nDone')
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
