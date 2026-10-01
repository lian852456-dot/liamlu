(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AwardModelCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  // Non-sensitive monthly rules. Kept in sync with config/award-config-2026-10.json.
  const OCTOBER = {
  "configVersion": "2026-10-v1",
  "effectiveMonth": "2026-10",
  "expectedPhoneItems": 10,
  "expectedStoreRows": 10,
  "selectedModels": [
    "ZFold8Ultra/ZFold8/ZFlip8",
    "Pixel10a",
    "Pixel11Pro/11ProXL/11ProFold",
    "S26Ultra",
    "Pixel11",
    "S26/S26+",
    "Reno16F",
    "A57",
    "V80Lite",
    "A6x6G/128G/A7Pro"
  ],
  "modelGroups": [
    {
      "modelId": "ZFold8Ultra/ZFold8/ZFlip8",
      "reportModelId": "zfold8-family",
      "displayName": "Z Fold8 Ultra／Z Fold8／Z Flip8"
    },
    {
      "modelId": "Pixel10a",
      "reportModelId": "pixel-10a",
      "displayName": "Google Pixel 10a"
    },
    {
      "modelId": "Pixel11Pro/11ProXL/11ProFold",
      "reportModelId": "pixel-11-pro-family",
      "displayName": "Google Pixel 11 Pro／11 Pro XL／11 Pro Fold"
    },
    {
      "modelId": "S26Ultra",
      "reportModelId": "s26-ultra",
      "displayName": "Samsung S26 Ultra"
    },
    {
      "modelId": "Pixel11",
      "reportModelId": "pixel-11",
      "displayName": "Google Pixel 11"
    },
    {
      "modelId": "S26/S26+",
      "reportModelId": "s26-family",
      "displayName": "Samsung S26／S26+"
    },
    {
      "modelId": "Reno16F",
      "reportModelId": "oppo-r16f",
      "displayName": "OPPO Reno16 F"
    },
    {
      "modelId": "A57",
      "reportModelId": "samsung-a57",
      "displayName": "Samsung Galaxy A57"
    },
    {
      "modelId": "V80Lite",
      "reportModelId": "vivo-v80-lite",
      "displayName": "vivo V80 Lite"
    },
    {
      "modelId": "A6x6G/128G/A7Pro",
      "reportModelId": "oppo-a6x-a7pro",
      "displayName": "OPPO A6x 6G/128G／OPPO A7 Pro"
    }
  ],
  "modelAliases": {
    "ZFold8Ultra/ZFold8/ZFlip8": "ZFold8Ultra/ZFold8/ZFlip8",
    "A6x/A7Pro": "A6x6G/128G/A7Pro",
    "A6x6G/128G&A7Pro": "A6x6G/128G/A7Pro",
    "V80 Lite": "V80Lite"
  },
  "rewardRules": [
    {
      "role": "manager",
      "amounts": {
        "ZFold8Ultra/ZFold8/ZFlip8": [
          610,
          780,
          910,
          1040,
          1305
        ],
        "Pixel10a": [
          1105,
          1420,
          1660,
          1895,
          2370
        ],
        "Pixel11Pro/11ProXL/11ProFold": [
          345,
          440,
          515,
          590,
          735
        ],
        "S26Ultra": [
          260,
          330,
          385,
          440,
          555
        ],
        "Pixel11": [
          280,
          360,
          420,
          480,
          600
        ],
        "S26/S26+": [
          530,
          680,
          790,
          905,
          1130
        ],
        "Reno16F": [
          945,
          1215,
          1415,
          1620,
          2025
        ],
        "A57": [
          1140,
          1465,
          1710,
          1950,
          2440
        ],
        "V80Lite": [
          910,
          1170,
          1370,
          1565,
          1955
        ],
        "A6x6G/128G/A7Pro": [
          885,
          1135,
          1325,
          1515,
          1895
        ]
      }
    },
    {
      "role": "supervisor",
      "amounts": {
        "ZFold8Ultra/ZFold8/ZFlip8": [
          640,
          785,
          980,
          1180,
          1475
        ],
        "Pixel10a": [
          1150,
          1415,
          1770,
          2120,
          2650
        ],
        "Pixel11Pro/11ProXL/11ProFold": [
          360,
          440,
          550,
          660,
          825
        ],
        "S26Ultra": [
          270,
          330,
          415,
          495,
          620
        ],
        "Pixel11": [
          295,
          360,
          450,
          540,
          675
        ],
        "S26/S26+": [
          555,
          680,
          850,
          1020,
          1275
        ],
        "Reno16F": [
          990,
          1220,
          1525,
          1830,
          2285
        ],
        "A57": [
          1195,
          1470,
          1840,
          2205,
          2760
        ],
        "V80Lite": [
          955,
          1180,
          1470,
          1765,
          2210
        ],
        "A6x6G/128G/A7Pro": [
          905,
          1115,
          1395,
          1675,
          2095
        ]
      }
    },
    {
      "role": "seller",
      "amounts": {
        "ZFold8Ultra/ZFold8/ZFlip8": [
          650,
          1300,
          1325
        ],
        "Pixel10a": [
          490,
          975,
          995
        ],
        "Pixel11Pro/11ProXL/11ProFold": [
          490,
          975,
          995
        ],
        "S26Ultra": [
          490,
          975,
          995
        ],
        "Pixel11": [
          425,
          845,
          860
        ],
        "S26/S26+": [
          425,
          845,
          860
        ],
        "Reno16F": [
          325,
          650,
          665
        ],
        "A57": [
          325,
          650,
          665
        ],
        "V80Lite": [
          325,
          650,
          665
        ],
        "A6x6G/128G/A7Pro": [
          125,
          250,
          255
        ]
      }
    }
  ],
  "emptyDeviceRewards": {
    "seller": {
      "ZFold8Ultra/ZFold8/ZFlip8": 1300,
      "Pixel10a": 975,
      "Pixel11Pro/11ProXL/11ProFold": 975,
      "S26Ultra": 975,
      "Pixel11": 845,
      "S26/S26+": 845,
      "Reno16F": 650,
      "A57": 650,
      "V80Lite": 650,
      "A6x6G/128G/A7Pro": 250
    },
    "manager": {
      "ZFold8Ultra/ZFold8/ZFlip8": 330,
      "Pixel10a": 250,
      "Pixel11Pro/11ProXL/11ProFold": 250,
      "S26Ultra": 250,
      "Pixel11": 215,
      "S26/S26+": 215,
      "Reno16F": 165,
      "A57": 165,
      "V80Lite": 165,
      "A6x6G/128G/A7Pro": 65
    },
    "supervisor": {
      "ZFold8Ultra/ZFold8/ZFlip8": 43,
      "Pixel10a": 32,
      "Pixel11Pro/11ProXL/11ProFold": 32,
      "S26Ultra": 32,
      "Pixel11": 28,
      "S26/S26+": 28,
      "Reno16F": 21,
      "A57": 21,
      "V80Lite": 21,
      "A6x6G/128G/A7Pro": 8
    }
  },
  "sourceImages": [
    "image(20261001-090103).png",
    "image(20261001-090108).png",
    "image(20261001-090112).png"
  ]
};
  const SEPTEMBER = [
    ['pixel-10a','Pixel 10a'], ['s26u-zfold8-family','S26 Ultra／Z Fold8／Z Fold8 Ultra'],
    ['pixel-11-pro-family','Pixel 11 Pro／11 Pro XL／11 Pro Fold'], ['s26-256g','S26 256G'],
    ['pixel-11','Pixel 11'], ['vivo-v70fe','vivo V70 FE'], ['oppo-r16f','Reno16 F'],
    ['samsung-a57','Galaxy A57'], ['oppo-a6x','A6x 6G／128G'], ['samsung-a27','Galaxy A27']
  ].map(([modelId,shortName]) => ({modelId,shortName}));
  const monthOf = date => String(date || '').slice(0,7);
  function definitions(date) {
    if (monthOf(date) === '2026-10') return OCTOBER.modelGroups.map(group => ({
      modelId:group.reportModelId, shortName:group.displayName, sourceName:group.modelId,
      managerRewards:OCTOBER.rewardRules.find(row=>row.role==='manager').amounts[group.modelId]
    }));
    if (monthOf(date) === '2026-09') return SEPTEMBER.map(row=>({...row}));
    return null;
  }
  function expectedCount(date) { return definitions(date)?.length || 13; }
  const normalize = name => String(name || '').replace(/Google|Samsung|Galaxy|OPPO|vivo/gi,'').replace(/[\s/／&＆+]/g,'').toLowerCase();
  function selectionMatches(items,date) {
    if (monthOf(date) !== '2026-10') return true;
    if (!Array.isArray(items) || items.length !== 10) return false;
    const expected = OCTOBER.modelGroups.map(group=>group.modelId);
    const resolve = item => {
      const name=String(item && (item.name || item.sourceName || item.display_name) || '');
      const alias=OCTOBER.modelAliases[name] || name;
      return expected.find(key=>normalize(key)===normalize(alias)) ||
        OCTOBER.modelGroups.find(group=>normalize(group.displayName)===normalize(name))?.modelId;
    };
    const names=items.map(resolve);
    return names.every(Boolean) && new Set(names).size===10;
  }
  return { october:OCTOBER, definitions, expectedCount, selectionMatches };
});
