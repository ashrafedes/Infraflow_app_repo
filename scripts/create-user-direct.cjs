const { Client } = require('pg')
const crypto = require('crypto')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function createUserDirectly() {
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
    // Generate a UUID for the user
    const userId = crypto.randomUUID()

    // Insert into auth.users with all required fields
    await client.query(`
      INSERT INTO auth.users (
        id, instance_id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, last_sign_in_at,
        is_sso_user, deleted_at
      ) VALUES (
        $1::uuid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'admin@infraflow.app',
        crypt('Test1234!', gen_salt('bf', 10)),
        now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('full_name', 'Test Admin'),
        now(),
        now(),
        NULL,
        false,
        NULL
      )
    `, [userId])
    console.log('Created auth user:', userId)

    // Create identity (without the generated email column)
    await client.query(`
      INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        $1::uuid,
        jsonb_build_object('sub', $1::text, 'email', 'admin@infraflow.app', 'email_verified', true),
        'email',
        now(),
        now(),
        now()
      )
    `, [userId])
    console.log('Created identity')

    // Create user_profiles entry
    const companyId = '4fbace07-dc70-4238-a727-e9a3883abf54'
    await client.query(`
      INSERT INTO user_profiles (id, company_id, full_name, email, role, is_active)
      VALUES ($1::uuid, $2::uuid, 'Test Admin', 'admin@infraflow.app', 'company_admin', true)
      ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id
    `, [userId, companyId])
    console.log('Created user_profiles entry')

    // Verify
    const { rows: user } = await client.query(`
      SELECT id, email, email_confirmed_at, is_sso_user, raw_app_meta_data
      FROM auth.users WHERE email = 'admin@infraflow.app'
    `)
    console.log('Verified user:', JSON.stringify(user[0], null, 2))

    const { rows: ident } = await client.query(`
      SELECT * FROM auth.identities WHERE user_id = $1
    `, [userId])
    console.log('Verified identity:', JSON.stringify(ident[0], null, 2))
  } finally {
    await client.end()
  }
}

createUserDirectly().catch(console.error)
