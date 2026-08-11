const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function fixInstanceConfig() {
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
    // Update the instance with a proper config
    const config = JSON.stringify({
      "SITE_URL": "http://localhost:5175",
      "API_MAX_DURATION": 600,
      "PASSWORD_MIN_LENGTH": 6,
      "JWT_EXP": 3600,
      "EXTERNAL_EMAIL_ENABLED": true,
      "MAILER_AUTOCONFIRM": true,
      "DISABLE_SIGNUP": false,
      "RATE_LIMIT_HEADER": "X-RateLimit-Remaining",
      "GOTRUE_ADMIN_EMAIL": "",
      "GOTRUE_ADMIN_PASSWORD": "",
      "JWT_SECRET": "",
      "DATABASE_URL": ""
    })

    await client.query(`
      UPDATE auth.instances
      SET raw_base_config = $1, updated_at = now()
      WHERE id = '00000000-0000-0000-0000-000000000000'
    `, [config])
    console.log('Updated instance config')

    // Also check refresh_tokens table structure
    const { rows: cols } = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'refresh_tokens'
      ORDER BY ordinal_position
    `)
    console.log('\nrefresh_tokens columns:')
    cols.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`))

    // Check if there's a user_profiles table FK that might be causing issues
    const { rows: fks } = await client.query(`
      SELECT conname, conrelid::regclass as table, confrelid::regclass as ref_table
      FROM pg_constraint
      WHERE contype = 'f'
      AND (conrelid = 'auth.users'::regclass OR confrelid = 'auth.users'::regclass)
    `)
    console.log('\nFKs involving auth.users:')
    fks.forEach(f => console.log(`  ${f.conname}: ${f.table} -> ${f.ref_table}`))

    // Check if the sessions table has the right structure
    const { rows: sessionCols } = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'sessions'
      ORDER BY ordinal_position
    `)
    console.log('\nsessions columns:')
    sessionCols.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`))

    // Try inserting a test session to see if it works
    const { rows: user } = await client.query(`
      SELECT id FROM auth.users WHERE email = 'admin@infraflow.app'
    `)

    if (user[0]) {
      const { rows: session } = await client.query(`
        INSERT INTO auth.sessions (id, user_id, created_at, updated_at, factor_hash)
        VALUES (gen_random_uuid(), $1::uuid, now(), now(), NULL)
        RETURNING id
      `, [user[0].id]).catch(e => {
        console.log('\nSession insert error:', e.message)
        return { rows: [] }
      })
      if (session.length > 0) {
        console.log('\nTest session created:', session[0].id)
        // Clean up
        await client.query(`DELETE FROM auth.sessions WHERE id = $1`, [session[0].id])
      }
    }
  } finally {
    await client.end()
  }
}

fixInstanceConfig().catch(console.error)
