'use client';
import { useState, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  LayoutDashboard,
  Library,
  ChartNoAxesCombined,
  Plus,
  Search,
  ArrowUpRight,
  FileText,
  BookOpen,
  Brain,
  Layers,
  Upload,
  ArrowRight,
  LogOut,
  X,
  ChevronRight,
  GraduationCap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { signOut } from '@/app/auth/actions';
import { browserSupabase } from '@/lib/supabase/browser';
import type { StudyDocument } from '@/lib/types';
export function Dashboard({
  demo,
  initialDocuments,
  name,
  email,
  attempts,
  initialError,
}: {
  demo: boolean;
  initialDocuments: StudyDocument[];
  name: string;
  email: string;
  attempts: { score: number; total: number }[];
  initialError: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState('Overview');
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('All subjects');
  const [upload, setUpload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError || '');
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const filtered = initialDocuments.filter(
    (d) =>
      (subject === 'All subjects' || d.subject === subject) &&
      `${d.title} ${d.subject}`.toLowerCase().includes(search.toLowerCase()),
  );
  const score = attempts.length
    ? Math.round((attempts.reduce((s, a) => s + a.score / a.total, 0) / attempts.length) * 100)
    : null;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo) {
      setError(
        'Demo mode uses sample material. Configure Supabase and AI credentials to upload your own files.',
      );
      return;
    }
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          mime: file.type,
          size: file.size,
          subject: String(form.get('subject') || 'General').trim() || 'General',
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      const { error: uploadError } = await browserSupabase()
        .storage.from('study-materials')
        .uploadToSignedUrl(body.path, body.token, file, { contentType: body.mime });
      if (uploadError)
        throw new Error(
          'Private upload failed. Please try again; an incomplete library entry can be removed.',
        );
      const processing = await fetch(`/api/uploads/${body.id}`, { method: 'POST' });
      if (!processing.ok) {
        router.push(`/dashboard/${body.id}`);
        return;
      }
      router.push(`/dashboard/${body.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand">
          <span className="brand-mark">
            <Sparkles size={22} />
          </span>
          StudyFlow<span className="brand-ai">AI</span>
        </Link>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            { title: 'Overview', icon: LayoutDashboard },
            { title: 'My library', icon: Library },
            { title: 'Progress', icon: ChartNoAxesCombined },
          ].map(({ title, icon: Icon }) => (
            <button
              title={title}
              aria-label={title}
              key={title}
              onClick={() => setView(title)}
              className={view === title ? 'nav-item active' : 'nav-item'}
            >
              <Icon size={19} />
              {title}
              {title === 'My library' && (
                <span className="nav-count">{initialDocuments.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-subjects">
          <div className="workspace-label">SUBJECTS</div>
          {[...new Set(initialDocuments.map((d) => d.subject))].map((s, i) => (
            <button
              key={s}
              onClick={() => {
                setSubject(s);
                setView('My library');
              }}
            >
              <i style={{ background: ['#8b5cf6', '#f5b34f', '#66baa0'][i % 3] }} />
              {s}
            </button>
          ))}
          {!initialDocuments.length && <p className="muted text-sm">Upload your first subject.</p>}
        </div>
        <div className="free-card">
          <span className="tiny-tag">FREE PLAN</span>
          <h3>A little study, every day.</h3>
          <p>20 documents · 100 AI actions/day</p>
          <div className="usage-track">
            <i style={{ width: `${Math.min((initialDocuments.length / 20) * 100, 100)}%` }} />
          </div>
          <span>{initialDocuments.length} of 20 documents</span>
        </div>
        <div className="profile">
          <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{name}</strong>
            <small>{email}</small>
          </div>
          {!demo && (
            <form action={signOut}>
              <button aria-label="Sign out">
                <LogOut size={17} />
              </button>
            </form>
          )}
        </div>
      </aside>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {[
          { title: 'Overview', icon: LayoutDashboard },
          { title: 'My library', icon: Library },
          { title: 'Progress', icon: ChartNoAxesCombined },
        ].map(({ title, icon: Icon }) => (
          <button
            key={title}
            aria-current={view === title ? 'page' : undefined}
            className={view === title ? 'active' : ''}
            onClick={() => setView(title)}
          >
            <Icon size={19} />
            <span>{title}</span>
          </button>
        ))}
        {!demo && (
          <form action={signOut}>
            <button aria-label="Sign out">
              <LogOut size={19} />
              <span>Sign out</span>
            </button>
          </form>
        )}
      </nav>
      <main className="main-content">
        <header className="topbar">
          <span>
            {view}
            <ChevronRight size={14} />
            <span className="muted">Your workspace</span>
          </span>
          <div>
            <span className="private-label">{demo ? 'SAMPLE WORKSPACE' : 'PRIVATE WORKSPACE'}</span>
            <span className="avatar small">{name.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>
        <div className="page-content">
          {demo && (
            <div className="demo-banner">
              <span>
                <Sparkles size={15} />
                Demo mode · Sample study material. AI and uploads require credentials.
              </span>
              <Link href="/login">
                Set up your account <ArrowRight size={14} />
              </Link>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">YOUR LEARNING, IN FOCUS</span>
              <h1>
                {view === 'Overview'
                  ? `Let's make it click, ${name}.`
                  : view === 'My library'
                    ? 'Your knowledge lives here.'
                    : 'Small steps. Real progress.'}
              </h1>
              <p>
                {view === 'Overview'
                  ? 'Less time organizing. More time understanding.'
                  : view === 'My library'
                    ? 'All your materials, ready for a deeper understanding.'
                    : 'See what you know and where to go next.'}
              </p>
            </div>
            <Button
              onClick={() => {
                setUpload(true);
                setError('');
              }}
            >
              <Plus size={18} />
              Upload material
            </Button>
          </div>
          {error && !upload && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {view === 'Overview' && (
            <>
              <section className="welcome-card">
                <div>
                  <span className="hero-tag">
                    <Sparkles size={14} />
                    YOUR PERSONAL STUDY SPACE
                  </span>
                  <h2>
                    Big ideas.
                    <br />
                    <span>Meet your study sidekick.</span>
                  </h2>
                  <p>
                    Turn a lecture into a lightbulb moment.
                    <br />
                    Summaries, quizzes, and answers — all from your notes.
                  </p>
                  <Button
                    onClick={() => setUpload(true)}
                    className="bg-white! text-violet-700! hover:bg-violet-50!"
                  >
                    Start with your material
                    <ArrowRight size={17} />
                  </Button>
                </div>
                <div className="hero-visual" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="visual-card card-back">
                    <Layers size={24} />
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="visual-card card-front">
                    <span className="visual-icon">
                      <Brain size={27} />
                    </span>
                    <strong>Make knowledge stick.</strong>
                    <span className="visual-line" />
                    <span className="visual-line short" />
                    <div className="visual-check">✦ Aha, now I get it.</div>
                  </div>
                  <div className="float-spark">✦</div>
                  <div className="float-dot" />
                </div>
              </section>
              <div className="stats-grid">
                <Stat
                  icon={<FileText size={20} />}
                  label="Materials in your library"
                  value={String(initialDocuments.length)}
                  detail="A home for every idea"
                />
                <Stat
                  icon={<Brain size={20} />}
                  label="Quizzes completed"
                  value={String(attempts.length)}
                  detail={demo ? 'Take a sample quiz to explore' : 'Practice builds understanding'}
                />
                <Stat
                  icon={<ChartNoAxesCombined size={20} />}
                  label="Average quiz score"
                  value={score === null ? '—' : `${score}%`}
                  detail={
                    score === null
                      ? 'Your first quiz starts here'
                      : 'Keep building on what you know'
                  }
                />
              </div>
            </>
          )}
          {view === 'Progress' ? (
            <section className="panel progress-panel">
              <span className="tool-icon">
                <GraduationCap size={28} />
              </span>
              <h2>
                {attempts.length
                  ? 'Your practice is adding up.'
                  : 'Your progress starts with a question.'}
              </h2>
              <p>
                {attempts.length
                  ? `${attempts.length} completed quizzes · ${score}% average score`
                  : 'Complete a quiz from your library to start tracking your learning.'}
              </p>
              <Button variant="outline" onClick={() => setView('My library')}>
                Explore your library
                <ArrowRight size={16} />
              </Button>
            </section>
          ) : (
            <>
              <div className="section-heading">
                <div>
                  <h2>
                    {view === 'Overview' ? 'Pick up where you left off' : 'My library'}
                    <span className="count-pill">{filtered.length}</span>
                  </h2>
                  <p>Your materials, with a little AI superpower.</p>
                </div>
                {view === 'Overview' && (
                  <button className="text-link" onClick={() => setView('My library')}>
                    View all materials
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>
              <div className="library-controls">
                <div className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="Search materials"
                    placeholder="Search your materials…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter by subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                >
                  <option>All subjects</option>
                  {[...new Set(initialDocuments.map((d) => d.subject))].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="document-grid">
                {filtered.map((doc, i) => (
                  <Link href={`/dashboard/${doc.id}`} key={doc.id} className="document-card">
                    <div className="doc-card-top">
                      <span className={`doc-icon color-${i % 3}`}>
                        <FileText size={23} />
                      </span>
                      <ArrowUpRight size={18} className="muted" />
                    </div>
                    <span className="subject-tag">{doc.subject}</span>
                    <h3>{doc.title}</h3>
                    <p>
                      {doc.status === 'ready'
                        ? 'Ready to explore'
                        : doc.status === 'failed'
                          ? 'Needs attention'
                          : 'Processing your material…'}
                    </p>
                    <div className="doc-card-bottom">
                      <span>
                        {new Date(doc.created_at).toLocaleDateString('en', {
                          month: 'short',
                          day: 'numeric',
                          timeZone: 'UTC',
                        })}
                      </span>
                      <span className={doc.status === 'ready' ? 'ready-badge' : 'muted'}>
                        <i />
                        {doc.status === 'ready' ? 'Ready' : doc.status}
                      </span>
                    </div>
                  </Link>
                ))}
                {!filtered.length && (
                  <div className="empty-library">
                    <BookOpen size={30} />
                    <h3>
                      {initialDocuments.length
                        ? 'No matching materials'
                        : 'Your next discovery starts here'}
                    </h3>
                    <p>
                      {initialDocuments.length
                        ? 'Try another search or subject.'
                        : 'Upload notes, slides as PDF, or a diagram to create your first study space.'}
                    </p>
                    <Button variant="outline" onClick={() => setUpload(true)}>
                      Upload your first material
                    </Button>
                  </div>
                )}
              </div>
              {view === 'Overview' && (
                <div className="study-tip">
                  <span>✦</span>
                  <div>
                    <strong>A little practice goes a long way.</strong>
                    <p>
                      Try recalling an answer before flipping a flashcard. That small effort helps
                      it stick.
                    </p>
                  </div>
                  <span className="tip-label">STUDY TIP</span>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      {upload && (
        <Dialog.Root
          open={upload}
          onOpenChange={(value) => {
            if (!busy) setUpload(value);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="modal-backdrop" />
            <Dialog.Content
              className="upload-modal"
              onEscapeKeyDown={(event) => {
                if (busy) event.preventDefault();
              }}
              onPointerDownOutside={(event) => {
                if (busy) event.preventDefault();
              }}
            >
              <button
                className="modal-close"
                onClick={() => !busy && setUpload(false)}
                disabled={busy}
                aria-label="Close upload"
              >
                <X size={20} />
              </button>
              <span className="tool-icon">
                <Upload size={25} />
              </span>
              <Dialog.Title asChild>
                <h2 id="upload-title">Start with what you have.</h2>
              </Dialog.Title>
              <Dialog.Description asChild>
                <p className="muted">We’ll turn your material into a space to learn.</p>
              </Dialog.Description>
              <form onSubmit={submit}>
                <button
                  type="button"
                  className="dropzone"
                  onClick={() => input.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    setFile(e.dataTransfer.files[0] || null);
                  }}
                >
                  <Upload size={27} />
                  <strong>{file ? file.name : 'Drop a file here, or browse'}</strong>
                  <span>PDF, DOCX, PPTX, TXT, PNG, JPEG, WebP · up to 25 MB</span>
                </button>
                <input
                  ref={input}
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.pptx,.txt,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <label>
                  Subject
                  <input
                    name="subject"
                    placeholder="e.g. Biology"
                    maxLength={80}
                    defaultValue={subject === 'All subjects' ? '' : subject}
                  />
                </label>
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                <Button className="w-full" disabled={busy || !file}>
                  {busy ? 'Reading, understanding, and indexing…' : 'Upload & create study space'}
                  <Sparkles size={16} />
                </Button>
                <p className="upload-note">
                  {demo
                    ? 'Sample mode. Uploads are available after setup.'
                    : 'Files stay private. AI processing sends content to Gemini. Processing can take a few minutes; keep this window open.'}
                </p>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  );
}
function Stat({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="stat-card">
      <div>
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}
