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

  const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '026_add_premium_analytics_features.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')
  console.log(`Loaded migration: ${sql.length} bytes`)

  try {
    await client.query(sql)
    console.log('Migration 026 applied successfully!')
  } catch (err) {
    console.error('Migration failed:', err.message)
    throw err
  }

  // Verify: check features
  const { rows: features } = await client.query(`
    SELECT feature_key, feature_name, category FROM features
    WHERE feature_key IN ('trend_analysis', 'cost_breakdown', 'forecasting')
    ORDER BY feature_key
  `)
  console.log('\nNew features:')
  for (const f of features) {
    console.log(`  ${f.feature_key}: ${f.feature_name} (${f.category})`)
  }

  // Verify: check plan_features
  const { rows: pf } = await client.query(`
    SELECT sp.plan_code, pf.feature_key, pf.is_enabled
    FROM plan_features pf
    JOIN subscription_plans sp ON sp.id = pf.plan_id
    WHERE pf.feature_key IN ('trend_analysis', 'cost_breakdown', 'forecasting')
    ORDER BY sp.sort_order, pf.feature_key
  `)
  console.log('\nPlan features:')
  for (const r of pf) {
    console.log(`  ${r.plan_code}: ${r.feature_key} = ${r.is_enabled}`)
  }

  // Verify: premium plan description
  const { rows: plan } = await client.query(`
    SELECT plan_code, plan_name, description FROM subscription_plans WHERE plan_code = 'premium'
  `)
  if (plan.length) {
    console.log(`\nPremium plan description: ${plan[0].description}`)
  }

  await client.end()
  console.log('\nDone')
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
