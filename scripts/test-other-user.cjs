const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function testOtherUser() {
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
    // Update the other user's password
    await client.query(`
      UPDATE auth.users SET encrypted_password = crypt('Test1234!', gen_salt('bf', 10))
      WHERE email = 'ashrafede@gmail.com'
    `)
    console.log('Updated ashrafede@gmail.com password')

    // Make sure their email is confirmed
    await client.query(`
      UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now())
      WHERE email = 'ashrafede@gmail.com'
    `)

    // Check if they have an identity
    const { rows: ident } = await client.query(`
      SELECT * FROM auth.identities
      WHERE user_id = (SELECT id FROM auth.users WHERE email = 'ashrafede@gmail.com')
    `)
    console.log('Has identity:', ident.length > 0)

    if (ident.length === 0) {
      // Create identity
      const { rows: user } = await client.query(`
        SELECT id FROM auth.users WHERE email = 'ashrafede@gmail.com'
      `)
      if (user[0]) {
        await client.query(`
          INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
          VALUES (
            gen_random_uuid(),
            $1::uuid,
            jsonb_build_object('sub', $1::text, 'email', 'ashrafede@gmail.com', 'email_verified', true),
            'email',
            now(),
            now(),
            now()
          )
        `, [user[0].id])
        console.log('Created identity for ashrafede@gmail.com')
      }
    }

    // Check their profile
    const { rows: profile } = await client.query(`
      SELECT * FROM user_profiles WHERE email = 'ashrafede@gmail.com'
    `)
    console.log('Profile:', JSON.stringify(profile[0], null, 2))
  } finally {
    await client.end()
  }
}

testOtherUser().catch(console.error)
