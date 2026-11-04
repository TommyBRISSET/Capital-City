'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BoardPackId, TokenId } from '@capital-city/shared';

export interface UiPreferencesState {
  displayName: string;
  preferredToken: TokenId;
  selectedPreviewPack: BoardPackId;
  reducedMotion: boolean;
  soundEnabled: boolean;
  tutorialCompleted: boolean;
  tutorialStep: number;
  tutorialOpen: boolean;
  settingsOpen: boolean;
  rulesOpen: boolean;
  recentRoomCodes: string[];
  setDisplayName: (name: string) => void;
  setPreferredToken: (token: TokenId) => void;
  setSelectedPreviewPack: (packId: BoardPackId) => void;
  setReducedMotion: (reduced: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  openTutorial: (step?: number) => void;
  setTutorialStep: (step: number) => void;
  closeTutorial: (markCompleted?: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setRulesOpen: (open: boolean) => void;
  addRecentRoomCode: (code: string) => void;
}

export const useUiStore = create<UiPreferencesState>()(
  persist(
    (set) => ({
      displayName: '',
      preferredToken: 'skyline-tower',
      selectedPreviewPack: 'asteria-city',
      reducedMotion: false,
      soundEnabled: true,
      tutorialCompleted: false,
      tutorialStep: 0,
      tutorialOpen: false,
      settingsOpen: false,
      rulesOpen: false,
      recentRoomCodes: [],
      setDisplayName: (displayName) => set({ displayName }),
      setPreferredToken: (preferredToken) => set({ preferredToken }),
      setSelectedPreviewPack: (selectedPreviewPack) => set({ selectedPreviewPack }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      openTutorial: (step) =>
        set((s) => ({
          tutorialOpen: true,
          tutorialStep: typeof step === 'number' ? step : s.tutorialStep,
        })),
      setTutorialStep: (tutorialStep) => set({ tutorialStep }),
      closeTutorial: (markCompleted = false) =>
        set((s) => ({
          tutorialOpen: false,
          tutorialCompleted: markCompleted ? true : s.tutorialCompleted,
        })),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setRulesOpen: (rulesOpen) => set({ rulesOpen }),
      addRecentRoomCode: (code) =>
        set((s) => ({
          recentRoomCodes: [code, ...s.recentRoomCodes.filter((c) => c !== code)].slice(0, 6),
        })),
    }),
    {
      name: 'capital-city-ui-prefs-v1',
      partialize: (state) => ({
        displayName: state.displayName,
        preferredToken: state.preferredToken,
        selectedPreviewPack: state.selectedPreviewPack,
        reducedMotion: state.reducedMotion,
        soundEnabled: state.soundEnabled,
        tutorialCompleted: state.tutorialCompleted,
        tutorialStep: state.tutorialStep,
        recentRoomCodes: state.recentRoomCodes,
      }),
    },
  ),
);
