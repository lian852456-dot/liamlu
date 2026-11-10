// Shared isolated-game supervisor rules. The service can re-export this object
// when its integration branch is ready; knowledge answers use the same source.
export const SUPERVISOR_RULES = Object.freeze({
  name: '蔚榮主管',
  coins: 5,
  dailyLimit: 1,
  minimumTalkMs: 8000,
  encounterMs: 90000,
  speed: 1.15,
  cooldownMs: 30000,
});
