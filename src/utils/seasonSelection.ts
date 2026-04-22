const CASCADE_SCENARIO_KEY = 'lineup-lab-cascade-scenario';

export function setStoredCascadeScenarioLabel(label: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(CASCADE_SCENARIO_KEY, label);
}

export function getStoredCascadeScenarioLabel() {
  if (typeof window === 'undefined') {
    return 'Start McLaurin';
  }

  return window.localStorage.getItem(CASCADE_SCENARIO_KEY) ?? 'Start McLaurin';
}
