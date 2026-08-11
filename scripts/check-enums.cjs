const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function checkEnumsAndTypes() {
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
    // Check the aal enum type
    const { rows: enums } = await client.query(`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname IN ('aal_level', 'aal', 'factor_status', 'factor_type', 'mfa_amr_method')
      ORDER BY t.typname, e.enumsortorder
    `)
    console.log('Auth enum types:')
    enums.forEach(e => console.log(`  ${e.typname}: ${e.enumlabel}`))

    // Check all auth schema types
    const { rows: types } = await client.query(`
      SELECT t.typname, t.typtype
      FROM pg_type t
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = 'auth'
      AND t.typtype = 'e'
      ORDER BY t.typname
    `)
    console.log('\nAll auth enum types:')
    types.forEach(t => console.log(`  ${t.typname}`))

    // Try to query auth.users as GoTrue would
    console.log('\n--- Simulating GoTrue login query ---')
    const { rows: user } = await client.query(`
      SELECT
        u.id, u.aud, u.role, u.email,
        u.encrypted_password, u.email_confirmed_at,
        u.banned_until, u.deleted_at,
        u.last_sign_in_at, u.raw_app_meta_data, u.raw_user_meta_data,
        u.is_sso_user, u.phone, u.phone_confirmed_at,
        u.confirmation_token, u.email_change_token_new,
        u.email_change, u.recovery_token,
        i.identity_data,
        i.provider, i.provider_id
      FROM auth.users u
      LEFT JOIN auth.identities i ON i.user_id = u.id
      WHERE u.email = 'admin@infraflow.app'
    `)
    console.log('Login query succeeded, user found:', !!user[0])

    // Try to create a session as GoTrue would
    console.log('\n--- Simulating session creation ---')
    try {
      const { rows: session } = await client.query(`
        INSERT INTO auth.sessions (id, user_id, created_at, updated_at, aal)
        VALUES (gen_random_uuid(), $1::uuid, now(), now(), 'aal1')
        RETURNING id
      `, [user[0].id])
      console.log('Session created:', session[0].id)
      await client.query(`DELETE FROM auth.sessions WHERE id = $1`, [session[0].id])
    } catch (e) {
      console.log('Session creation error:', e.message)
    }

    // Try to create a refresh token as GoTrue would
    console.log('\n--- Simulating refresh token creation ---')
    try {
      const { rows: token } = await client.query(`
        INSERT INTO auth.refresh_tokens (instance_id, token, user_id, revoked, created_at, updated_at)
        VALUES ('00000000-0000-0000-0000-000000000000', 'test-token', $1, false, now(), now())
        RETURNING id
      `, [user[0].id])
      console.log('Refresh token created:', token[0].id)
      await client.query(`DELETE FROM auth.refresh_tokens WHERE id = $1`, [token[0].id])
    } catch (e) {
      console.log('Refresh token creation error:', e.message)
    }
  } finally {
    await client.end()
  }
}

checkEnumsAndTypes().catch(console.error)
