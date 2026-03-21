import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendSms, wasRecentlySent, getPhoneForUser } from '@/lib/twilio';

// POST — Send Mati her invite text from Owliver
export async function POST() {
  const supabase = createServerSupabaseClient();

  try {
    // Check if Mati has already onboarded
    const { data: mati } = await supabase
      .from('users')
      .select('id')
      .eq('name', 'Mati')
      .maybeSingle();

    if (mati) {
      // Check if she has a taste profile (meaning she completed onboarding)
      const { data: profile } = await supabase
        .from('taste_profiles')
        .select('id')
        .eq('user_id', mati.id)
        .maybeSingle();

      if (profile) {
        return NextResponse.json({ error: 'Mati has already onboarded' }, { status: 400 });
      }
    }

    // Check if we already sent an invite recently (within 24h)
    if (mati) {
      const alreadySent = await wasRecentlySent(mati.id, 'invite', 24);
      if (alreadySent) {
        return NextResponse.json({ error: 'Invite already sent recently' }, { status: 400 });
      }
    }

    const matiPhone = getPhoneForUser('Mati');
    if (!matiPhone) {
      return NextResponse.json({ error: 'MATI_PHONE not set in env' }, { status: 500 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    const message = `Hoo's ready for a reading adventure? 🦉📚\n\nGreg has set up a private book club just for the two of you — complete with an AI owl librarian named Owliver who'll learn your tastes and pick books you'll both love.\n\nTap here to join the tower library:\n${siteUrl}\n\n— Owliver, Head Librarian\nHearthsideScribe Book Club`;

    const sent = await sendSms({
      to: matiPhone,
      message,
      triggerType: 'invite',
      userId: mati?.id,
    });

    if (!sent) {
      return NextResponse.json({ error: 'Failed to send invite' }, { status: 500 });
    }

    console.log('[sms] Invite sent to Mati');
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[sms] Invite error:', err);
    return NextResponse.json({ error: 'Invite failed' }, { status: 500 });
  }
}