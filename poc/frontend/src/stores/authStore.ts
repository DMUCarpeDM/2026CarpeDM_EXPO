import { create } from 'zustand';
import { authToken, clearAuthToken, getMe } from '../api/client';
import type { Me } from '../api/types';

/** 로그인 사용자 캐시 (S-B2B-118) — 네비게이션·기관 대시보드 게이트가 공유한다.
 * me === undefined: 아직 조회 전 / 조회 중, me === null: 미로그인(또는 토큰 만료). */
interface AuthState {
  me: Me | null | undefined;
  load: () => Promise<void>;
  /** 서버가 갱신된 사용자를 돌려준 직후 캐시 교체 (예: PATCH /auth/me 직무 변경) */
  setMe: (me: Me) => void;
  signOut: () => void;
}

let loading = false; // StrictMode 이중 마운트·다중 구독자의 중복 조회 방지

export const useAuthStore = create<AuthState>((set) => ({
  me: undefined,
  load: async () => {
    if (!authToken()) {
      set({ me: null });
      return;
    }
    if (loading) return;
    loading = true;
    try {
      set({ me: await getMe() });
    } catch {
      // 토큰 만료·서버 불가 — 로그인 링크를 보여주는 쪽으로 강등
      set({ me: null });
    } finally {
      loading = false;
    }
  },
  setMe: (me) => set({ me }),
  signOut: () => {
    clearAuthToken();
    set({ me: null });
  },
}));
