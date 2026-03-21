import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendSms, wasRecentlySent, getPhoneForUser } from '@/lib/twilio';

// POST — notify both users that monthly picks are ready for voting
export async function POST() {
  const supabase = createServerSupabaseClient();

  try {
    const { data: users } = await supabase.from('users').select('id, name');
    if (!users || users.length === 0) {
      return NextResponse.json({ error: 'No users found' }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const results: string[] = [];

    for (const user of users) {
      const phone = getPhoneForUser(user.name);
      if (!phone) {
        results.push(`${user.name}: no phone`);
        continue;
      }

      // Don't double-send
      const alreadySent = await wasRecentlySent(user.id, 'picks_ready', 12);
      if (alreadySent) {
        results.push(`${user.name}: already notified`);
        continue;
      }

      const message = `The owl has spoken! 🦉📚 This month's book picks are ready and waiting for your vote. Head to the tower library to see what Owliver chose: ${siteUrl}/monthly-picks — Owliver`;

      const sent = await sendSms({
        to: phone,
        message,
        triggerType: 'picks_ready',
        userId: user.id,
      });

      results.push(`${user.name}: ${sent ? 'sent' : 'failed'}`);
    }

    console.log('[sms] Picks-ready notifications:', results.join(', '));
    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error('[sms] Picks-ready error:', err);
    return NextResponse.json({ error: 'Notification failed' }, { status: 500 });
  }
}