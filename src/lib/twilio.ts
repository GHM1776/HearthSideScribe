import { createServerSupabaseClient } from '@/lib/supabase/server';

type TriggerType = 'invite' | 'picks_ready' | 'weekly_checkin' | 'partner_finished' | 'both_done';

interface SendSmsOptions {
  to: string;
  message: string;
  triggerType: TriggerType;
  userId?: string;
}

// Check if a message of this type was already sent recently
export async function wasRecentlySent(
  userId: string,
  triggerType: TriggerType,
  withinHours = 24
): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from('sms_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('trigger_type', triggerType)
    .gt('sent_at', cutoff);

  return (count || 0) > 0;
}

// Check weekly check-in rate limit (max 1 per 6 days to be safe)
export async function canSendWeeklyCheckin(userId: string): Promise<boolean> {
  return !(await wasRecentlySent(userId, 'weekly_checkin', 144)); // 6 days in hours
}

// Send SMS via Twilio and log it
export async function sendSms({ to, message, triggerType, userId }: SendSmsOptions): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.error('[twilio] Missing Twilio credentials in env');
    return false;
  }

  try {
    // Send via Twilio REST API (no SDK needed)
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const body = new URLSearchParams({
      To: to,
      From: fromNumber,
      Body: message,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[twilio] Send failed:', errorData.message || response.status);
      return false;
    }

    const result = await response.json();
    console.log(`[twilio] SMS sent to ${to} — SID: ${result.sid}`);

    // Log to database
    const supabase = createServerSupabaseClient();
    await supabase.from('sms_log').insert({
      user_id: userId || null,
      phone: to,
      message,
      trigger_type: triggerType,
    });

    return true;
  } catch (err) {
    console.error('[twilio] Unexpected error:', err);
    return false;
  }
}

// Get phone number for a user by name from env
export function getPhoneForUser(name: string): string | null {
  if (name === 'Greg') return process.env.GREG_PHONE || null;
  if (name === 'Mati') return process.env.MATI_PHONE || null;
  return null;
}

// Get the partner's info
export async function getPartnerInfo(userId: string): Promise<{ id: string; name: string; phone: string | null } | null> {
  const supabase = createServerSupabaseClient();

  const { data: currentUser } = await supabase
    .from('users')
    .select('name')
    .eq('id', userId)
    .single();

  if (!currentUser) return null;

  const partnerName = currentUser.name === 'Greg' ? 'Mati' : 'Greg';

  const { data: partner } = await supabase
    .from('users')
    .select('id, name')
    .eq('name', partnerName)
    .single();

  if (!partner) return null;

  return {
    id: partner.id,
    name: partner.name,
    phone: getPhoneForUser(partner.name),
  };
}