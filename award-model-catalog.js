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
  const NOVEMBER = {
  "configVersion": "2026-11-v1",
  "effectiveMonth": "2026-11",
  "selectedModels": [
    "Samsung Galaxy Z Flip8/Fold8/Fold8 Ultra",
    "Google Pixel 11 Pro/Pro XL/11 Pro Fold/10a",
    "vivo X500",
    "Google Pixel 11",
    "Samsung S26 256G",
    "vivo V80",
    "vivo V80 Lite",
    "OPPO Reno16 F",
    "Samsung Galaxy A57",
    "OPPO A6x 6G/128G & OPPO A7 Pro"
  ],
  "rewardRules": [
    {
      "role": "manager",
      "tiers": [
        "50%-79%",
        "80%-99%",
        "100%-119%",
        "120%-199%",
        ">=200%"
      ],
      "amounts": {
        "Samsung Galaxy Z Flip8/Fold8/Fold8 Ultra": [
          380,
          490,
          575,
          655,
          820
        ],
        "Google Pixel 11 Pro/Pro XL/11 Pro Fold/10a": [
          1370,
          1760,
          2050,
          2345,
          2930
        ],
        "vivo X500": [
          150,
          190,
          220,
          255,
          315
        ],
        "Google Pixel 11": [
          395,
          510,
          595,
          680,
          850
        ],
        "Samsung S26 256G": [
          585,
          750,
          875,
          1000,
          1250
        ],
        "vivo V80": [
          155,
          200,
          230,
          265,
          330
        ],
        "vivo V80 Lite": [
          810,
          1040,
          1215,
          1385,
          1730
        ],
        "OPPO Reno16 F": [
          1055,
          1360,
          1585,
          1815,
          2265
        ],
        "Samsung Galaxy A57": [
          730,
          940,
          1100,
          1255,
          1570
        ],
        "OPPO A6x 6G/128G & OPPO A7 Pro": [
          790,
          1020,
          1185,
          1355,
          1695
        ]
      }
    },
    {
      "role": "supervisor",
      "tiers": [
        "80%-89%",
        "90%-99%",
        "100%-119%",
        "120%-199%",
        ">=200%"
      ],
      "amounts": {
        "Samsung Galaxy Z Flip8/Fold8/Fold8 Ultra": [
          400,
          490,
          615,
          735,
          920
        ],
        "Google Pixel 11 Pro/Pro XL/11 Pro Fold/10a": [
          1415,
          1740,
          2175,
          2610,
          3265
        ],
        "vivo X500": [
          155,
          190,
          235,
          280,
          355
        ],
        "Google Pixel 11": [
          415,
          510,
          635,
          765,
          955
        ],
        "Samsung S26 256G": [
          605,
          745,
          935,
          1120,
          1400
        ],
        "vivo V80": [
          160,
          195,
          245,
          295,
          370
        ],
        "vivo V80 Lite": [
          835,
          1030,
          1285,
          1545,
          1930
        ],
        "OPPO Reno16 F": [
          1105,
          1360,
          1700,
          2040,
          2545
        ],
        "Samsung Galaxy A57": [
          765,
          940,
          1175,
          1410,
          1765
        ],
        "OPPO A6x 6G/128G & OPPO A7 Pro": [
          805,
          995,
          1240,
          1490,
          1865
        ]
      }
    },
    {
      "role": "seller",
      "tiers": [
        "<50%",
        "50%-199%",
        ">=200%"
      ],
      "unit": "元/門",
      "amounts": {
        "Samsung Galaxy Z Flip8/Fold8/Fold8 Ultra": [
          650,
          1300,
          1325
        ],
        "Google Pixel 11 Pro/Pro XL/11 Pro Fold/10a": [
          490,
          975,
          995
        ],
        "vivo X500": [
          490,
          975,
          995
        ],
        "Google Pixel 11": [
          425,
          845,
          860
        ],
        "Samsung S26 256G": [
          425,
          845,
          860
        ],
        "vivo V80": [
          425,
          845,
          860
        ],
        "vivo V80 Lite": [
          390,
          780,
          795
        ],
        "OPPO Reno16 F": [
          325,
          650,
          665
        ],
        "Samsung Galaxy A57": [
          325,
          650,
          665
        ],
        "OPPO A6x 6G/128G & OPPO A7 Pro": [
          125,
          250,
          255
        ]
      }
    }
  ],
  "emptyDeviceRewards": {
    "manager": {
      "Samsung Galaxy Z Flip8/Fold8/Fold8 Ultra": 330,
      "Google Pixel 11 Pro/Pro XL/11 Pro Fold/10a": 250,
      "vivo X500": 250,
      "Google Pixel 11": 215,
      "Samsung S26 256G": 215,
      "vivo V80": 215,
      "vivo V80 Lite": 200,
      "OPPO Reno16 F": 165,
      "Samsung Galaxy A57": 165,
      "OPPO A6x 6G/128G & OPPO A7 Pro": 65
    },
    "supervisor": {
      "Samsung Galaxy Z Flip8/Fold8/Fold8 Ultra": 43,
      "Google Pixel 11 Pro/Pro XL/11 Pro Fold/10a": 32,
      "vivo X500": 32,
      "Google Pixel 11": 28,
      "Samsung S26 256G": 28,
      "vivo V80": 28,
      "vivo V80 Lite": 26,
      "OPPO Reno16 F": 21,
      "Samsung Galaxy A57": 21,
      "OPPO A6x 6G/128G & OPPO A7 Pro": 8
    },
    "seller": {
      "Samsung Galaxy Z Flip8/Fold8/Fold8 Ultra": 1300,
      "Google Pixel 11 Pro/Pro XL/11 Pro Fold/10a": 975,
      "vivo X500": 975,
      "Google Pixel 11": 845,
      "Samsung S26 256G": 845,
      "vivo V80": 845,
      "vivo V80 Lite": 780,
      "OPPO Reno16 F": 650,
      "Samsung Galaxy A57": 650,
      "OPPO A6x 6G/128G & OPPO A7 Pro": 250
    }
  },
  "modelGroups": [
    {
      "modelId": "Samsung Galaxy Z Flip8/Fold8/Fold8 Ultra",
      "displayName": "Z Flip8/Fold8/Fold8 Ultra",
      "reportModelId": "zfold8-family"
    },
    {
      "modelId": "Google Pixel 11 Pro/Pro XL/11 Pro Fold/10a",
      "displayName": "Pixel11P/XL/Fold/10a",
      "reportModelId": "pixel-11-pro-10a-family"
    },
    {
      "modelId": "vivo X500",
      "displayName": "vivo X500",
      "reportModelId": "vivo-x500"
    },
    {
      "modelId": "Google Pixel 11",
      "displayName": "Google Pixel 11",
      "reportModelId": "pixel-11"
    },
    {
      "modelId": "Samsung S26 256G",
      "displayName": "Samsung S26 256G",
      "reportModelId": "s26-256g"
    },
    {
      "modelId": "vivo V80",
      "displayName": "vivo V80",
      "reportModelId": "vivo-v80"
    },
    {
      "modelId": "vivo V80 Lite",
      "displayName": "vivo V80 Lite",
      "reportModelId": "vivo-v80-lite"
    },
    {
      "modelId": "OPPO Reno16 F",
      "displayName": "OPPO Reno16 F",
      "reportModelId": "oppo-r16f"
    },
    {
      "modelId": "Samsung Galaxy A57",
      "displayName": "Samsung Galaxy A57",
      "reportModelId": "samsung-a57"
    },
    {
      "modelId": "OPPO A6x 6G/128G & OPPO A7 Pro",
      "displayName": "A6x 6G/128G &  A7 Pro",
      "reportModelId": "oppo-a6x-a7pro"
    }
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
    if (monthOf(date) === '2026-11') return NOVEMBER.modelGroups.map(group => ({
      modelId:group.reportModelId, shortName:group.displayName, sourceName:group.modelId,
      managerRewards:NOVEMBER.rewardRules.find(row=>row.role==='manager').amounts[group.modelId]
    }));
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
    if (monthOf(date) === '2026-11') {
      if (!Array.isArray(items) || items.length !== 10) return false;
      const resolve = item => {
        const names = [item && item.name, item && item.sourceName, item && item.display_name, item && item.modelId].filter(Boolean);
        return NOVEMBER.modelGroups.find(group => names.some(name =>
          [group.modelId, group.displayName, group.reportModelId].some(key => normalize(key) === normalize(name))))?.modelId;
      };
      const names = items.map(resolve);
      return names.every(Boolean) && new Set(names).size === 10;
    }
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
  return { october:OCTOBER, november:NOVEMBER, definitions, expectedCount, selectionMatches };
});
