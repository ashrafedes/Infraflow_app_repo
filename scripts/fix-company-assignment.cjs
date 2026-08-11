const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function fixCompany() {
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
    // Check existing companies
    const { rows: companies } = await client.query('SELECT id, name FROM companies ORDER BY name')
    console.log('Companies:', JSON.stringify(companies, null, 2))

    let companyId
    if (companies.length === 0) {
      // Create a company
      const { rows } = await client.query(
        `INSERT INTO companies (name) VALUES ('Test Company') RETURNING id`
      )
      companyId = rows[0].id
      console.log('Created company:', companyId)
    } else {
      companyId = companies[0].id
      console.log('Using existing company:', companies[0].name)
    }

    // Assign user to company
    await client.query(
      `UPDATE user_profiles SET company_id = $1 WHERE email = 'admin@infraflow.app'`,
      [companyId]
    )
    console.log('Assigned user to company')

    // Check if subscription exists
    const { rows: subs } = await client.query(
      'SELECT id FROM subscriptions WHERE company_id = $1', [companyId]
    )
    if (subs.length === 0) {
      // Get free_trial plan
      const { rows: plans } = await client.query(
        "SELECT id, trial_duration_days, default_max_users FROM subscription_plans WHERE plan_code = 'free_trial'"
      )
      if (plans.length > 0) {
        const trialEnds = new Date(Date.now() + plans[0].trial_duration_days * 86400000)
        await client.query(
          `INSERT INTO subscriptions (company_id, plan_id, status, trial_started_at, trial_ends_at) VALUES ($1, $2, 'trial', now(), $3)`,
          [companyId, plans[0].id, trialEnds]
        )
        console.log('Created subscription')
      }
    }

    // Verify
    const { rows: profile } = await client.query(
      `SELECT id, email, company_id, role FROM user_profiles WHERE email = 'admin@infraflow.app'`
    )
    console.log('Final profile:', JSON.stringify(profile[0], null, 2))
  } finally {
    await client.end()
  }
}

fixCompany().catch(console.error)
