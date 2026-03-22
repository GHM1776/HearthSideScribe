'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@/lib/types';

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!authUser) {
        setIsLoading(false);
        return;
      }

      const { data: clubUser } = await supabase
        .from('users')
        .select('id, auth_id, name, email, phone, created_at')
        .eq('auth_id', authUser.id)
        .single();

      if (clubUser) {
        setUser(clubUser as User);
      }
      setIsLoading(false);
    }

    fetchUser();

    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchUser();
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, isLoading };
}
