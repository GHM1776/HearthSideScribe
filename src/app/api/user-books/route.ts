import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendSms, wasRecentlySent, getPartnerInfo, getPhoneForUser } from '@/lib/twilio';

const READ_STATUSES = new Set(['read', 'would_reread']);
const REGEN_THRESHOLD = 3;

// Only fire a profile refresh if enough new books have accumulated
async function maybeRefreshTasteProfile(userId: string, baseUrl: string) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: profile } = await supabase
      .from('taste_profiles')
      .select('generated_at')
      .eq('user_id', userId)
      .maybeSingle();

    const lastGenerated = profile?.generated_at || '1970-01-01T00:00:00Z';

    const { count } = await supabase
      .from('user_books')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['read', 'would_reread'])
      .gt('date_added', lastGenerated);

    if ((count || 0) >= REGEN_THRESHOLD) {
      console.log(`[user-books] ${count} new books since last profile — triggering regen`);
      fetch(`${baseUrl}/api/ai/taste-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      }).catch((err) => {
        console.error('[user-books] Background profile refresh failed:', err);
      });
    }
  } catch (err) {
    console.error('[user-books] Threshold check failed:', err);
  }
}

// Check if a book is the current month's selected pick, and handle SMS triggers
async function checkMonthlyBookCompletion(userId: string, bookId: string) {
  try {
    const supabase = createServerSupabaseClient();
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // Is this the current monthly pick?
    const { data: pick } = await supabase
      .from('monthly_picks')
      .select('selected_book, status')
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();

    if (!pick || pick.selected_book !== bookId || pick.status === 'completed') return;

    // Get current user's name
    const { data: currentUser } = await supabase
      .from('users')
      .select('name')
      .eq('id', userId)
      .single();
    if (!currentUser) return;

    // Get book title for the message
    const { data: book } = await supabase
      .from('books')
      .select('title')
      .eq('id', bookId)
      .single();
    if (!book) return;

    // Get partner info
    const partner = await getPartnerInfo(userId);
    if (!partner || !partner.phone) return;

    // Check if partner has also finished
    const { data: partnerBook } = await supabase
      .from('user_books')
      .select('status')
      .eq('user_id', partner.id)
      .eq('book_id', bookId)
      .maybeSingle();

    const partnerFinished = partnerBook?.status === 'read';

    if (partnerFinished) {
      // BOTH DONE — text both, mark month as completed
      console.log('[user-books] Both users finished the monthly pick!');

      await supabase
        .from('monthly_picks')
        .update({ status: 'completed' })
        .eq('month', month)
        .eq('year', year);

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      const bothDoneMsg = `You've both finished "${book.title}"! 🦉📚 Head to the tower to rate it, share your hot takes, and let Owliver start picking next month's reads: ${siteUrl}/monthly-picks — Owliver`;

      // Text both users
      const alreadySentPartner = await wasRecentlySent(partner.id, 'both_done', 24);
      if (!alreadySentPartner) {
        await sendSms({ to: partner.phone, message: bothDoneMsg, triggerType: 'both_done', userId: partner.id });
      }

      const currentUserPhone = getPhoneForUser(currentUser.name);
      if (currentUserPhone) {
        const alreadySentCurrent = await wasRecentlySent(userId, 'both_done', 24);
        if (!alreadySentCurrent) {
          await sendSms({ to: currentUserPhone, message: bothDoneMsg, triggerType: 'both_done', userId });
        }
      }
    } else {
      // PARTNER NOT DONE — text partner that this user finished
      const alreadySent = await wasRecentlySent(partner.id, 'partner_finished', 24);
      if (!alreadySent) {
        const msg = `Heads up — ${currentUser.name} just finished "${book.title}"! They're waiting for your hot take. No pressure... but also, hurry up. 🦉 — Owliver`;
        await sendSms({ to: partner.phone, message: msg, triggerType: 'partner_finished', userId: partner.id });
        console.log(`[user-books] Texted ${partner.name} that ${currentUser.name} finished`);
      }
    }
  } catch (err) {
    console.error('[user-books] Monthly completion check failed:', err);
  }
}

// GET — get user's books with book details
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const userId = request.nextUrl.searchParams.get('userId');
  const status = request.nextUrl.searchParams.get('status');

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  let query = supabase
    .from('user_books')
    .select('*, book:books(*)')
    .eq('user_id', userId)
    .order('date_added', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ userBooks: data });
}

// POST — add a book to user's shelf (or update if exists)
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const body = await request.json();
  const { user_id, book_id, status, rating, hot_take } = body;

  if (!user_id || !book_id || !status) {
    return NextResponse.json(
      { error: 'user_id, book_id, and status are required' },
      { status: 400 }
    );
  }

  const { data: existing } = await supabase
    .from('user_books')
    .select('id')
    .eq('user_id', user_id)
    .eq('book_id', book_id)
    .maybeSingle();

  if (existing) {
    const updateData: Record<string, unknown> = { status };
    if (rating !== undefined) updateData.rating = rating;
    if (hot_take !== undefined) updateData.hot_take = hot_take;
    if (status === 'read' && !body.date_finished) {
      updateData.date_finished = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('user_books')
      .update(updateData)
      .eq('id', existing.id)
      .select('*, book:books(*)')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (READ_STATUSES.has(status)) {
      maybeRefreshTasteProfile(user_id, request.nextUrl.origin);
    }

    // Check if this completes the monthly pick
    if (status === 'read') {
      checkMonthlyBookCompletion(user_id, book_id);
    }

    return NextResponse.json({ userBook: data, updated: true });
  }

  const insertData: Record<string, unknown> = {
    user_id,
    book_id,
    status,
    date_added: new Date().toISOString(),
  };
  if (rating) insertData.rating = rating;
  if (hot_take) insertData.hot_take = hot_take;
  if (status === 'read') insertData.date_finished = new Date().toISOString();

  const { data, error } = await supabase
    .from('user_books')
    .insert(insertData)
    .select('*, book:books(*)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (READ_STATUSES.has(status)) {
    maybeRefreshTasteProfile(user_id, request.nextUrl.origin);
  }

  // Check if this completes the monthly pick
  if (status === 'read') {
    checkMonthlyBookCompletion(user_id, book_id);
  }

  return NextResponse.json({ userBook: data, updated: false }, { status: 201 });
}

// PATCH — update rating, hot_take, or status
export async function PATCH(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  if (updates.status === 'read' && !updates.date_finished) {
    updates.date_finished = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('user_books')
    .update(updates)
    .eq('id', id)
    .select('*, book:books(*)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (updates.status && READ_STATUSES.has(updates.status) && data?.user_id) {
    maybeRefreshTasteProfile(data.user_id, request.nextUrl.origin);

    // Check if this completes the monthly pick
    if (updates.status === 'read' && data?.book_id) {
      checkMonthlyBookCompletion(data.user_id, data.book_id);
    }
  }

  return NextResponse.json({ userBook: data });
}

// DELETE — remove a book from user's shelf
export async function DELETE(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const id = request.nextUrl.searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await supabase.from('user_books').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}