import { describe, expect, it } from 'vitest';
import { MIC_TEST, UPLOAD_CONSTRAINTS } from '@masalim/types';
import {
  MIC_TEST_RECORDING_FORMAT,
  VOICE_RECORDING_FORMAT,
  meterLevel,
  micTestVerdict,
} from './recording';

describe('voice recording format', () => {
  /**
   * The contract that would otherwise break on a parent's device.
   *
   * The recorder settings live here and the upload rules live in the shared
   * types package, and nothing connects them at compile time. If the two drift,
   * the failure lands after a parent has read sixty seconds aloud — the worst
   * possible moment to discover a mismatched container.
   */
  it('records something the upload endpoint will accept', () => {
    const allowed = UPLOAD_CONSTRAINTS.VOICE_RECORDING;

    expect(allowed.allowedMimeTypes).toContain(VOICE_RECORDING_FORMAT.contentType);
    expect(allowed.allowedExtensions).toContain(VOICE_RECORDING_FORMAT.extension);
  });

  it('records one channel, because a cloned voice is one person', () => {
    expect(VOICE_RECORDING_FORMAT.channels).toBe(1);
  });

  /**
   * A two-minute ceiling at this bitrate has to fit the upload limit with room to
   * spare, or the longest permitted recording is one the server refuses.
   */
  it('cannot produce a file larger than the upload allows', () => {
    const maxSeconds = 120;
    const bytes = (VOICE_RECORDING_FORMAT.bitRate / 8) * maxSeconds;

    expect(bytes).toBeLessThan(UPLOAD_CONSTRAINTS.VOICE_RECORDING.maxBytes);
  });

  it('keeps the throwaway mic test cheaper than the real take', () => {
    expect(MIC_TEST_RECORDING_FORMAT.bitRate).toBeLessThan(VOICE_RECORDING_FORMAT.bitRate);
    expect(MIC_TEST_RECORDING_FORMAT.sampleRate).toBeLessThan(VOICE_RECORDING_FORMAT.sampleRate);
  });
});

describe('mic test verdict', () => {
  /**
   * dBFS is negative below full scale. Every one of these would pass with the
   * comparisons inverted *except* for what they assert about direction, which is
   * the entire point of the test.
   */
  it('calls a quiet room quiet when speech is clearly audible', () => {
    expect(micTestVerdict({ peakDbfs: -12, floorDbfs: -55 })).toBe('quiet');
  });

  it('hears background noise when the floor never drops', () => {
    expect(micTestVerdict({ peakDbfs: -12, floorDbfs: -30 })).toBe('noisy');
  });

  it('says it can barely hear a parent speaking too softly', () => {
    expect(micTestVerdict({ peakDbfs: -48, floorDbfs: -70 })).toBe('tooQuiet');
  });

  /**
   * A phone across the room in a noisy kitchen trips both. Being told to speak up
   * is the useful half — moving closer fixes the level *and* the apparent noise,
   * whereas "it is noisy here" invites a parent to go and shut a window that was
   * never the problem.
   */
  it('leads with the level when both are wrong', () => {
    expect(micTestVerdict({ peakDbfs: -50, floorDbfs: -20 })).toBe('tooQuiet');
  });

  it('uses the same thresholds the server checks against', () => {
    const quietest = MIC_TEST.QUIET_ENVIRONMENT_MAX_NOISE_DBFS;
    const speech = MIC_TEST.GOOD_SPEECH_MIN_DBFS;

    // Exactly at the threshold is acceptable, not a rejection.
    expect(micTestVerdict({ peakDbfs: speech, floorDbfs: quietest })).toBe('quiet');
    expect(micTestVerdict({ peakDbfs: speech - 0.1, floorDbfs: quietest })).toBe('tooQuiet');
    expect(micTestVerdict({ peakDbfs: speech, floorDbfs: quietest + 0.1 })).toBe('noisy');
  });
});

describe('meter level', () => {
  it.each([
    [0, 1],
    [-30, 0.5],
    [-60, 0],
  ])('maps %s dBFS to %s', (dbfs, expected) => {
    expect(meterLevel(dbfs)).toBeCloseTo(expected, 5);
  });

  it('clamps rather than driving the bar off either end', () => {
    expect(meterLevel(-160)).toBe(0);
    expect(meterLevel(12)).toBe(1);
  });
});
