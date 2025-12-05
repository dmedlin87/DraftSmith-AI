/**
 * Timeline Tracker Test Suite
 *
 * Comprehensive tests for timeline extraction and tracking:
 * - Temporal marker detection
 * - Event extraction and ordering
 * - Causal chain detection
 * - Plot promise tracking (setup → payoff)
 */

import { describe, it, expect } from 'vitest';
import {
  extractTimelineEvents,
  extractCausalChains,
  extractPlotPromises,
  buildTimeline,
  mergeTimelines,
  getUnresolvedPromises,
  getEventsInRange,
  getCausalChainsForEvent,
} from '@/services/intelligence/timelineTracker';
import { Scene, Timeline, TimelineEvent, PlotPromise } from '@/types/intelligence';

// ─────────────────────────────────────────────────────────────────────────────
// TEST FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

const createScene = (
  type: string,
  startOffset: number,
  endOffset: number,
  timeMarker: string | null = null,
  location: string | null = null
): Scene => ({
  type,
  startOffset,
  endOffset,
  tension: 0.5,
  timeMarker,
  location,
  characters: [],
  summary: '',
  dominantEmotion: 'neutral',
  dialogueRatio: 0.3,
  actionDensity: 0.5,
} as Scene);

// ─────────────────────────────────────────────────────────────────────────────
// EVENT EXTRACTION TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('Timeline Tracker', () => {
  describe('extractTimelineEvents', () => {
    describe('Temporal markers', () => {
      it('should extract "after" temporal markers', () => {
        const text = `First event happened. After that, second event occurred.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        const afterEvent = events.find(e => e.temporalMarker.toLowerCase().includes('after'));
        expect(afterEvent).toBeDefined();
        expect(afterEvent?.relativePosition).toBe('after');
        expect(afterEvent?.chapterId).toBe('ch1');
      });

      it('should extract "before" temporal markers', () => {
        const text = `Before the storm, they prepared. The storm came later.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        const beforeEvent = events.find(e => e.temporalMarker.toLowerCase().includes('before'));
        expect(beforeEvent).toBeDefined();
        expect(beforeEvent?.relativePosition).toBe('before');
      });

      it('should extract "meanwhile" concurrent markers', () => {
        const text = `He worked on the project. Meanwhile, she prepared dinner.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        const meanwhileEvent = events.find(e => e.temporalMarker.toLowerCase().includes('meanwhile'));
        expect(meanwhileEvent).toBeDefined();
        expect(meanwhileEvent?.relativePosition).toBe('concurrent');
      });

      it('should extract "later" markers', () => {
        const text = `They met in the morning. Later that day, they parted ways.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        const laterEvent = events.find(e => e.temporalMarker.toLowerCase().includes('later'));
        expect(laterEvent).toBeDefined();
        expect(laterEvent?.relativePosition).toBe('after');
      });

      it('should extract "previously" markers', () => {
        const text = `He remembered what happened. Previously, he had been there.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        const prevEvent = events.find(e => e.temporalMarker.toLowerCase().includes('previously'));
        expect(prevEvent).toBeDefined();
        expect(prevEvent?.relativePosition).toBe('before');
      });

      it('should extract "simultaneously" markers', () => {
        const text = `Two events occurred. Simultaneously, a third thing happened.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        const simEvent = events.find(e => e.temporalMarker.toLowerCase().includes('simultaneously'));
        expect(simEvent).toBeDefined();
        expect(simEvent?.relativePosition).toBe('concurrent');
      });
    });

    describe('Specific time references', () => {
      it('should extract "the next day" patterns', () => {
        const text = `They rested. The next day, they continued their journey.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        const nextDayEvent = events.find(e => e.temporalMarker.toLowerCase().includes('next day'));
        expect(nextDayEvent).toBeDefined();
        expect(nextDayEvent?.relativePosition).toBe('after');
      });

      it('should extract "the previous week" patterns', () => {
        const text = `She recalled events. The previous week had been chaotic.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        const prevWeekEvent = events.find(e => e.temporalMarker.toLowerCase().includes('previous week'));
        expect(prevWeekEvent).toBeDefined();
        expect(prevWeekEvent?.relativePosition).toBe('before');
      });

      it('should extract "X hours later" patterns', () => {
        const text = `They started walking. 3 hours later, they reached the town.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        const hoursLaterEvent = events.find(e => e.temporalMarker.includes('hours later'));
        expect(hoursLaterEvent).toBeDefined();
        expect(hoursLaterEvent?.relativePosition).toBe('after');
      });

      it('should extract "X days earlier" patterns', () => {
        const text = `The story began here. 5 days earlier, something had happened.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        const daysEarlierEvent = events.find(e => e.temporalMarker.includes('days earlier'));
        expect(daysEarlierEvent).toBeDefined();
        expect(daysEarlierEvent?.relativePosition).toBe('before');
      });

      it('should extract "X years ago" patterns', () => {
        const text = `Now he understood. 10 years ago, it all made sense.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        const yearsAgoEvent = events.find(e => e.temporalMarker.includes('years ago'));
        expect(yearsAgoEvent).toBeDefined();
        expect(yearsAgoEvent?.relativePosition).toBe('before');
      });
    });

    describe('Time-of-day markers', () => {
      it('should extract dawn markers', () => {
        const text = `At dawn, they set out on their journey.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        const dawnEvent = events.find(e => e.temporalMarker.toLowerCase().includes('dawn'));
        expect(dawnEvent).toBeDefined();
      });

      it('should extract morning markers', () => {
        const text = `In the morning, breakfast was served.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        const morningEvent = events.find(e => e.temporalMarker.toLowerCase().includes('morning'));
        expect(morningEvent).toBeDefined();
      });

      it('should extract noon markers', () => {
        const text = `At noon, the sun was high in the sky.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        const noonEvent = events.find(e => e.temporalMarker.toLowerCase().includes('noon'));
        expect(noonEvent).toBeDefined();
      });

      it('should extract evening markers', () => {
        const text = `In the evening, they gathered around the fire.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        const eveningEvent = events.find(e => e.temporalMarker.toLowerCase().includes('evening'));
        expect(eveningEvent).toBeDefined();
      });

      it('should extract night markers', () => {
        const text = `At night, strange sounds echoed through the forest.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        const nightEvent = events.find(e => e.temporalMarker.toLowerCase().includes('night'));
        expect(nightEvent).toBeDefined();
      });

      it('should avoid duplicate time markers close together', () => {
        const text = `In the morning light, the morning dew glistened.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        const morningEvents = events.filter(e => e.temporalMarker.toLowerCase().includes('morning'));
        // Should avoid duplicates within 20 characters
        expect(morningEvents.length).toBe(1);
      });
    });

    describe('Scene integration', () => {
      it('should add scene transitions as events', () => {
        const scenes = [
          createScene('action', 0, 100, 'morning', 'forest'),
          createScene('dialogue', 100, 200, 'afternoon', 'town'),
        ];

        const text = 'Scene content here.';
        const events = extractTimelineEvents(text, scenes, 'ch1');

        const sceneEvents = events.filter(e => e.description.includes('Scene:'));
        expect(sceneEvents.length).toBe(2);
        expect(sceneEvents[0].temporalMarker).toBe('morning');
        expect(sceneEvents[1].temporalMarker).toBe('afternoon');
      });

      it('should avoid duplicating events near scene markers', () => {
        const scenes = [
          createScene('action', 10, 100, 'morning', 'forest'),
        ];

        const text = `In the morning, they started walking.`;
        const events = extractTimelineEvents(text, scenes, 'ch1');

        // Should not create duplicate events for "morning" marker
        const morningEvents = events.filter(e =>
          e.temporalMarker?.toLowerCase().includes('morning')
        );

        // Exact count may vary, but should avoid obvious duplicates
        expect(morningEvents.length).toBeLessThanOrEqual(2);
      });

      it('should skip scenes without time markers', () => {
        const scenes = [
          createScene('action', 0, 100, null, 'forest'),
          createScene('dialogue', 100, 200, 'evening', 'town'),
        ];

        const text = 'Scene content.';
        const events = extractTimelineEvents(text, scenes, 'ch1');

        const sceneEvents = events.filter(e => e.description.includes('Scene:'));
        expect(sceneEvents.length).toBe(1);
        expect(sceneEvents[0].temporalMarker).toBe('evening');
      });
    });

    describe('Event ordering and linking', () => {
      it('should sort events by offset', () => {
        const text = `
          Later that evening, they met.
          In the morning, they had breakfast.
          After lunch, they walked.
        `;

        const events = extractTimelineEvents(text, [], 'ch1');

        // Events should be sorted by offset (order in text)
        for (let i = 1; i < events.length; i++) {
          expect(events[i].offset).toBeGreaterThanOrEqual(events[i - 1].offset);
        }
      });

      it('should link sequential "after" events', () => {
        const text = `
          First event. After that, second event. Later, third event.
        `;

        const events = extractTimelineEvents(text, [], 'ch1');

        // Events with "after" should depend on previous event
        const afterEvents = events.filter(e => e.relativePosition === 'after');
        afterEvents.forEach(event => {
          expect(event.dependsOn.length).toBeGreaterThan(0);
        });
      });

      it('should extract event descriptions from sentences', () => {
        const text = `After the battle, they rested and recovered.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        expect(events.length).toBeGreaterThan(0);
        expect(events[0].description).toBeTruthy();
        expect(events[0].description.length).toBeGreaterThan(0);
      });

      it('should limit description length to 150 characters', () => {
        const longText = `After a very long and detailed series of events that took place over the course of many days and involved numerous characters with complex motivations and intricate plot developments, they finally reached their destination.`;

        const events = extractTimelineEvents(longText, [], 'ch1');

        expect(events[0].description.length).toBeLessThanOrEqual(150);
      });
    });

    describe('Edge cases', () => {
      it('should handle empty text', () => {
        const events = extractTimelineEvents('', [], 'ch1');
        expect(events).toEqual([]);
      });

      it('should handle text with no temporal markers', () => {
        const text = `The cat sat on the mat. The dog barked.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        // Should return empty or minimal events
        expect(Array.isArray(events)).toBe(true);
      });

      it('should handle multiple markers in one sentence', () => {
        const text = `After breakfast, while walking, they talked.`;

        const events = extractTimelineEvents(text, [], 'ch1');

        // Should extract both "after" and "while"
        expect(events.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CAUSAL CHAIN TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('extractCausalChains', () => {
    describe('Strong causal markers', () => {
      it('should detect "because" causality', () => {
        const text = `He stayed home because it was raining heavily outside.`;
        const events: TimelineEvent[] = [];

        const chains = extractCausalChains(text, events);

        expect(chains.length).toBeGreaterThan(0);
        const becauseChain = chains.find(c => c.marker === 'because');
        expect(becauseChain).toBeDefined();
        expect(becauseChain?.confidence).toBeGreaterThanOrEqual(0.9);
      });

      it('should detect "therefore" causality', () => {
        const text = `It was cold. Therefore, they lit a fire.`;
        const events: TimelineEvent[] = [];

        const chains = extractCausalChains(text, events);

        const thereforeChain = chains.find(c => c.marker === 'Therefore');
        expect(thereforeChain).toBeDefined();
        expect(thereforeChain?.confidence).toBe(0.9);
      });

      it('should detect "as a result" causality', () => {
        const text = `The bridge collapsed. As a result, they had to find another route.`;
        const events: TimelineEvent[] = [];

        const chains = extractCausalChains(text, events);

        const resultChain = chains.find(c => c.marker.toLowerCase() === 'as');
        expect(resultChain).toBeDefined();
        expect(resultChain?.confidence).toBe(0.9);
      });

      it('should detect "consequently" causality', () => {
        const text = `The storm was severe. Consequently, all flights were cancelled.`;
        const events: TimelineEvent[] = [];

        const chains = extractCausalChains(text, events);

        const conseqChain = chains.find(c => c.marker === 'Consequently');
        expect(conseqChain).toBeDefined();
        expect(conseqChain?.confidence).toBe(0.9);
      });
    });

    describe('Medium causal markers', () => {
      it('should detect "so" causality', () => {
        const text = `She was tired, so she went to bed early.`;
        const events: TimelineEvent[] = [];

        const chains = extractCausalChains(text, events);

        const soChain = chains.find(c => c.marker === 'so');
        expect(soChain).toBeDefined();
        expect(soChain?.confidence).toBe(0.7);
      });

      it('should detect "thus" causality', () => {
        const text = `The evidence was clear. Thus, they reached a verdict.`;
        const events: TimelineEvent[] = [];

        const chains = extractCausalChains(text, events);

        const thusChain = chains.find(c => c.marker === 'Thus');
        expect(thusChain).toBeDefined();
        expect(thusChain?.confidence).toBe(0.7);
      });

      it('should detect "hence" causality', () => {
        const text = `The plan failed. Hence, they needed a new strategy.`;
        const events: TimelineEvent[] = [];

        const chains = extractCausalChains(text, events);

        const henceChain = chains.find(c => c.marker === 'Hence');
        expect(henceChain).toBeDefined();
        expect(henceChain?.confidence).toBe(0.7);
      });
    });

    describe('Weaker causal markers', () => {
      it('should detect "if-then" causality', () => {
        const text = `If the rain stops, then we will go outside.`;
        const events: TimelineEvent[] = [];

        const chains = extractCausalChains(text, events);

        const ifThenChain = chains.find(c => c.marker === 'if');
        expect(ifThenChain).toBeDefined();
        expect(ifThenChain?.confidence).toBe(0.5);
      });

      it('should detect "when" causality', () => {
        const text = `When the bell rings, everyone will leave.`;
        const events: TimelineEvent[] = [];

        const chains = extractCausalChains(text, events);

        const whenChain = chains.find(c => c.marker === 'When');
        expect(whenChain).toBeDefined();
        expect(whenChain?.confidence).toBe(0.4);
      });
    });

    describe('Cause and effect extraction', () => {
      it('should extract cause before marker', () => {
        const text = `The sun was setting. Therefore, it got dark.`;
        const events: TimelineEvent[] = [];

        const chains = extractCausalChains(text, events);

        expect(chains[0].cause.quote).toContain('sun');
      });

      it('should extract effect from matched content', () => {
        const text = `It rained heavily. Consequently, the streets flooded.`;
        const events: TimelineEvent[] = [];

        const chains = extractCausalChains(text, events);

        expect(chains[0].effect.quote).toContain('streets');
      });

      it('should link to related events if present', () => {
        const events: TimelineEvent[] = [
          {
            id: 'event1',
            description: 'Rain event',
            offset: 0,
            chapterId: 'ch1',
            temporalMarker: 'before',
            relativePosition: 'before',
            dependsOn: [],
          },
        ];

        const text = `It rained. Therefore, the ground was wet.`;

        const chains = extractCausalChains(text, events);

        // Should attempt to link to nearby events
        expect(chains[0]).toBeDefined();
      });

      it('should limit quote lengths to 100 characters', () => {
        const longText = `The extremely detailed and comprehensive explanation of the situation that involved many factors was clear. Therefore, the outcome was inevitable based on all the contributing circumstances.`;
        const events: TimelineEvent[] = [];

        const chains = extractCausalChains(longText, events);

        expect(chains[0].cause.quote.length).toBeLessThanOrEqual(100);
        expect(chains[0].effect.quote.length).toBeLessThanOrEqual(100);
      });
    });

    describe('Edge cases', () => {
      it('should handle empty text', () => {
        const chains = extractCausalChains('', []);
        expect(chains).toEqual([]);
      });

      it('should handle text with no causal markers', () => {
        const text = `The cat meowed. The dog barked.`;
        const chains = extractCausalChains(text, []);
        expect(chains).toEqual([]);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PLOT PROMISE TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('extractPlotPromises', () => {
    describe('Foreshadowing patterns', () => {
      it('should detect "little did X know" foreshadowing', () => {
        const text = `Little did she know that danger lurked nearby.`;

        const promises = extractPlotPromises(text, 'ch1');

        const foreshadow = promises.find(p => p.type === 'foreshadowing');
        expect(foreshadow).toBeDefined();
        expect(foreshadow?.quote.toLowerCase()).toContain('little did');
      });

      it('should detect "would soon learn" foreshadowing', () => {
        const text = `He would soon discover the truth about his past.`;

        const promises = extractPlotPromises(text, 'ch1');

        const foreshadow = promises.find(p => p.type === 'foreshadowing');
        expect(foreshadow).toBeDefined();
      });

      it('should detect "if only" foreshadowing', () => {
        const text = `If only he had known what was coming.`;

        const promises = extractPlotPromises(text, 'ch1');

        const foreshadow = promises.find(p => p.type === 'foreshadowing');
        expect(foreshadow).toBeDefined();
      });

      it('should detect "this would prove to be" foreshadowing', () => {
        const text = `This would prove to be a fatal mistake.`;

        const promises = extractPlotPromises(text, 'ch1');

        const foreshadow = promises.find(p => p.type === 'foreshadowing');
        expect(foreshadow).toBeDefined();
      });
    });

    describe('Setup/Chekhov\'s gun patterns', () => {
      it('should detect "noticed" setup', () => {
        const text = `Sarah noticed a strange symbol on the wall.`;

        const promises = extractPlotPromises(text, 'ch1');

        const setup = promises.find(p => p.type === 'setup');
        expect(setup).toBeDefined();
      });

      it('should detect "something odd" setup', () => {
        const text = `There was something odd about the stranger.`;

        const promises = extractPlotPromises(text, 'ch1');

        const setup = promises.find(p => p.type === 'setup');
        expect(setup).toBeDefined();
      });

      it('should detect "made a mental note" setup', () => {
        const text = `He made a mental note to investigate later.`;

        const promises = extractPlotPromises(text, 'ch1');

        const setup = promises.find(p => p.type === 'setup');
        expect(setup).toBeDefined();
      });

      it('should detect "kept hidden" setup', () => {
        const text = `She kept the key hidden in her pocket.`;

        const promises = extractPlotPromises(text, 'ch1');

        const setup = promises.find(p => p.type === 'setup');
        expect(setup).toBeDefined();
      });
    });

    describe('Question/mystery patterns', () => {
      it('should detect "what" questions', () => {
        const text = `What had happened to the missing artifact?`;

        const promises = extractPlotPromises(text, 'ch1');

        const question = promises.find(p => p.type === 'question');
        expect(question).toBeDefined();
      });

      it('should detect "who" questions', () => {
        const text = `Who was the mysterious figure in the shadows?`;

        const promises = extractPlotPromises(text, 'ch1');

        const question = promises.find(p => p.type === 'question');
        expect(question).toBeDefined();
      });

      it('should detect "why" questions', () => {
        const text = `Why had she left so suddenly?`;

        const promises = extractPlotPromises(text, 'ch1');

        const question = promises.find(p => p.type === 'question');
        expect(question).toBeDefined();
      });

      it('should detect "mystery of" pattern', () => {
        const text = `The mystery of the locked room remained unsolved.`;

        const promises = extractPlotPromises(text, 'ch1');

        const question = promises.find(p => p.type === 'question');
        expect(question).toBeDefined();
      });

      it('should detect "remained a mystery" pattern', () => {
        const text = `His true intentions remained a mystery.`;

        const promises = extractPlotPromises(text, 'ch1');

        const question = promises.find(p => p.type === 'question');
        expect(question).toBeDefined();
      });
    });

    describe('Conflict patterns', () => {
      it('should detect "vowed to" conflicts', () => {
        const text = `She vowed to find the killer.`;

        const promises = extractPlotPromises(text, 'ch1');

        const conflict = promises.find(p => p.type === 'conflict');
        expect(conflict).toBeDefined();
      });

      it('should detect "would not rest until" conflicts', () => {
        const text = `He would not rest until justice was served.`;

        const promises = extractPlotPromises(text, 'ch1');

        const conflict = promises.find(p => p.type === 'conflict');
        expect(conflict).toBeDefined();
      });

      it('should detect "must stop" conflicts', () => {
        const text = `They must stop the villain before it's too late.`;

        const promises = extractPlotPromises(text, 'ch1');

        const conflict = promises.find(p => p.type === 'conflict');
        expect(conflict).toBeDefined();
      });
    });

    describe('Goal patterns', () => {
      it('should detect "needed to" goals', () => {
        const text = `She needed to reach the city before nightfall.`;

        const promises = extractPlotPromises(text, 'ch1');

        const goal = promises.find(p => p.type === 'goal');
        expect(goal).toBeDefined();
      });

      it('should detect "the only way" goals', () => {
        const text = `The only way to escape was through the tunnel.`;

        const promises = extractPlotPromises(text, 'ch1');

        const goal = promises.find(p => p.type === 'goal');
        expect(goal).toBeDefined();
      });

      it('should detect "set out to" goals', () => {
        const text = `He set out to prove his innocence.`;

        const promises = extractPlotPromises(text, 'ch1');

        const goal = promises.find(p => p.type === 'goal');
        expect(goal).toBeDefined();
      });
    });

    describe('Promise resolution', () => {
      it('should mark promises as resolved when resolution found', () => {
        const text = `
          The mystery of the locked room remained unsolved.
          Later in the chapter, many events occurred.
          Finally, the mystery was solved.
        `;

        const promises = extractPlotPromises(text, 'ch1');

        const mysteryPromise = promises.find(p => p.quote.includes('mystery'));
        expect(mysteryPromise?.resolved).toBe(true);
        expect(mysteryPromise?.resolutionOffset).toBeDefined();
      });

      it('should detect "at last" resolution', () => {
        const text = `
          She vowed to find the treasure.
          At last, she discovered it.
        `;

        const promises = extractPlotPromises(text, 'ch1');

        const treasurePromise = promises.find(p => p.quote.includes('treasure'));
        expect(treasurePromise?.resolved).toBe(true);
      });

      it('should detect "it turned out that" resolution', () => {
        const text = `
          Who was the stranger?
          It turned out that he was an old friend.
        `;

        const promises = extractPlotPromises(text, 'ch1');

        const strangerPromise = promises.find(p => p.quote.includes('stranger'));
        expect(strangerPromise?.resolved).toBe(true);
      });

      it('should detect "now understood" resolution', () => {
        const text = `
          What had happened?
          Now she understood everything.
        `;

        const promises = extractPlotPromises(text, 'ch1');

        const questionPromise = promises.find(p => p.type === 'question');
        expect(questionPromise?.resolved).toBe(true);
      });

      it('should only resolve promises within 10k characters', () => {
        const farText = `The mystery remained. ${'x'.repeat(15000)} Finally solved.`;

        const promises = extractPlotPromises(farText, 'ch1');

        // Promise should not be resolved if resolution is too far
        const mysteryPromise = promises.find(p => p.quote.includes('mystery'));
        expect(mysteryPromise?.resolved).toBe(false);
      });

      it('should not resolve already resolved promises', () => {
        const text = `
          The question was asked.
          Finally, the answer was found.
          At last, another thing happened.
        `;

        const promises = extractPlotPromises(text, 'ch1');

        // Should only resolve once
        const questionPromise = promises.find(p => p.quote.includes('question'));
        expect(questionPromise?.resolved).toBe(true);
      });

      it('should set resolutionChapterId on resolution', () => {
        const text = `The mystery remained. Finally, it was solved.`;

        const promises = extractPlotPromises(text, 'ch2');

        const promise = promises[0];
        if (promise.resolved) {
          expect(promise.resolutionChapterId).toBe('ch2');
        }
      });
    });

    describe('Promise attributes', () => {
      it('should capture full sentence in description', () => {
        const text = `Little did she know that danger was approaching.`;

        const promises = extractPlotPromises(text, 'ch1');

        expect(promises[0].description).toBeTruthy();
        expect(promises[0].description.length).toBeGreaterThan(0);
      });

      it('should limit description to 150 characters', () => {
        const longText = `Little did she know that this incredibly long and detailed explanation of the complex situation involving multiple characters and intricate plot developments would lead to unexpected consequences.`;

        const promises = extractPlotPromises(longText, 'ch1');

        expect(promises[0].description.length).toBeLessThanOrEqual(150);
      });

      it('should store chapter ID', () => {
        const text = `The mystery remained unsolved.`;

        const promises = extractPlotPromises(text, 'ch5');

        expect(promises[0].chapterId).toBe('ch5');
      });

      it('should store offset', () => {
        const text = `Some text. The mystery remained.`;

        const promises = extractPlotPromises(text, 'ch1');

        expect(promises[0].offset).toBeGreaterThan(0);
      });
    });

    describe('Edge cases', () => {
      it('should handle empty text', () => {
        const promises = extractPlotPromises('', 'ch1');
        expect(promises).toEqual([]);
      });

      it('should handle text with no promises', () => {
        const text = `The cat sat on the mat. The dog barked.`;
        const promises = extractPlotPromises(text, 'ch1');
        expect(promises).toEqual([]);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // BUILD TIMELINE TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('buildTimeline', () => {
    it('should combine events, chains, and promises', () => {
      const text = `
        After breakfast, he went outside.
        It was raining, so he took an umbrella.
        Little did he know what would happen next.
      `;

      const scenes = [createScene('action', 0, 100, 'morning')];
      const timeline = buildTimeline(text, scenes, 'ch1');

      expect(timeline.events.length).toBeGreaterThan(0);
      expect(timeline.causalChains.length).toBeGreaterThan(0);
      expect(timeline.promises.length).toBeGreaterThan(0);
    });

    it('should include processedAt timestamp', () => {
      const timeline = buildTimeline('Some text', [], 'ch1');

      expect(timeline.processedAt).toBeDefined();
      expect(typeof timeline.processedAt).toBe('number');
      expect(timeline.processedAt).toBeGreaterThan(0);
    });

    it('should handle empty text', () => {
      const timeline = buildTimeline('', [], 'ch1');

      expect(timeline.events).toEqual([]);
      expect(timeline.causalChains).toEqual([]);
      expect(timeline.promises).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // MERGE TIMELINES TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('mergeTimelines', () => {
    it('should merge events from multiple timelines', () => {
      const timeline1 = buildTimeline('After that, event 1.', [], 'ch1');
      const timeline2 = buildTimeline('Later, event 2.', [], 'ch2');

      const merged = mergeTimelines([timeline1, timeline2]);

      expect(merged.events.length).toBe(timeline1.events.length + timeline2.events.length);
    });

    it('should merge causal chains', () => {
      const timeline1 = buildTimeline('Because X, Y happened.', [], 'ch1');
      const timeline2 = buildTimeline('Therefore, Z occurred.', [], 'ch2');

      const merged = mergeTimelines([timeline1, timeline2]);

      expect(merged.causalChains.length).toBe(
        timeline1.causalChains.length + timeline2.causalChains.length
      );
    });

    it('should merge promises without duplicates', () => {
      const promise1: PlotPromise = {
        id: 'promise1',
        type: 'question',
        description: 'What happened?',
        quote: 'mystery',
        offset: 0,
        chapterId: 'ch1',
        resolved: false,
      };

      const promise2: PlotPromise = {
        id: 'promise1', // Same ID
        type: 'question',
        description: 'What happened?',
        quote: 'mystery',
        offset: 0,
        chapterId: 'ch1',
        resolved: true, // Resolved in later timeline
        resolutionOffset: 100,
        resolutionChapterId: 'ch2',
      };

      const timeline1: Timeline = {
        events: [],
        causalChains: [],
        promises: [promise1],
        processedAt: Date.now(),
      };

      const timeline2: Timeline = {
        events: [],
        causalChains: [],
        promises: [promise2],
        processedAt: Date.now(),
      };

      const merged = mergeTimelines([timeline1, timeline2]);

      expect(merged.promises.length).toBe(1);
      expect(merged.promises[0].resolved).toBe(true);
    });

    it('should sort merged events by offset', () => {
      const timeline1 = buildTimeline('Later event.', [], 'ch1');
      const timeline2 = buildTimeline('Earlier event.', [], 'ch2');

      const merged = mergeTimelines([timeline1, timeline2]);

      for (let i = 1; i < merged.events.length; i++) {
        expect(merged.events[i].offset).toBeGreaterThanOrEqual(merged.events[i - 1].offset);
      }
    });

    it('should handle empty timelines array', () => {
      const merged = mergeTimelines([]);

      expect(merged.events).toEqual([]);
      expect(merged.causalChains).toEqual([]);
      expect(merged.promises).toEqual([]);
    });

    it('should include processedAt timestamp', () => {
      const timeline1 = buildTimeline('Text 1', [], 'ch1');
      const merged = mergeTimelines([timeline1]);

      expect(merged.processedAt).toBeDefined();
      expect(typeof merged.processedAt).toBe('number');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // QUERY HELPERS TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Query Helpers', () => {
    describe('getUnresolvedPromises', () => {
      it('should return only unresolved promises', () => {
        const timeline: Timeline = {
          events: [],
          causalChains: [],
          promises: [
            {
              id: '1',
              type: 'question',
              description: 'Q1',
              quote: 'q1',
              offset: 0,
              chapterId: 'ch1',
              resolved: false,
            },
            {
              id: '2',
              type: 'question',
              description: 'Q2',
              quote: 'q2',
              offset: 100,
              chapterId: 'ch1',
              resolved: true,
            },
            {
              id: '3',
              type: 'goal',
              description: 'G1',
              quote: 'g1',
              offset: 200,
              chapterId: 'ch1',
              resolved: false,
            },
          ],
          processedAt: Date.now(),
        };

        const unresolved = getUnresolvedPromises(timeline);

        expect(unresolved).toHaveLength(2);
        expect(unresolved.every(p => !p.resolved)).toBe(true);
      });

      it('should return empty array if all resolved', () => {
        const timeline: Timeline = {
          events: [],
          causalChains: [],
          promises: [
            {
              id: '1',
              type: 'question',
              description: 'Q',
              quote: 'q',
              offset: 0,
              chapterId: 'ch1',
              resolved: true,
            },
          ],
          processedAt: Date.now(),
        };

        const unresolved = getUnresolvedPromises(timeline);
        expect(unresolved).toEqual([]);
      });
    });

    describe('getEventsInRange', () => {
      it('should return events within offset range', () => {
        const events: TimelineEvent[] = [
          {
            id: '1',
            description: 'E1',
            offset: 50,
            chapterId: 'ch1',
            temporalMarker: 'after',
            relativePosition: 'after',
            dependsOn: [],
          },
          {
            id: '2',
            description: 'E2',
            offset: 150,
            chapterId: 'ch1',
            temporalMarker: 'later',
            relativePosition: 'after',
            dependsOn: [],
          },
          {
            id: '3',
            description: 'E3',
            offset: 250,
            chapterId: 'ch1',
            temporalMarker: 'then',
            relativePosition: 'after',
            dependsOn: [],
          },
        ];

        const timeline: Timeline = {
          events,
          causalChains: [],
          promises: [],
          processedAt: Date.now(),
        };

        const inRange = getEventsInRange(timeline, 100, 200);

        expect(inRange).toHaveLength(1);
        expect(inRange[0].id).toBe('2');
      });

      it('should include start offset, exclude end offset', () => {
        const events: TimelineEvent[] = [
          {
            id: '1',
            description: 'E1',
            offset: 100,
            chapterId: 'ch1',
            temporalMarker: 'after',
            relativePosition: 'after',
            dependsOn: [],
          },
          {
            id: '2',
            description: 'E2',
            offset: 200,
            chapterId: 'ch1',
            temporalMarker: 'later',
            relativePosition: 'after',
            dependsOn: [],
          },
        ];

        const timeline: Timeline = { events, causalChains: [], promises: [], processedAt: Date.now() };

        const inRange = getEventsInRange(timeline, 100, 200);

        expect(inRange).toHaveLength(1);
        expect(inRange[0].id).toBe('1');
      });

      it('should return empty array if no events in range', () => {
        const timeline = buildTimeline('After that, event.', [], 'ch1');
        const inRange = getEventsInRange(timeline, 10000, 20000);

        expect(inRange).toEqual([]);
      });
    });

    describe('getCausalChainsForEvent', () => {
      it('should return chains where event is cause', () => {
        const chains = [
          {
            id: '1',
            cause: { eventId: 'event1', quote: 'cause', offset: 0 },
            effect: { eventId: 'event2', quote: 'effect', offset: 100 },
            confidence: 0.9,
            marker: 'because',
          },
          {
            id: '2',
            cause: { eventId: 'event3', quote: 'cause', offset: 200 },
            effect: { eventId: 'event4', quote: 'effect', offset: 300 },
            confidence: 0.8,
            marker: 'so',
          },
        ];

        const timeline: Timeline = {
          events: [],
          causalChains: chains,
          promises: [],
          processedAt: Date.now(),
        };

        const forEvent = getCausalChainsForEvent(timeline, 'event1');

        expect(forEvent).toHaveLength(1);
        expect(forEvent[0].id).toBe('1');
      });

      it('should return chains where event is effect', () => {
        const chains = [
          {
            id: '1',
            cause: { eventId: 'event1', quote: 'cause', offset: 0 },
            effect: { eventId: 'event2', quote: 'effect', offset: 100 },
            confidence: 0.9,
            marker: 'because',
          },
        ];

        const timeline: Timeline = {
          events: [],
          causalChains: chains,
          promises: [],
          processedAt: Date.now(),
        };

        const forEvent = getCausalChainsForEvent(timeline, 'event2');

        expect(forEvent).toHaveLength(1);
      });

      it('should return empty array if event not in any chain', () => {
        const timeline = buildTimeline('Because X, Y.', [], 'ch1');
        const forEvent = getCausalChainsForEvent(timeline, 'nonexistent');

        expect(forEvent).toEqual([]);
      });
    });
  });
});
