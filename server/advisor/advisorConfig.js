// Thresholds and business assumptions for the AI Advisor's rules.
// Everything marked ASSUMPTION is an estimate, not learned from data, and is
// shown to managers in the "How is this estimated?" notes.
export const ADVISOR = {
    sellOutThreshold: 0.95,         // add a showtime when forecast >= 95% full
    upgradeThreshold: 0.85,         // offer a premium room when forecast >= 85%
    promoThreshold: 0.30,           // offer a promotion when forecast < 30%
    cancelThreshold: 0.15,          // offer to cancel when forecast < 15%
    promoMinHoursAhead: 48,         // promotions need time to work
    cancelMinHoursAhead: 3,
    addShowMinHoursAhead: 2,
    addShowWindowHours: 3,          // look for a new slot within +/- 3h of the busy show
    sameMovieGapMinutes: 45,        // don't put a new showing right next to an existing one
    mergeWindowHours: 3,            // a showing of the same film within +/- 3h can absorb some buyers
    maxAddShowOptions: 3,
    minImpact: 20,                  // USD; smaller gains aren't worth a manager's attention
    slotStepMinutes: 15,

    spillOverShare: 0.40,           // ASSUMPTION: an added showing fills 40% of its seats from turned-away demand
    priceResponse: { 10: 0.15, 20: 0.30, 30: 0.40 },   // ASSUMPTION: extra tickets from a discount
    cancelTransferShare: 0.50,      // ASSUMPTION: half of a cancelled show's buyers pick the nearby showing
    runningCostPerShow: 60,         // ASSUMPTION: staff + power per showing, USD

    highPriorityImpact: 300,        // USD
    mediumPriorityImpact: 100,
    urgentHours: 24,
};

export const PREMIUM_UPGRADE_ROOMS = ['IMAX', 'Dolby Cinema', '4DX', 'ScreenX'];

export const ASSUMPTIONS = {
    add_showtime: [
        `An added showing sells about ${ADVISOR.spillOverShare * 100}% of its seats to people the full show would turn away (assumption).`,
        'Options use a free screen, or replace a nearby show of another film that has no tickets sold and is forecast under 30% full (its forecast sales are counted as lost).',
        'Only screens that may play this film and are open at that time are offered.',
    ],
    upgrade_room: [
        'Customers who already bought keep their ticket and price; only new buyers pay the premium.',
        "The new room's sales are re-forecast by the demand model, which knows how each room type usually sells.",
        'Assumption: the higher ticket price does not put anyone off. The model has never seen prices change demand outside promotions, so it cannot judge this.',
    ],
    promotion: [
        `Discounts are assumed to sell ${Object.entries(ADVISOR.priceResponse).map(([p, r]) => `${r * 100}% more (${p}% off)`).join(', ')} of the remaining seats.`,
        'These are assumptions, not model output: validation showed the model under-estimates 20-30% discounts.',
        'The discount applies to the whole ticket, room premium included. Tickets already sold keep their original price.',
    ],
    cancel: [
        `Saves about $${ADVISOR.runningCostPerShow} in running costs per showing (assumption).`,
        `If the same film plays within ${ADVISOR.mergeWindowHours}h, about ${ADVISOR.cancelTransferShare * 100}% of the forecast buyers are assumed to switch to it; otherwise all are counted as lost (assumption).`,
        'Only offered while no tickets are sold.',
    ],
};
