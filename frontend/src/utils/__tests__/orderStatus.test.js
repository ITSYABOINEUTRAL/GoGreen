import {
  ALL_STATUSES,
  TIMELINE_STEPS,
  STATUS_STYLE,
  STATUS_ICON,
  getTimeline,
} from '../orderStatus';

describe('orderStatus', () => {
  describe('getTimeline — known timeline statuses', () => {
    it('marks only the matching step as current', () => {
      const timeline = getTimeline('processing');
      const current = timeline.filter((s) => s.current);
      expect(current).toHaveLength(1);
      expect(current[0].step).toBe('processing');
    });

    it('marks all steps up to and including current as completed', () => {
      const timeline = getTimeline('shipped');
      const shippedIdx = TIMELINE_STEPS.indexOf('shipped');
      timeline.forEach((s, i) => {
        expect(s.completed).toBe(i <= shippedIdx);
      });
    });

    it('returns terminal: false for timeline statuses', () => {
      getTimeline('pending').forEach((s) => expect(s.terminal).toBe(false));
    });
  });

  describe('getTimeline — off-timeline but valid statuses', () => {
    const offTimeline = ['disputed', 'cancelled', 'refunded', 'failed'];

    it.each(offTimeline)('returns all steps current=false and completed=false for "%s"', (status) => {
      const timeline = getTimeline(status);
      timeline.forEach((s) => {
        expect(s.current).toBe(false);
        expect(s.completed).toBe(false);
        expect(s.terminal).toBe(true);
      });
    });

    it('is distinguishable from "pending" (terminal flag)', () => {
      const cancelled = getTimeline('cancelled');
      const pending = getTimeline('pending');
      expect(cancelled[0].terminal).toBe(true);
      expect(pending[0].terminal).toBe(false);
    });
  });

  describe('getTimeline — unknown statuses', () => {
    it('throws for an unknown status string', () => {
      expect(() => getTimeline('unknown_status')).toThrow(/Unknown order status/);
    });

    it('throws for an empty string', () => {
      expect(() => getTimeline('')).toThrow();
    });
  });

  describe('STATUS_STYLE', () => {
    it('has an entry for every status in ALL_STATUSES', () => {
      ALL_STATUSES.forEach((s) => {
        expect(STATUS_STYLE[s]).toBeDefined();
        expect(STATUS_STYLE[s]).toHaveProperty('bg');
        expect(STATUS_STYLE[s]).toHaveProperty('color');
      });
    });
  });

  describe('STATUS_ICON', () => {
    it('has an icon for every status in ALL_STATUSES', () => {
      ALL_STATUSES.forEach((s) => {
        expect(STATUS_ICON[s]).toBeDefined();
        expect(typeof STATUS_ICON[s]).toBe('string');
      });
    });
  });
});
