'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Sparkles,
  MessageSquare,
  FileText,
  Brain,
  Layers,
  Send,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Trash2,
  BookOpen,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StudyDocument, Question, Flashcard, Source, StudyResult } from '@/lib/types';
import { demoQuestions, demoCards } from '@/lib/demo';
type Artifact = { id: string; kind: string; content: StudyResult };
export function Workspace({
  demo,
  document: doc,
  artifacts,
  initialError,
}: {
  demo: boolean;
  document: StudyDocument;
  artifacts: Artifact[];
  initialError?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState('chat');
  const [scopes, setScopes] = useState<Record<string, string>>(
    Object.fromEntries(artifacts.map((a) => [a.kind, a.content.scopeNote || ''])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError || '');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<{ role: string; text: string; sources?: Source[] }[]>(
    [],
  );
  const [summary, setSummary] = useState(
    doc.summary || artifacts.find((a) => a.kind === 'summary')?.content.summary || '',
  );
  const [questions, setQuestions] = useState<Question[]>(
    artifacts.find((a) => a.kind === 'quiz')?.content.questions || [],
  );
  const [quizId, setQuizId] = useState(artifacts.find((a) => a.kind === 'quiz')?.id);
  const [cards, setCards] = useState<Flashcard[]>(
    artifacts.find((a) => a.kind === 'flashcards')?.content.cards || [],
  );
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [card, setCard] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function generate(action: string, question?: string) {
    setBusy(true);
    setError('');
    try {
      if (demo) {
        if (doc.id !== 'demo-biology') {
          throw new Error(
            'This sample has no generated content. Open Cell biology for the interactive demo.',
          );
        }
        if (action === 'chat') {
          setMessages((m) => [
            ...m,
            { role: 'user', text: question! },
            {
              role: 'assistant',
              text: 'Sample answer: Mitochondria produce ATP through cellular respiration. Their folded inner membranes provide more surface area for ATP production. [1]',
              sources: [
                {
                  label: '1',
                  page: 1,
                  content:
                    'Mitochondria convert energy from nutrients into ATP through cellular respiration.',
                },
              ],
            },
          ]);
          setMessage('');
        } else if (action === 'quiz') {
          setQuestions(demoQuestions);
          setAnswers({});
          setSubmitted(false);
        } else if (action === 'flashcards') {
          setCards(demoCards);
          setCard(0);
          setFlipped(false);
        } else setSummary(doc.summary || '');
        return;
      }
      const response = await fetch('/api/study', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id, action, message: question }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (action !== 'chat')
        setScopes((previous) => ({ ...previous, [action]: data.scopeNote || '' }));
      if (action === 'chat') {
        setMessages((m) => [
          ...m,
          { role: 'user', text: question! },
          { role: 'assistant', text: data.answer, sources: data.sources },
        ]);
        setMessage('');
      } else if (action === 'summary') setSummary(data.summary);
      else if (action === 'quiz') {
        setQuestions(data.questions);
        setQuizId(data.artifactId);
        setAnswers({});
        setSubmitted(false);
      } else {
        setCards(data.cards);
        setCard(0);
        setFlipped(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function submitQuiz() {
    if (Object.keys(answers).length !== questions.length) return;
    setBusy(true);
    setError('');
    try {
      if (!demo) {
        const response = await fetch('/api/attempts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: doc.id,
            artifactId: quizId,
            answers: questions.map((_, i) => answers[i]),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
      }
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save progress.');
    } finally {
      setBusy(false);
    }
  }
  async function manage(method: 'POST' | 'DELETE') {
    if (demo) {
      setError('Sample materials cannot be changed.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/documents/${doc.id}`, { method });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      if (method === 'DELETE') router.push('/dashboard');
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <Link href={demo ? '/dashboard?demo=1' : '/dashboard'}>
          <ArrowLeft size={18} />
          Back to library
        </Link>
        <Link href="/dashboard" className="brand">
          <span className="brand-mark">
            <Sparkles size={19} />
          </span>
          StudyFlow<span className="brand-ai">AI</span>
        </Link>
      </header>
      <div className="workspace-body">
        {demo && (
          <div className="demo-banner">
            Interactive demo · Responses are prewritten samples, not live AI.
          </div>
        )}
        <div className="document-heading">
          <span className="doc-icon">
            <FileText size={27} />
          </span>
          <div>
            <span className="eyebrow">{doc.subject} / STUDY SPACE</span>
            <h1>{doc.title}</h1>
            <p className="muted">One document. So many ways to understand it.</p>
          </div>
          <button
            aria-label="Delete document"
            className="delete-button"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={18} />
          </button>
        </div>
        {confirmDelete && (
          <div className="notice">
            <p>Delete this material, its study resources, and quiz history?</p>
            <Button size="sm" onClick={() => manage('DELETE')} disabled={busy}>
              Delete material
            </Button>{' '}
            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {doc.status !== 'ready' ? (
          <section className="panel progress-panel">
            <BookOpen size={36} />
            <h2>
              {doc.status === 'failed'
                ? 'This material needs another look.'
                : 'Your material is being processed.'}
            </h2>
            <p>
              {(doc.error?.trim().startsWith('[')
                ? 'A page could not be processed. Blank-page handling has been fixed; retry this document.'
                : doc.error) ||
                'Gemini is reading your material and creating a searchable study source. Refresh in a moment.'}
            </p>
            {doc.status === 'failed' ||
            (doc.processing_started_at &&
              Date.now() - new Date(doc.processing_started_at).getTime() > 600000) ? (
              <Button disabled={busy} onClick={() => manage('POST')}>
                <RotateCcw size={16} />
                {busy ? 'Processing…' : 'Retry processing'}
              </Button>
            ) : (
              <Button onClick={() => router.refresh()} variant="outline">
                Refresh status
              </Button>
            )}
          </section>
        ) : (
          <>
            <div className="study-tabs" role="tablist" aria-label="Study tools">
              {[
                { id: 'chat', name: 'Ask your material', icon: MessageSquare },
                { id: 'summary', name: 'Summary', icon: FileText },
                { id: 'quiz', name: 'Practice quiz', icon: Brain },
                { id: 'flashcards', name: 'Flashcards', icon: Layers },
              ].map(({ id, name, icon: Icon }) => (
                <button
                  role="tab"
                  aria-selected={tab === id}
                  aria-controls="study-panel"
                  id={`tab-${id}`}
                  key={id}
                  className={tab === id ? 'selected' : ''}
                  onClick={() => setTab(id)}
                >
                  <Icon size={17} />
                  {name}
                </button>
              ))}
            </div>
            <section
              className="study-panel"
              id="study-panel"
              role="tabpanel"
              aria-labelledby={`tab-${tab}`}
            >
              {scopes[tab] && (
                <p className="notice" role="status">
                  {scopes[tab]}
                </p>
              )}
              {tab === 'chat' && (
                <div className="chat-area">
                  <div className="chat-messages">
                    {messages.length === 0 ? (
                      <div className="chat-welcome">
                        <span className="tool-icon">
                          <Sparkles size={29} />
                        </span>
                        <h2>A question is a great place to start.</h2>
                        <p>
                          Ask about a concept, connect the dots, or get a simpler explanation.
                          <br />
                          Answers are grounded in this material, with source excerpts.
                        </p>
                        <div className="suggestions">
                          {[
                            'What are the main ideas?',
                            'Explain a key concept simply',
                            'How do these concepts connect?',
                          ].map((s) => (
                            <button key={s} disabled={busy} onClick={() => generate('chat', s)}>
                              {s}
                              <ArrowLeft className="rotate-180" size={15} />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      messages.map((m, i) => (
                        <div key={i} className={`chat-message ${m.role}`}>
                          <span className="message-avatar">
                            {m.role === 'assistant' ? <Sparkles size={18} /> : 'You'}
                          </span>
                          <div>
                            <p className="whitespace-pre-wrap">{m.text}</p>
                            {m.sources?.map((s) => (
                              <details key={s.label} className="source">
                                <summary>
                                  Source [{s.label}] · Page {s.page}
                                </summary>
                                <p>{s.content}</p>
                              </details>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                    {busy && (
                      <p className="thinking" role="status">
                        Finding connections in your material…
                      </p>
                    )}
                  </div>
                  <form
                    className="chat-input"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (message.trim()) generate('chat', message.trim());
                    }}
                  >
                    <input
                      aria-label="Ask your material"
                      placeholder="What would you like to understand?"
                      value={message}
                      maxLength={2000}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                    <Button
                      size="icon"
                      disabled={busy || !message.trim()}
                      aria-label="Send question"
                    >
                      <Send size={18} />
                    </Button>
                  </form>
                  <p className="ai-note">
                    AI can make mistakes. Check the source excerpts against your original material.
                  </p>
                </div>
              )}
              {tab === 'summary' &&
                (summary ? (
                  <div className="generated-content">
                    <div className="generated-header">
                      <h2>The ideas that matter.</h2>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => generate('summary')}
                      >
                        <RotateCcw size={15} />
                        Regenerate
                      </Button>
                    </div>
                    <div className="summary-text">{summary}</div>
                  </div>
                ) : (
                  <ToolEmpty
                    icon={<FileText size={30} />}
                    title="The big picture, without the overwhelm."
                    text="Create an organized overview of the key concepts in your material."
                    label="Generate summary"
                    busy={busy}
                    onClick={() => generate('summary')}
                  />
                ))}
              {tab === 'quiz' &&
                (questions.length ? (
                  <div className="generated-content">
                    <div className="generated-header">
                      <div>
                        <h2>Put your understanding to the test.</h2>
                        <p className="muted">
                          {questions.length} questions · Choose the best answer
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => generate('quiz')}
                      >
                        New quiz
                      </Button>
                    </div>
                    {submitted && (
                      <div className="quiz-result">
                        <CheckCircle2 size={25} />
                        <div>
                          <strong>
                            {questions.filter((q, i) => q.answer === answers[i]).length} /{' '}
                            {questions.length} correct
                          </strong>
                          <p>
                            {demo
                              ? 'Sample result — not saved to an account.'
                              : 'Result saved. Review the explanations below.'}
                          </p>
                        </div>
                      </div>
                    )}
                    {questions.map((q, i) => (
                      <div className="quiz-question" key={i}>
                        <h3>
                          <span>{String(i + 1).padStart(2, '0')}</span>
                          {q.question}
                        </h3>
                        <div className="quiz-options">
                          {q.options.map((option, j) => (
                            <button
                              key={j}
                              disabled={submitted || busy}
                              className={`${answers[i] === j ? 'chosen ' : ''}${submitted && q.answer === j ? 'correct ' : ''}${submitted && answers[i] === j && q.answer !== j ? 'incorrect' : ''}`}
                              onClick={() => setAnswers({ ...answers, [i]: j })}
                            >
                              <span>{String.fromCharCode(65 + j)}</span>
                              {option}
                            </button>
                          ))}
                        </div>
                        {submitted && <p className="explanation">{q.explanation}</p>}
                      </div>
                    ))}
                    {!submitted && (
                      <Button
                        disabled={busy || Object.keys(answers).length !== questions.length}
                        onClick={submitQuiz}
                      >
                        {busy ? 'Saving…' : 'Check my answers'}
                      </Button>
                    )}
                  </div>
                ) : (
                  <ToolEmpty
                    icon={<Brain size={30} />}
                    title="Knowing it is good. Recalling it is better."
                    text="Get a short quiz based on your material, with explanations for every answer."
                    label="Generate practice quiz"
                    busy={busy}
                    onClick={() => generate('quiz')}
                  />
                ))}
              {tab === 'flashcards' &&
                (cards.length ? (
                  <div className="flashcard-area">
                    <div className="generated-header">
                      <h2>A little recall. A lot of retention.</h2>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => generate('flashcards')}
                      >
                        New cards
                      </Button>
                    </div>
                    <p className="eyebrow">
                      {flipped ? 'THE ANSWER' : 'THINK BEFORE YOU FLIP'} · {card + 1} /{' '}
                      {cards.length}
                    </p>
                    <button
                      className={`flashcard ${flipped ? 'flipped' : ''}`}
                      onClick={() => setFlipped(!flipped)}
                      aria-label="Flip flashcard"
                    >
                      <span>{flipped ? cards[card].back : cards[card].front}</span>
                      <small>
                        Click to {flipped ? 'see the question' : 'reveal the answer'}
                        <RotateCcw size={14} />
                      </small>
                    </button>
                    <div className="flashcard-controls">
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={card === 0}
                        aria-label="Previous card"
                        onClick={() => {
                          setCard(card - 1);
                          setFlipped(false);
                        }}
                      >
                        <ChevronLeft size={19} />
                      </Button>
                      <span>
                        {card + 1} of {cards.length}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={card === cards.length - 1}
                        aria-label="Next card"
                        onClick={() => {
                          setCard(card + 1);
                          setFlipped(false);
                        }}
                      >
                        <ChevronRight size={19} />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <ToolEmpty
                    icon={<Layers size={30} />}
                    title="Make the important things stick."
                    text="Turn key concepts into bite-sized flashcards. Think, flip, repeat."
                    label="Generate flashcards"
                    busy={busy}
                    onClick={() => generate('flashcards')}
                  />
                ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
function ToolEmpty({
  icon,
  title,
  text,
  label,
  busy,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <div className="tool-empty">
      <span className="tool-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{text}</p>
      <Button disabled={busy} onClick={onClick}>
        <Sparkles size={17} />
        {busy ? 'Creating from your material…' : label}
      </Button>
    </div>
  );
}
