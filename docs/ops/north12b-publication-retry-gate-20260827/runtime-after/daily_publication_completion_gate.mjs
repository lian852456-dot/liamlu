const REQUIRED_STEPS = Object.freeze({
  KPI: ['source', 'build', 'mail', 'publish', 'websiteReadback', 'appReadback'],
  awards: ['source', 'build', 'mail', 'publish', 'websiteReadback', 'appReadback'],
});

function passed(value) {
  return value === true || value === 'PASS' || value === 'verified' || value === 'published-verified';
}

export function evaluatePublicationComponent(component, state = {}) {
  const steps = REQUIRED_STEPS[component];
  if (!steps) throw new Error(`unknown publication component: ${component}`);
  const firstFailed = steps.find(step => !passed(state[step]));
  return {
    component,
    result: firstFailed ? 'BLOCKED' : 'PASS',
    firstFailed: firstFailed || null,
    steps: Object.fromEntries(steps.map(step => [step, passed(state[step]) ? 'PASS' : 'BLOCKED'])),
  };
}

export function evaluateDailyPublicationGate({ KPI = {}, awards = {} } = {}) {
  const kpiResult = evaluatePublicationComponent('KPI', KPI);
  const awardsResult = evaluatePublicationComponent('awards', awards);
  return {
    result: kpiResult.result === 'PASS' && awardsResult.result === 'PASS' ? 'PASS' : 'BLOCKED',
    components: { KPI: kpiResult, awards: awardsResult },
    kpiIndependentPass: kpiResult.result === 'PASS',
    awardsIndependentPass: awardsResult.result === 'PASS',
  };
}

export function planPublicationResume({ component, state = {}, artifact = {}, expected = {} }) {
  const gate = evaluatePublicationComponent(component, state);
  for (const field of ['reportDate', 'cutoff', 'runId', 'sha256']) {
    if (expected[field] && artifact[field] !== expected[field]) {
      throw new Error(`${component} artifact ${field} mismatch`);
    }
  }
  if (!passed(state.source) || !passed(state.build) || !passed(state.mail)) {
    throw new Error(`${component} cannot resume publication before source, build and mail verification pass`);
  }
  const actions = [];
  if (!passed(state.publish)) actions.push('publish');
  if (!passed(state.websiteReadback)) actions.push('website-readback');
  if (!passed(state.appReadback)) actions.push('app-readback');
  return {
    component,
    gate,
    actions,
    forbiddenActions: ['fetch-source', 'parse-source', 'build-report', 'render-images', 'send-mail'],
    idempotent: true,
  };
}
