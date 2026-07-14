export const PERSONA_RULES = {
  sliderRange: {
    min: 0,
    max: 10,
    neutral: 5,
  },
  recencyWeights: {
    currentSeason: 2,
    previousSeason: 2,
    olderSeasons: 1,
  },
  tradeFriendliness: {
    tradeRateAdjustments: [
      { min: 3, delta: 3, label: 'Wheeler-dealer pace' },
      { min: 1.5, delta: 1, label: 'Active trade pace' },
    ],
    lowTradeRate: { lt: 0.5, delta: -3, label: 'Stand-pat pace' },
    initiationBonus: { min: 60, delta: 1, label: 'Starts the talks' },
    receptivityBonus: {
      minConsentedTradesPerSeason: 2,
      delta: 1,
      label: 'Keeps saying yes to outside offers',
    },
  },
  relationship: {
    priorDealings: [
      { minTrades: 2, delta: 2, label: 'Multiple completed trades together' },
      { minTrades: 1, delta: 1, label: 'Completed a trade together' },
    ],
  },
  chips: {
    wheelerDealer: { minTradesPerSeason: 3, label: 'Wheeler-dealer' },
    standPat: { ltTradesPerSeason: 0.5, label: 'Stand-pat' },
    initiator: { minInitiationRate: 60, label: 'Initiator' },
    responder: { maxInitiationRate: 40, label: 'Responder' },
    waiverShark: { quartile: 'high', label: 'Waiver shark' },
    setAndForget: { quartile: 'low', label: 'Set-and-forget' },
    faabBurner: { minEarlyBudgetShare: 0.5, label: 'FAAB burner' },
    faabMiser: { maxEarlySpend: 0, label: 'FAAB miser' },
    pickFlipper: { minAbsolute: 4, minPerSeason: 2, label: 'Pick flipper' },
    pickHoarder: { exact: 0, label: 'Pick hoarder' },
    ringChaser: { minTitles: 1, label: 'Ring chaser' },
  },
} as const;
