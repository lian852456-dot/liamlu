(function attachYesterdayFollowUpModel(scope) {
  'use strict';

  const FEEDBACK_FIELDS = ['reason','consult','method','plan'];

  function feedbackPresent(feedback) {
    return FEEDBACK_FIELDS.some(field => String(feedback && feedback[field] || '').trim());
  }

  function adapt({ date, report }) {
    const stores = Array.isArray(report && report.stores) ? report.stores : [];
    const tracked = stores.map(store => {
      const failedPeople = (Array.isArray(store.people) ? store.people : [])
        .filter(person => person.status === 'fail')
        .map(person => ({
          name:String(person.name || ''),
          failed:Array.isArray(person.failed) ? person.failed.map(String) : [],
          reason:String(person.reason || ''),
          improvePlan:String(person.improvePlan || '')
        }));
      const feedback = Object.fromEntries(FEEDBACK_FIELDS.map(field => [field,String(store.storeFeedback && store.storeFeedback[field] || '')]));
      const failedMetrics = [...new Set(failedPeople.flatMap(person => person.failed))];
      return {
        name:String(store.name || ''), failedPeople, failedMetrics, storeFeedback:feedback,
        hasFailure:failedPeople.length > 0, hasFeedback:feedbackPresent(feedback)
      };
    }).filter(store => store.hasFailure || store.hasFeedback)
      .sort((left,right) => Number(right.hasFailure) - Number(left.hasFailure) || Number(right.hasFeedback) - Number(left.hasFeedback));
    return {
      date:String(date || ''), segment:21,
      formalDataAvailable:Number(report && report.completedStores || 0) > 0,
      failedStoreCount:tracked.filter(store => store.hasFailure).length,
      failedPeopleCount:tracked.reduce((sum,store) => sum + store.failedPeople.length, 0),
      feedbackStoreCount:tracked.filter(store => store.hasFeedback).length,
      trackingStoreCount:tracked.length,
      stores:tracked
    };
  }

  const api = { FEEDBACK_FIELDS, feedbackPresent, adapt };
  scope.LiamYesterdayFollowUpModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
