const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function check() {
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
    
    // Check if FORCE RLS is on
    const { rows } = await client.query(`
      SELECT relname, relrowsecurity, relforcerowsecurity 
      FROM pg_class 
      WHERE relname = 'user_profiles'
    `)
    console.log('user_profiles RLS settings:', rows[0])

    // Check existing profiles
    const { rows: profiles } = await client.query('SELECT id, email, company_id, role FROM user_profiles')
    console.log('Existing profiles:', profiles)

    // Check if the old user exists in auth.users
    const { rows: users } = await client.query('SELECT id, email FROM auth.users')
    console.log('Auth users:', users)

    // Check subscription tables
    const subs = await client.query('SELECT count(*) as cnt FROM subscriptions')
    console.log('Subscriptions:', subs.rows[0].cnt)

    const plans = await client.query('SELECT plan_code, plan_name, default_max_users, trial_duration_days FROM subscription_plans ORDER BY sort_order')
    console.log('Plans:', JSON.stringify(plans.rows, null, 2))

    const features = await client.query('SELECT count(*) as cnt FROM features')
    console.log('Features:', features.rows[0].cnt)

    const pf = await client.query('SELECT count(*) as cnt FROM plan_features')
    console.log('Plan features:', pf.rows[0].cnt)

    // Check if handle_new_user trigger exists
    const trig = await client.query(`
      SELECT tgname FROM pg_trigger
      WHERE tgname = 'on_auth_user_created'
    `)
    console.log('Auth trigger exists:', trig.rows.length > 0)

    // Check enforce_user_limit trigger
    const eul = await client.query(`
      SELECT tgname FROM pg_trigger WHERE tgname = 'trg_enforce_user_limit'
    `)
    console.log('enforce_user_limit trigger exists:', eul.rows.length > 0)

    // Check setup_company function
    const sc = await client.query(`
      SELECT proname FROM pg_proc WHERE proname = 'setup_company'
    `)
    console.log('setup_company function exists:', sc.rows.length > 0)

    // Manually create profile for existing user if missing
    if (users.length > 0) {
      for (const u of users) {
        const { rows: existing } = await client.query('SELECT id FROM user_profiles WHERE id = $1', [u.id])
        if (existing.length === 0) {
          await client.query(`
            INSERT INTO user_profiles (id, email, full_name, company_id, role)
            VALUES ($1, $2, $3, '00000000-0000-0000-0000-000000000000'::uuid, 'company_admin')
            ON CONFLICT (id) DO NOTHING
          `, [u.id, u.email, u.email])
          console.log(`Created profile for existing user: ${u.email}`)
        }
      }
    }
  } catch (err) {
    console.error('Error:', err.message)
    if (err.detail) console.error('Detail:', err.detail)
  } finally {
    await client.end()
  }
}

check()
