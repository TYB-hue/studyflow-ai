import type { StudyDocument, Question, Flashcard } from '@/lib/types';
export const demoDocuments: StudyDocument[] = [
  {
    id: 'demo-biology',
    title: 'Cell biology · Lecture 04',
    subject: 'Biology',
    status: 'ready',
    created_at: '2026-10-12T10:00:00Z',
    summary:
      'THE BIG PICTURE\nCells are the basic units of life. Their specialized organelles work together to maintain homeostasis. (p. 1)\n\nKEY CONCEPTS\nThe nucleus stores DNA and controls gene expression. Mitochondria convert energy from nutrients into ATP through cellular respiration. The plasma membrane controls transport using a phospholipid bilayer. (p. 1)\n\nREMEMBER THIS\nStructure supports function: folded mitochondrial membranes create more surface area for ATP production. (p. 2)',
    error: null,
  },
  {
    id: 'demo-psych',
    title: 'Memory & learning',
    subject: 'Psychology',
    status: 'ready',
    created_at: '2026-10-11T10:00:00Z',
    summary: null,
    error: null,
  },
  {
    id: 'demo-math',
    title: 'Introduction to derivatives',
    subject: 'Mathematics',
    status: 'ready',
    created_at: '2026-10-10T10:00:00Z',
    summary: null,
    error: null,
  },
];
export const demoQuestions: Question[] = [
  {
    question: 'Which organelle produces ATP through cellular respiration?',
    options: ['Nucleus', 'Mitochondrion', 'Golgi apparatus', 'Lysosome'],
    answer: 1,
    explanation: 'Mitochondria convert energy from nutrients into ATP. (p. 1)',
  },
  {
    question: 'What is the primary role of the plasma membrane?',
    options: ['Storing DNA', 'Producing ribosomes', 'Controlling transport', 'Digesting proteins'],
    answer: 2,
    explanation: 'The phospholipid bilayer controls what enters and leaves the cell. (p. 1)',
  },
  {
    question: 'Why is the inner mitochondrial membrane folded?',
    options: [
      'To store water',
      'To increase surface area',
      'To protect DNA',
      'To make the cell larger',
    ],
    answer: 1,
    explanation: 'Folds provide more surface area for ATP production. (p. 2)',
  },
];
export const demoCards: Flashcard[] = [
  {
    front: 'What is the main function of mitochondria?',
    back: 'Produce ATP through cellular respiration. (p. 1)',
  },
  {
    front: 'What does the nucleus contain?',
    back: 'DNA, which stores the genetic instructions of the cell. (p. 1)',
  },
  {
    front: 'What makes up the plasma membrane?',
    back: 'A phospholipid bilayer that regulates transport. (p. 1)',
  },
];
