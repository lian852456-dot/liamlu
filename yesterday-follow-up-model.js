(function attachYesterdayFollowUpModel(scope) {
  'use strict';

  const FEEDBACK_FIELDS = ['reason','consult','method','plan'];

  function cleanText(value) {
    return String(value == null ? '' : value);
  }

  function feedbackPresent(feedback) {
    return FEEDBACK_FIELDS.some(field => cleanText(feedback && feedback[field]).trim());
  }

  function adapt({ date, report }) {
    const sourceStores = Array.isArray(report && report.stores) ? report.stores : [];
    const reportedStores = sourceStores.filter(store => store && store.reported);
    const stores = reportedStores.map(store => {
      const failedPeople = (Array.isArray(store.people) ? store.people : [])
        .filter(person => person && person.status === 'fail')
        .map(person => ({
          name:cleanText(person.name),
          failed:Array.isArray(person.failed) ? person.failed.map(cleanText).filter(Boolean) : [],
          reason:cleanText(person.reason),
          improvePlan:cleanText(person.improvePlan)
        }));
      const storeFeedback = Object.fromEntries(FEEDBACK_FIELDS.map(field => [field,cleanText(store.storeFeedback && store.storeFeedback[field])]));
      const failedMetrics = [...new Set(failedPeople.flatMap(person => person.failed))];
      const hasFailure = failedPeople.length > 0;
      const hasConsult = Boolean(storeFeedback.consult.trim());
      const hasFeedback = feedbackPresent(storeFeedback);
      return {
        name:cleanText(store.name), failedPeople, failedMetrics, storeFeedback,
        hasFailure, hasConsult, hasFeedback
      };
    }).filter(store => store.hasFailure || store.hasFeedback)
      .sort((left,right) => Number(right.hasFailure) - Number(left.hasFailure)
        || Number(right.hasConsult) - Number(left.hasConsult)
        || left.name.localeCompare(right.name,'zh-Hant'));

    return {
      date:cleanText(date), segment:21,
      formalDataAvailable:reportedStores.length > 0,
      failedStoreCount:stores.filter(store => store.hasFailure).length,
      failedPeopleCount:stores.reduce((sum,store) => sum + store.failedPeople.length,0),
      consultStoreCount:stores.filter(store => store.hasConsult).length,
      trackingStoreCount:stores.length,
      stores
    };
  }

  const api = { FEEDBACK_FIELDS, feedbackPresent, adapt };
  scope.LiamYesterdayFollowUpModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
