// Each move is a profile: orientation, metric list and copy. Pipeline/report/progress are shared.
import { SHOOTING_METRICS, analyzeShooting, headlineScore } from './shooting.js';
import { COPY } from './coaching.js';

export const MOVES = {
  shooting: {
    id: 'shooting', name: 'Shooting form', blurb: 'Film from the side or front', glyph: 'shoot', orientation: 'portrait', available: true,
    metrics: SHOOTING_METRICS, copy: COPY.shooting, analyze: analyzeShooting, headline: headlineScore,
    guide: {
      orientation: 'portrait', title: 'Where to film',
      views: {
        side: { note: 'Best for angles: release, knee bend, balance and follow-through.', steps: ['Stand side-on to the phone, about 3 m (10 ft) away.', 'Prop the phone upright at hip height.', 'Get your whole body in the frame, feet to hands overhead.', 'Shoot a few. Keep everyone else out of the shot.'] },
        front: { note: 'Best for elbow alignment, sideways balance and your off hand.', steps: ['Face the phone from about 3 m (10 ft) away, a little off the line to the basket.', 'Prop the phone upright at hip height.', 'Get your whole body in the frame, feet to hands overhead.', 'Shoot a few. Keep everyone else out of the shot.'] },
      },
    },
  },
  jab: { id: 'jab', name: 'Jab step', blurb: 'Coming soon', glyph: 'jab', available: false, orientation: 'landscape' },
  layupLeft: { id: 'layupLeft', name: 'Layup, left', blurb: 'Coming soon', glyph: 'layup', available: false },
  layupRight: { id: 'layupRight', name: 'Layup, right', blurb: 'Coming soon', glyph: 'layup', flip: true, available: false },
  crossover: { id: 'crossover', name: 'Crossover', blurb: 'Coming soon', glyph: 'cross', available: false },
};
