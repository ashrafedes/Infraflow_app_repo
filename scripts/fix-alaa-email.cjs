const { Client } = require('pg')

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
  
  // Confirm email and reset password for alaa@nahj.com
  const { rows } = await client.query(`
    UPDATE auth.users
    SET email_confirmed_at = now(),
        confirmation_sent_at = now(),
        encrypted_password = crypt('123456789', gen_salt('bf'))
    WHERE email = 'alaa@nahj.com'
    RETURNING id, email, email_confirmed_at
  `)
  console.log('Updated user:', JSON.stringify(rows[0], null, 2))
  
  await client.end()
}

main().catch(console.error)
