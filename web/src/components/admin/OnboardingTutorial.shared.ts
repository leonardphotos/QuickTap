

export const STORAGE_PREFIX = 'quicktap_tutorial_seen_';


export function hasSeenOnboardingTutorial(restaurantId: string): boolean {
  return localStorage.getItem(STORAGE_PREFIX + restaurantId) === 'true';
}
