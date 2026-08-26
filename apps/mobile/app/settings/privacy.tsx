import { PolicyScreen } from '../../src/components/PolicyScreen';

/** The privacy policy, summarised in-app and hosted in full. */
export default function PrivacyScreen() {
  return (
    <PolicyScreen
      titleKey="settings.privacyPolicy"
      summaryKey="settings.voiceDataBody"
      url="https://masalim.app/gizlilik"
    />
  );
}
