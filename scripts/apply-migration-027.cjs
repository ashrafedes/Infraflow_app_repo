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

  const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '027_add_pricing_to_subscription_plans.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')
  console.log(`Loaded migration: ${sql.length} bytes`)

  try {
    await client.query(sql)
    console.log('Migration 027 applied successfully!')
  } catch (err) {
    console.error('Migration failed:', err.message)
    throw err
  }

  // Verify
  const { rows: plans } = await client.query(`
    SELECT plan_code, plan_name, price_amount, price_currency, billing_period
    FROM subscription_plans
    ORDER BY sort_order
  `)
  console.log('\nPlan pricing:')
  for (const p of plans) {
    console.log(`  ${p.plan_code}: ${p.price_amount} ${p.price_currency} / ${p.billing_period}`)
  }

  await client.end()
  console.log('\nDone')
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
