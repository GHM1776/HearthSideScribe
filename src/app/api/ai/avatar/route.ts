import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  try {
    const { userId } = await request.json();
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    const { data: user } = await supabase
      .from('users')
      .select('name, avatar_url')
      .eq('id', userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Skip if avatar already exists
    if (user.avatar_url && user.avatar_url.startsWith('data:image/')) {
      console.log(`[avatar] User ${user.name} already has an avatar, skipping`);
      return NextResponse.json({ skipped: true });
    }

    // Fetch taste profile for prompt context
    const { data: profile } = await supabase
      .from('taste_profiles')
      .select('profile_json')
      .eq('user_id', userId)
      .maybeSingle();

    const profileJson = profile?.profile_json as Record<string, unknown> | null;
    const summary = (profileJson?.summary as string) || 'An avid reader who loves great stories.';
    const topGenres = (profileJson?.top_genres as string[]) || [];
    const themesLoved = (profileJson?.themes_loved as string[]) || [];

    const isMale = user.name === 'Greg';
    const gender = isMale ? 'male' : 'female';
    const genderDesc = isMale
        ? 'a caucasian man with a strong jaw, light skin, and thoughtful eyes'
        : 'a caucasian woman with elegant features, light skin, and a perceptive gaze';

    // Map reading taste to visual character elements
    const genreVisuals: string[] = [];
    const genreStr = topGenres.join(', ').toLowerCase();

    if (genreStr.includes('sci-fi') || genreStr.includes('space') || genreStr.includes('military')) {
      genreVisuals.push('wearing futuristic military armor with subtle metallic accents', 'stars and distant planets visible in background');
    }
    if (genreStr.includes('fantasy') || genreStr.includes('adventure')) {
      genreVisuals.push('wearing an adventurer\'s cloak with ornate clasps', 'mystical runes glowing faintly in background');
    }
    if (genreStr.includes('classic') || genreStr.includes('literary')) {
      genreVisuals.push('wearing refined period clothing with rich fabrics', 'candlelit bookshelves in background');
    }
    if (genreStr.includes('thriller') || genreStr.includes('mystery')) {
      genreVisuals.push('wearing a dark coat with sharp collar', 'dramatic chiaroscuro lighting');
    }
    if (genreVisuals.length === 0) {
      genreVisuals.push('wearing elegant reading attire', 'surrounded by books and warm candlelight');
    }

    const prompt = `A stylized portrait illustration of ${genderDesc}, depicted as a ${gender} literary hero. ${genreVisuals.join('. ')}. 

Style: gothic fantasy portrait painting, rich dark background with deep navy and burgundy tones, warm golden lighting illuminating the face, tarot card or book plate illustration aesthetic, art nouveau influence, painterly brushwork. The portrait should feel like it hangs in a castle library by candlelight.

Mood: intelligent, determined, heroic. This person reads: ${topGenres.slice(0, 3).join(', ') || 'great literature'}.

Square composition, head and shoulders, facing slightly to the side. Rich warm color palette with gold, crimson, and deep jewel tones. NO text, NO words, NO letters anywhere in the image.`;

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      console.log('[avatar] No OPENAI_API_KEY — skipping');
      return NextResponse.json({ skipped: true, reason: 'No OpenAI API key' });
    }

    console.log(`[avatar] Generating DALL-E portrait for ${user.name}...`);

    // Call DALL-E 3
    const dalleResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        response_format: 'b64_json',
      }),
    });

    if (!dalleResponse.ok) {
      const errData = await dalleResponse.json().catch(() => ({}));
      console.error('[avatar] DALL-E error:', dalleResponse.status, errData);
      return NextResponse.json({ error: 'Image generation failed' }, { status: 500 });
    }

    const dalleData = await dalleResponse.json();
    const b64Image = dalleData.data?.[0]?.b64_json;

    if (!b64Image) {
      console.error('[avatar] No image data returned from DALL-E');
      return NextResponse.json({ error: 'No image generated' }, { status: 500 });
    }

    // Save as data URI
    const dataUri = `data:image/png;base64,${b64Image}`;

    const { error: updateError } = await supabase
      .from('users')
      .update({ avatar_url: dataUri })
      .eq('id', userId);

    if (updateError) {
      console.error('[avatar] Save failed:', updateError.message);
      return NextResponse.json({ error: 'Failed to save avatar' }, { status: 500 });
    }

    console.log(`[avatar] Portrait generated and saved for ${user.name}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[avatar] Unexpected error:', err);
    return NextResponse.json({ error: 'Avatar generation failed' }, { status: 500 });
  }
}