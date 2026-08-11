import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (_req: Request) => {
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Find all expired trials
  const { data: expiredSubs, error: fetchErr } = await adminClient
    .from('subscriptions')
    .select('id, company_id, plan_id, trial_ends_at')
    .eq('status', 'trial')
    .lt('trial_ends_at', new Date().toISOString())

  if (fetchErr) {
    return json({ error: `Failed to fetch expired trials: ${fetchErr.message}` }, 500)
  }

  if (!expiredSubs || expiredSubs.length === 0) {
    return json({ message: 'No expired trials found', expired_count: 0 }, 200)
  }

  // Get the basic plan ID
  const { data: basicPlan, error: planErr } = await adminClient
    .from('subscription_plans')
    .select('id')
    .eq('plan_code', 'basic')
    .single()

  if (planErr || !basicPlan) {
    return json({ error: 'Basic plan not found' }, 500)
  }

  let transitioned = 0
  const errors: string[] = []

  for (const sub of expiredSubs) {
    // Transition to Basic plan
    const { error: updateErr } = await adminClient
      .from('subscriptions')
      .update({
        status: 'active',
        plan_id: basicPlan.id,
        current_period_start: sub.trial_ends_at,
        trial_started_at: null,
        trial_ends_at: null,
      })
      .eq('id', sub.id)

    if (updateErr) {
      errors.push(`Company ${sub.company_id}: ${updateErr.message}`)
      continue
    }

    // Audit log
    await adminClient
      .from('subscription_audit_log')
      .insert({
        company_id: sub.company_id,
        action: 'trial_expired',
        old_value: { status: 'trial', plan_code: 'free_trial', trial_ends_at: sub.trial_ends_at },
        new_value: { status: 'active', plan_code: 'basic' },
        performed_by: null, // system
      })

    transitioned++
  }

  return json({
    message: `Transitioned ${transitioned} expired trials to Basic`,
    expired_count: expiredSubs.length,
    transitioned,
    errors: errors.length > 0 ? errors : undefined,
  }, 200)
})
