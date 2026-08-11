const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function resetPassword() {
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
    
    // Reset password for ashrafede@gmail.com
    // Supabase stores passwords as bcrypt in encrypted_password column
    // We need to use crypt() function which requires pgcrypto
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    
    const newPass = 'Wali2061ero$'
    await client.query(`
      UPDATE auth.users
      SET encrypted_password = crypt($1, gen_salt('bf')),
          email_confirmed_at = now(),
          raw_app_meta_data = jsonb_build_object('provider','email','providers',jsonb_build_array('email'))
      WHERE email = 'ashrafede@gmail.com'
      RETURNING id
    `, [newPass])

    // Ensure identity exists
    const { rows: users } = await client.query(`
      SELECT id FROM auth.users WHERE email = 'ashrafede@gmail.com'
    `)
    if (users.length > 0) {
      const { rows: ident } = await client.query(`
        SELECT * FROM auth.identities WHERE user_id = $1
      `, [users[0].id])
      if (ident.length === 0) {
        await client.query(`
          INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
          VALUES (gen_random_uuid(), $1::uuid, jsonb_build_object('sub', $1::text, 'email', 'ashrafede@gmail.com'), 'email', now(), now(), now())
        `, [users[0].id])
        console.log('Created identity')
      } else {
        console.log('Identity already exists')
      }
    }

    console.log('Password reset to: ' + newPass)
    
    // Verify
    const { rows } = await client.query(`
      SELECT email, encrypted_password FROM auth.users WHERE email = 'ashrafede@gmail.com'
    `)
    console.log('Updated:', rows[0]?.email, '- hash starts with:', rows[0]?.encrypted_password?.substring(0, 10))
    
  } catch (err) {
    console.error('Error:', err.message)
    if (err.detail) console.error('Detail:', err.detail)
  } finally {
    await client.end()
  }
}

resetPassword()
