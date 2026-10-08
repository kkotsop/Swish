// Each move is a profile: orientation, metric list and copy. Pipeline/report/progress are shared.
import { SHOOTING_METRICS, analyzeShooting, headlineScore } from './shooting.js';
import { COPY } from './coaching.js';

export const MOVES = {
  shooting: {
    id: 'shooting', photo: 'swish-icons/card-shooting.jpg', focus: '50% 60%', name: 'Shooting form', blurb: 'Film from the side or front', orientation: 'portrait', available: true,
    metrics: SHOOTING_METRICS, copy: COPY.shooting, analyze: analyzeShooting, headline: headlineScore,
    guide: {
      orientation: 'portrait', title: 'Where to film',
      views: {
        side: { note: 'Best for angles: release, knee bend, balance and follow-through.', steps: ['Stand side-on to the phone. About 3 m (10 ft) away is ideal, but further back (even from the stands) works too.', 'Prop the phone at hip height. Held upright works best, though landscape is fine.', 'Try to get your whole body in the frame, feet to hands overhead.', 'Shoot a few. Keep everyone else out of the shot.'] },
        front: { note: 'Best for elbow alignment, sideways balance and your off hand.', steps: ['Face the phone, ideally about 3 m (10 ft) away and a little off the line to the basket. Further back works too.', 'Prop the phone at hip height. Held upright works best, though landscape is fine.', 'Try to get your whole body in the frame, feet to hands overhead.', 'Shoot a few. Keep everyone else out of the shot.'] },
      },
    },
  },
  jab: { id: 'jab', photo: 'swish-icons/card-jab.jpg', photoSoon: 'swish-icons/card-jab-soon.jpg', focus: '50% 45%', name: 'Jab step', blurb: 'Coming soon', available: false, orientation: 'landscape' },
  layupLeft: { id: 'layupLeft', photo: 'swish-icons/card-layupLeft.jpg', photoSoon: 'swish-icons/card-layupLeft-soon.jpg', focus: '50% 38%', name: 'Layup, left', blurb: 'Coming soon', available: false },
  layupRight: { id: 'layupRight', photo: 'swish-icons/card-layupRight.jpg', photoSoon: 'swish-icons/card-layupRight-soon.jpg', focus: '50% 35%', name: 'Layup, right', blurb: 'Coming soon', available: false },
  crossover: { id: 'crossover', photo: 'swish-icons/card-crossover.jpg', photoSoon: 'swish-icons/card-crossover-soon.jpg', focus: '56% 40%', name: 'Crossover', blurb: 'Coming soon', available: false },
};
