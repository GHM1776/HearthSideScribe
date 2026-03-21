import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendSms, canSendWeeklyCheckin, getPhoneForUser } from '@/lib/twilio';
import { WELCOME_SYSTEM_PROMPT, MONTHS } from '@/lib/constants';

// This route is called by Vercel Cron (or manually) once a week
// vercel.json: { "crons": [{ "path": "/api/cron/weekly-checkin", "schedule": "0 14 * * 3" }] }
// That's every Wednesday at 2pm UTC

async function callClaude(system: string, prompt: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'sk-ant-your-key-here') return null;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data.content?.[0]?.text || null;
}

export async function GET() {
  const supabase = createServerSupabaseClient();

  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // Get current month's pick
    const { data: pick } = await supabase
      .from('monthly_picks')
      .select('selected_book, status')
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();

    // Only send check-ins if there's an active book being read
    if (!pick?.selected_book || pick.status === 'completed') {
      console.log('[weekly-checkin] No active monthly book — skipping');
      return NextResponse.json({ skipped: true, reason: 'No active book' });
    }

    // Get the selected book details
    const { data: book } = await supabase
      .from('books')
      .select('title, author')
      .eq('id', pick.selected_book)
      .single();

    if (!book) {
      return NextResponse.json({ skipped: true, reason: 'Book not found' });
    }

    // Get both users
    const { data: users } = await supabase.from('users').select('id, name');
    if (!users || users.length < 2) {
      return NextResponse.json({ skipped: true, reason: 'Not enough users' });
    }

    // Check each user's reading status for this book
    const results: string[] = [];

    for (const user of users) {
      const phone = getPhoneForUser(user.name);
      if (!phone) {
        results.push(`${user.name}: no phone number`);
        continue;
      }

      // Rate limit check
      const canSend = await canSendWeeklyCheckin(user.id);
      if (!canSend) {
        results.push(`${user.name}: already sent this week`);
        continue;
      }

      // Check if this user has already finished the book
      const { data: userBook } = await supabase
        .from('user_books')
        .select('status, date_added')
        .eq('user_id', user.id)
        .eq('book_id', pick.selected_book)
        .maybeSingle();

      if (userBook?.status === 'read') {
        results.push(`${user.name}: already finished`);
        continue;
      }

      // Get partner's status for context
      const partner = users.find((u) => u.id !== user.id);
      let partnerStatus = 'still reading';
      if (partner) {
        const { data: partnerBook } = await supabase
          .from('user_books')
          .select('status')
          .eq('user_id', partner.id)
          .eq('book_id', pick.selected_book)
          .maybeSingle();
        if (partnerBook?.status === 'read') partnerStatus = 'already finished';
        else if (partnerBook?.status === 'reading') partnerStatus = 'currently reading';
        else partnerStatus = 'hasn\'t started yet';
      }

      // Days since the book was selected (rough proxy for reading time)
      const daysReading = userBook?.date_added
        ? Math.floor((Date.now() - new Date(userBook.date_added).getTime()) / (1000 * 60 * 60 * 24))
        : Math.floor((Date.now() - new Date(year, month - 1, 1).getTime()) / (1000 * 60 * 60 * 24));

      // Generate personalized message via Claude
      const prompt = `Generate a short, friendly SMS check-in for ${user.name} about their book club reading.

CURRENT BOOK: "${book.title}" by ${book.author}
DAYS SINCE STARTED: ${daysReading}
${user.name.toUpperCase()}'S STATUS: ${userBook?.status || 'not started'}
PARTNER (${partner?.name}): ${partnerStatus}
MONTH: ${MONTHS[month - 1]}

Rules:
- Max 160 characters (1 SMS segment)
- One owl pun allowed (subtle)
- Address ${user.name} by name
- If partner is ahead, add playful urgency
- If partner is behind, add encouragement
- Keep it warm and fun, not naggy
- NO links, NO emojis beyond 🦉 and 📚
- Sign off as "— Owliver"

Return ONLY the message text, nothing else.`;

      const smsSystem = `You write brief, charming SMS messages as Owliver the owl librarian. You're warm, witty, and make exactly one subtle owl pun. Keep messages under 160 characters.`;

      const aiMessage = await callClaude(smsSystem, prompt);
      const message = aiMessage || `${user.name}, how's "${book.title}" going? ${partner?.name} is ${partnerStatus}. The tower library awaits your thoughts! 🦉 — Owliver`;

      const sent = await sendSms({
        to: phone,
        message,
        triggerType: 'weekly_checkin',
        userId: user.id,
      });

      results.push(`${user.name}: ${sent ? 'sent' : 'failed'}`);
    }

    console.log('[weekly-checkin] Results:', results.join(', '));
    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error('[weekly-checkin] Error:', err);
    return NextResponse.json({ error: 'Check-in failed' }, { status: 500 });
  }
}