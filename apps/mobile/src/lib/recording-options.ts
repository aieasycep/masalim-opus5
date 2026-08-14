import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio';
import {
  MIC_TEST_RECORDING_FORMAT,
  VOICE_RECORDING_FORMAT,
  type RecordingFormat,
} from './recording';

/**
 * Turns a format into the settings `expo-audio` wants on each platform.
 *
 * Written out in full rather than spread from `RecordingPresets.HIGH_QUALITY`:
 * the presets are typed as an open record, so under `noUncheckedIndexedAccess`
 * reading one yields `RecordingOptions | undefined`, and spreading that quietly
 * makes every field optional — the settings would silently become whatever the
 * platform defaults to, which for a voice clone is not a guess worth taking.
 */
function toRecordingOptions(format: RecordingFormat, quality: AudioQuality): RecordingOptions {
  return {
    extension: format.extension,
    sampleRate: format.sampleRate,
    numberOfChannels: format.channels,
    bitRate: format.bitRate,
    isMeteringEnabled: true,
    android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
    ios: {
      outputFormat: IOSOutputFormat.MPEG4AAC,
      audioQuality: quality,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: { mimeType: 'audio/webm', bitsPerSecond: format.bitRate },
  };
}

export const VOICE_RECORDING_OPTIONS = toRecordingOptions(
  VOICE_RECORDING_FORMAT,
  AudioQuality.MAX,
);

export const MIC_TEST_RECORDING_OPTIONS = toRecordingOptions(
  MIC_TEST_RECORDING_FORMAT,
  AudioQuality.LOW,
);
