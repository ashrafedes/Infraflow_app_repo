import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const VALID_ROLES = ['company_admin', 'warehouse_man', 'inspector', 'project_control', 'project_manager']

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function generateSecurePassword(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  const values = new Uint8Array(length)
  crypto.getRandomValues(values)
  return Array.from(values).map((v) => chars[v % chars.length]).join('')
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const { full_name, email, role, scopes } = await req.json()

    // Validate input
    if (!full_name || !email || !role) {
      return json({ error: 'Missing required fields: full_name, email, role' }, 400)
    }
    if (!VALID_ROLES.includes(role)) {
      return json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, 400)
    }

    // Get caller's JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Unauthorized' }, 401)
    }

    // Create client with caller's JWT
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    // Verify caller identity
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    // Load caller's profile from DB — NEVER trust company_id from frontend
    const { data: callerProfile, error: profileErr } = await userClient
      .from('user_profiles')
      .select('company_id, role, is_active')
      .eq('id', user.id)
      .single()

    if (profileErr || !callerProfile) {
      return json({ error: 'Profile not found' }, 403)
    }
    if (!callerProfile.is_active) {
      return json({ error: 'Your account is inactive' }, 403)
    }
    if (callerProfile.role !== 'company_admin') {
      return json({ error: 'Only company admins can create users' }, 403)
    }

    const company_id = callerProfile.company_id

    // Pre-check user limit (DB trigger is authoritative)
    const { data: maxUsers } = await userClient.rpc('get_max_users')
    const { data: activeCount } = await userClient.rpc('get_active_user_count')

    if (maxUsers !== null && activeCount !== null && activeCount >= maxUsers) {
      return json({
        error: `User limit reached: ${activeCount} active users out of ${maxUsers} allowed. Deactivate a user or upgrade your plan.`,
        max_users: maxUsers,
        active_count: activeCount,
      }, 403)
    }

    // Create admin client with service role
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Create Auth user with random password
    const tempPassword = generateSecurePassword(32)

    const { data: authUser, error: createAuthErr } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name },
    })

    if (createAuthErr) {
      return json({ error: `Failed to create auth user: ${createAuthErr.message}` }, 500)
    }

    const newUserId = authUser.user.id

    // Insert user_profiles row (trigger enforces user limit)
    const { error: insertProfileErr } = await adminClient
      .from('user_profiles')
      .insert({
        id: newUserId,
        company_id,
        full_name,
        email,
        role,
        is_active: true,
      })

    if (insertProfileErr) {
      // Rollback: delete orphan auth user
      await adminClient.auth.admin.deleteUser(newUserId)
      return json({
        error: `Failed to create user profile: ${insertProfileErr.message}`,
      }, 500)
    }

    // Insert scope assignments if provided
    if (scopes && Array.isArray(scopes) && scopes.length > 0) {
      const scopeRows = scopes.map((s: Record<string, string | null>) => ({
        user_id: newUserId,
        company_id,
        project_id: s.project_id || null,
        work_location_id: s.work_location_id || null,
        warehouse_id: s.warehouse_id || null,
        work_order_id: s.work_order_id || null,
      }))

      const { error: scopeErr } = await adminClient
        .from('user_scope_assignments')
        .insert(scopeRows)

      if (scopeErr) {
        // Rollback: delete profile + auth user
        await adminClient.from('user_profiles').delete().eq('id', newUserId)
        await adminClient.auth.admin.deleteUser(newUserId)
        return json({
          error: `Failed to create scope assignments: ${scopeErr.message}`,
        }, 500)
      }
    }

    // Send password reset email so user can set their own password
    await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email,
    })

    return json({
      success: true,
      user_id: newUserId,
      message: 'User created successfully. A password setup email has been sent.',
    }, 200)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return json({ error: msg }, 500)
  }
})
