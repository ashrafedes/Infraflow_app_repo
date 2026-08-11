const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function fixTestUser() {
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
    // Check the user
    const { rows } = await client.query(`
      SELECT id, email, aud, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data
      FROM auth.users
      WHERE email = 'admin@infraflow.app'
    `)
    console.log('Current user:', JSON.stringify(rows[0], null, 2))

    // Check if identity exists
    const { rows: ident } = await client.query(`
      SELECT * FROM auth.identities WHERE user_id = $1
    `, [rows[0]?.id])
    console.log('Identities:', JSON.stringify(ident, null, 2))

    // Fix: add raw_app_meta_data and create identity
    if (rows[0]) {
      await client.query(`
        UPDATE auth.users
        SET raw_app_meta_data = jsonb_build_object('provider','email','providers',jsonb_build_array('email'))
        WHERE id = $1
      `, [rows[0].id])

      // Insert identity if missing
      if (ident.length === 0) {
        await client.query(`
          INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
          VALUES (
            gen_random_uuid(),
            $1::uuid,
            jsonb_build_object('sub', $1::text, 'email', 'admin@infraflow.app'),
            'email',
            now(),
            now(),
            now()
          )
        `, [rows[0].id])
        console.log('Created identity')
      }

      console.log('Fixed user')
    }
  } catch (err) {
    console.error('Error:', err.message)
    if (err.detail) console.error('Detail:', err.detail)
  } finally {
    await client.end()
  }
}

fixTestUser()
