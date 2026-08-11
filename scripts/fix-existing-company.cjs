const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function fixExistingCompany() {
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
    // Get the existing company
    const { rows: companies } = await client.query(`
      SELECT c.id, c.name, up.id as user_id
      FROM companies c
      JOIN user_profiles up ON up.company_id = c.id
      WHERE up.role = 'company_admin'
    `)

    for (const c of companies) {
      // Check if subscription already exists
      const { rows: existing } = await client.query(
        'SELECT id FROM subscriptions WHERE company_id = $1',
        [c.id]
      )

      if (existing.length > 0) {
        console.log(`Company ${c.name} already has a subscription`)
        continue
      }

      // Get free_trial plan
      const { rows: plans } = await client.query(
        "SELECT id, trial_duration_days, default_max_users FROM subscription_plans WHERE plan_code = 'free_trial'"
      )

      if (plans.length === 0) {
        console.log('Free trial plan not found!')
        continue
      }

      const plan = plans[0]
      const trialEnds = new Date(Date.now() + plan.trial_duration_days * 24 * 60 * 60 * 1000)

      // Create subscription
      const { rows: sub } = await client.query(`
        INSERT INTO subscriptions (company_id, plan_id, status, trial_started_at, trial_ends_at)
        VALUES ($1, $2, 'trial', now(), $3)
        RETURNING id
      `, [c.id, plan.id, trialEnds])

      console.log(`Created subscription ${sub[0].id} for company ${c.name}`)

      // Create audit log
      await client.query(`
        INSERT INTO subscription_audit_log (company_id, action, old_value, new_value, performed_by)
        VALUES ($1::uuid, 'subscription_created', NULL,
          jsonb_build_object('plan_code', 'free_trial', 'status', 'trial', 'trial_ends_at', $2::timestamptz, 'max_users', $3::int),
          $4::uuid)
      `, [c.id, trialEnds, plan.default_max_users, c.user_id])

      console.log(`Created audit log for company ${c.name}`)
    }

    // Verify
    const { rows: subs } = await client.query(`
      SELECT s.id, c.name, sp.plan_code, s.status, s.trial_ends_at
      FROM subscriptions s
      JOIN companies c ON c.id = s.company_id
      JOIN subscription_plans sp ON sp.id = s.plan_id
    `)
    console.log('\nAll subscriptions:', JSON.stringify(subs, null, 2))

  } catch (err) {
    console.error('Error:', err.message)
    if (err.detail) console.error('Detail:', err.detail)
  } finally {
    await client.end()
  }
}

fixExistingCompany()
