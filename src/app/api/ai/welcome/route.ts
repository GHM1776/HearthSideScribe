import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WELCOME_SYSTEM_PROMPT } from '@/lib/constants';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    const supabase = createServerSupabaseClient();

    const [{ data: user }, { data: userBooks }, { data: welcomeLogs }, { data: currentPick }] = await Promise.all([
      supabase.from('users').select('*').eq('id', userId).single(),
      supabase.from('user_books').select('*, book:books(*)').eq('user_id', userId).order('date_added', { ascending: false }).limit(20),
      supabase.from('welcome_log').select('message').eq('user_id', userId).order('generated_at', { ascending: false }).limit(5),
      supabase.from('monthly_picks').select('*, selected_book_data:books!monthly_picks_selected_book_fkey(*)').order('year', { ascending: false }).order('month', { ascending: false }).limit(1).single(),
    ]);

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const readBooks = userBooks?.filter((ub) => ub.status === 'read') || [];
    const currentlyReading = userBooks?.find((ub) => ub.status === 'reading');
    const recentRead = readBooks[0];
    const totalRead = readBooks.length;
    const recentMessages = welcomeLogs?.map((l) => l.message) || [];

    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

    const contextPrompt = `Generate a welcome message for ${user.name}.

Context:
- Time of day: ${timeOfDay}
- Total books read: ${totalRead}
- Currently reading: ${currentlyReading ? `"${currentlyReading.book?.title}" by ${currentlyReading.book?.author}` : 'Nothing at the moment'}
- Most recently finished: ${recentRead ? `"${recentRead.book?.title}" \u2014 rated ${recentRead.rating}/5${recentRead.hot_take ? ` ("${recentRead.hot_take}")` : ''}` : 'No books yet'}
- Current monthly pick: ${currentPick?.selected_book_data ? `"${currentPick.selected_book_data.title}"` : 'None selected yet'}
- Want to read queue: ${userBooks?.filter((ub) => ub.status === 'want_to_read').length || 0} books

DO NOT repeat any of these recent messages:
${recentMessages.map((m) => `- "${m}"`).join('\n')}

Remember: exactly ONE owl pun, 1-2 sentences max, warm and personal.`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    let message: string;

    if (apiKey && apiKey !== 'sk-ant-your-key-here') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 150,
          system: WELCOME_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: contextPrompt }],
        }),
      });

      if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
      const data = await response.json();
      message = data.content?.[0]?.text || `Welcome back, ${user.name}! The tower library awaits.`;
    } else {
      const fallbacks = [
        `Welcome back, ${user.name}! Owl be here whenever you need a good read.`,
        `${user.name}! The rain's coming down \u2014 perfect weather to curl up with a book.`,
        `Look hoo's here! Welcome back, ${user.name}. The castle library missed you.`,
        `Good ${timeOfDay}, ${user.name}! I've been sorting the shelves while you were away.`,
      ];
      if (recentRead?.book && recentRead.rating && recentRead.rating >= 4) {
        fallbacks.push(`Welcome back, ${user.name}! You gave "${recentRead.book.title}" a ${recentRead.rating}/5 \u2014 owl say, exquisite taste.`);
      }
      if (currentlyReading?.book) {
        fallbacks.push(`${user.name}! Still working through "${currentlyReading.book.title}"? Owl be patient \u2014 take your time.`);
      }
      message = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

    await supabase.from('welcome_log').insert({ user_id: userId, message });
    return NextResponse.json({ message });
  } catch (error) {
    console.error('Welcome message error:', error);
    return NextResponse.json({ message: 'Welcome back! The tower library awaits.' }, { status: 200 });
  }
}