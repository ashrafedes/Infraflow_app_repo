const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function fixFunction() {
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
    // Fix the generate_movement_number function to use last_number instead of last_value
    await client.query(`
      CREATE OR REPLACE FUNCTION public.generate_movement_number(p_company_id UUID)
      RETURNS TEXT
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, auth
      AS $$
      DECLARE
          v_next_val BIGINT;
          v_number   TEXT;
      BEGIN
          INSERT INTO movement_number_counter (company_id, last_number)
          VALUES (p_company_id, 0)
          ON CONFLICT (company_id) DO UPDATE
              SET last_number = movement_number_counter.last_number + 1
          RETURNING last_number INTO v_next_val;

          v_number := 'MOV-' || lpad(v_next_val::text, 6, '0');
          RETURN v_number;
      END;
      $$;
    `)
    console.log('Fixed generate_movement_number function')

    // Verify
    const { rows } = await client.query(`
      SELECT prosrc FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'generate_movement_number'
    `)
    console.log('Function uses last_number:', rows[0]?.prosrc.includes('last_number'))
    console.log('Function uses last_value:', rows[0]?.prosrc.includes('last_value'))
  } finally {
    await client.end()
  }
}

fixFunction().catch(console.error)
