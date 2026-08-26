import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Avatar, ConfirmDialog, OptionCard } from '@masalim/ui';
import { ANALYTICS_EVENTS } from '@masalim/types';
import { analytics } from '../../src/lib/analytics';
import { useChildren } from '../../src/hooks/queries';
import { useWizard } from '../../src/stores/wizard';
import { useSession } from '../../src/stores/session';
import { useI18n } from '../../src/i18n';
import { WizardStep } from '../../src/components/WizardStep';

/**
 * Step 1 — who the story is for.
 *
 * Also where a saved draft is offered back. Restoring is a question rather than
 * an assumption: a parent returning days later usually wants a fresh start, and
 * silently repopulating six steps with someone else's answers is worse than
 * asking once.
 */
export default function CreateChildStep() {
  const router = useRouter();
  const { t } = useI18n();
  const { data: children = [] } = useChildren();
  const draft = useWizard((state) => state.draft);
  const update = useWizard((state) => state.update);
  const reset = useWizard((state) => state.reset);
  const hasProgress = useWizard((state) => state.hasProgress);
  const selectedChildId = useSession((state) => state.selectedChildId);

  const [askedAboutDraft, setAskedAboutDraft] = useState(false);
  const [offerRestore, setOfferRestore] = useState(false);

  useEffect(() => {
    if (askedAboutDraft) return;
    setAskedAboutDraft(true);
    analytics.capture(ANALYTICS_EVENTS.STORY_CREATION_STARTED);
    if (hasProgress()) setOfferRestore(true);
    else if (selectedChildId) update({ childId: selectedChildId });
  }, [askedAboutDraft, hasProgress, selectedChildId, update]);

  return (
    <>
      <WizardStep
        step={1}
        title={t('storyCreate.step1Title')}
        subtitle={t('storyCreate.step1Subtitle')}
        canContinue
        onContinue={() => {
          analytics.capture(ANALYTICS_EVENTS.STORY_CREATION_STEP_COMPLETED, {
            step: 'child',
            step_index: 1,
            for_child: draft.childId !== null,
          });
          router.push('/create/hero');
        }}
      >
        {children.map((child) => (
          <OptionCard
            key={child.id}
            title={child.name}
            description={t('common.yearsOld', { count: child.ageInYears ?? '' })}
            leading={<Avatar name={child.name} imageUrl={child.avatarUrl} size={40} />}
            selected={draft.childId === child.id}
            onPress={() => {
              update({ childId: child.id });
            }}
          />
        ))}

        <OptionCard
          title={t('storyCreate.generalStory')}
          emoji="✨"
          selected={draft.childId === null}
          onPress={() => {
            update({ childId: null });
          }}
        />
      </WizardStep>

      <ConfirmDialog
        visible={offerRestore}
        title={t('storyCreate.restoreTitle')}
        message={t('storyCreate.restoreBody')}
        confirmLabel={t('common.continue')}
        cancelLabel={t('storyCreate.restoreDiscard')}
        onConfirm={() => {
          setOfferRestore(false);
        }}
        onCancel={() => {
          reset();
          if (selectedChildId) update({ childId: selectedChildId });
          setOfferRestore(false);
        }}
      />
    </>
  );
}
