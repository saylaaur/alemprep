import type { QuestionVersion } from '@/lib/content/versions';

export function versionFixture(): QuestionVersion {
  return {
    id: '47a9e484-eeb4-4e03-bcfe-057411592a16',
    questionId: '7026ee89-60a6-421e-a2f9-6875c87ce9f9',
    familyId: 'a6cc04ec-ce7f-4386-972b-1bfe62a92e27',
    revision: 1,
    locale: 'kk',
    type: 'single',
    topicLabel: 'Логарифмдер',
    publicBody: {
      stem: 'Тест сұрағы',
      options: [
        { id: 'A', content: 'A нұсқасы' },
        { id: 'B', content: 'B нұсқасы' },
      ],
    },
    gradingBody: {
      stem: 'Тест сұрағы',
      options: [
        { id: 'A', content: 'A нұсқасы' },
        { id: 'B', content: 'B нұсқасы' },
      ],
      correct: 'A',
    },
    explanation: {
      blocks: [{ type: 'text', value: 'EXPLANATION_PRIVATE_MARKER' }],
    },
    contextSnapshot: null,
    contentHash: 'sha256:fixture',
  };
}
