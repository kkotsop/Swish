// Each move is a profile: orientation, metric list and copy. Pipeline/report/progress are shared.
import { SHOOTING_METRICS, analyzeShooting, headlineScore } from './shooting.js';
import { COPY } from './coaching.js';

export const MOVES = {
  shooting: {
    id: 'shooting', name: 'Shooting form', blurb: 'Film from the side or front', orientation: 'portrait', available: true,
    metrics: SHOOTING_METRICS, copy: COPY.shooting, analyze: analyzeShooting, headline: headlineScore,
    guide: {
      orientation: 'portrait', title: 'Where to film',
      views: {
        side: { note: 'Best for angles: release, knee bend, balance and follow-through.', steps: ['Stand side-on to the phone, about 3 m (10 ft) away.', 'Prop the phone upright at hip height.', 'Get your whole body in the frame, feet to hands overhead.', 'Shoot a few. Keep everyone else out of the shot.'] },
        front: { note: 'Best for elbow alignment, sideways balance and your off hand.', steps: ['Face the phone from about 3 m (10 ft) away, a little off the line to the basket.', 'Prop the phone upright at hip height.', 'Get your whole body in the frame, feet to hands overhead.', 'Shoot a few. Keep everyone else out of the shot.'] },
      },
    },
  },
  layup: { id: 'layup', name: 'Layups', blurb: 'Coming soon', available: false },
  jab: { id: 'jab', name: 'Jab step', blurb: 'Coming soon (landscape)', available: false, orientation: 'landscape' },
};
