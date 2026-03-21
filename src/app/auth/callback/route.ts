import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
            catch { /* middleware context */ }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (authUser) {
        const { data: existingUser } = await supabase.from('users').select('id').eq('auth_id', authUser.id).single();

        if (!existingUser) {
          const gregEmail = process.env.AUTHORIZED_EMAIL_GREG?.toLowerCase();
          const matiEmail = process.env.AUTHORIZED_EMAIL_MATI?.toLowerCase();
          const userEmail = authUser.email?.toLowerCase();

          let name = 'Reader';
          if (userEmail === gregEmail) name = 'Greg';
          else if (userEmail === matiEmail) name = 'Mati';

          await supabase.from('users').insert({ auth_id: authUser.id, name, email: authUser.email! });
        }
      }

      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';

      if (isLocalEnv) return NextResponse.redirect(`${origin}${next}`);
      else if (forwardedHost) return NextResponse.redirect(`https://${forwardedHost}${next}`);
      else return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
