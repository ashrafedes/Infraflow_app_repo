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

  const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '025_fix_view_company_isolation.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')
  console.log(`Loaded migration: ${sql.length} bytes`)

  try {
    await client.query(sql)
    console.log('Migration 025 applied successfully!')
  } catch (err) {
    console.error('Migration failed:', err.message)
    throw err
  }

  // Verify: check that views now filter by company_id
  const { rows: viewCheck } = await client.query(`
    SELECT viewname, definition
    FROM pg_views
    WHERE schemaname = 'public'
      AND viewname IN ('v_movement_details', 'v_warehouse_balance', 'v_work_order_balance', 'v_contractor_balance', 'v_wo_material_summary')
    ORDER BY viewname
  `)
  for (const v of viewCheck) {
    const hasFilter = v.definition.includes('company_id()')
    console.log(`  ${v.viewname}: ${hasFilter ? 'OK (has company_id filter)' : 'WARNING (no filter found)'}`)
  }

  await client.end()
  console.log('Done')
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
