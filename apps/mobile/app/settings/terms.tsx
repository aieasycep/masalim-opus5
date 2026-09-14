import { PolicyScreen } from '../../src/components/PolicyScreen';

/** The terms of use, summarised in-app and hosted in full. */
export default function TermsScreen() {
  return (
    <PolicyScreen
      titleKey="settings.terms"
      summaryKey="settings.aiInfoBody"
      url="https://masalim.app/kosullar"
    />
  );
}
