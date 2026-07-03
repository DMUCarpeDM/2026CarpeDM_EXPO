import { create } from 'zustand';
import type { RoleplaySession, Turn } from '../api/types';

interface SessionState {
  session: RoleplaySession | null;
  currentTurn: Turn | null;
  turnHistory: { turn: Turn; response: string }[];
  setSession: (session: RoleplaySession) => void;
  advance: (answered: Turn, response: string, next: Turn | null) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  currentTurn: null,
  turnHistory: [],
  setSession: (session) =>
    set({ session, currentTurn: session.current_turn, turnHistory: [] }),
  advance: (answered, response, next) =>
    set((s) => ({
      currentTurn: next,
      turnHistory: [...s.turnHistory, { turn: answered, response }],
    })),
  clear: () => set({ session: null, currentTurn: null, turnHistory: [] }),
}));
