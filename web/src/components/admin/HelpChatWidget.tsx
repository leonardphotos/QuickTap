import { useMemo, useRef, useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { ChevronLeft, MessageCircleQuestionMark, Send, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { HELP_FAQ, HELP_CATEGORY_LABELS, type HelpFaqCategory } from '@/data/help-faq';

type ChatMessage = { from: 'bot' | 'user'; text: string };

const WELCOME: ChatMessage = {
  from: 'bot',
  text: 'Hola, soy el asistente de QuickTap. Elige un tema para ver sus preguntas, o escribe la tuya directamente.',
};

const NOT_FOUND_TEXT =
  'No tengo una respuesta guardada para eso todavía. Prueba con otras palabras, o pregúntale a un Administrador o al Dueño.';

/** Minúsculas y sin acentos, igual que el buscador de Productos — para que "pin" encuentre "PIN". */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Asistente de Ayuda del panel: base de preguntas y respuestas fija (sin IA), pensada
 * para quien recién está aprendiendo a usar QuickTap. Las preguntas que se ofrecen y
 * las que responde una búsqueda libre se filtran por el rol del usuario logueado —
 * un Mesero no ve pasos de pantallas que no puede abrir.
 */
export function HelpChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  // null = mostrando el menú de temas. Elegido un tema, solo se ofrecen sus preguntas —
  // así el chat no descarga las ~20 preguntas de la base entera de una sola vez.
  const [activeCategory, setActiveCategory] = useState<HelpFaqCategory | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const availableFaq = useMemo(
    () => HELP_FAQ.filter((f) => !user?.role || f.roles.includes(user.role)),
    [user?.role],
  );

  // Solo se listan temas que tienen al menos una pregunta visible para este rol.
  const availableCategories = useMemo(() => {
    const present = new Set(availableFaq.map((f) => f.category));
    return (Object.keys(HELP_CATEGORY_LABELS) as HelpFaqCategory[]).filter((c) => present.has(c));
  }, [availableFaq]);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  function ask(question: string) {
    const q = normalize(question);
    const match = availableFaq.find(
      (f) => normalize(f.question) === q || [f.question, ...f.keywords].some((k) => q.includes(normalize(k))),
    );
    setMessages((prev) => [
      ...prev,
      { from: 'user', text: question },
      { from: 'bot', text: match?.answer ?? NOT_FOUND_TEXT },
    ]);
    setInput('');
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    ask(input.trim());
  }

  // Solo se ofrecen como chips las preguntas que todavía no se hicieron en esta sesión,
  // para que la lista se vaya despejando a medida que el usuario aprende.
  const askedQuestions = new Set(messages.filter((m) => m.from === 'user').map((m) => normalize(m.text)));
  const questionsInCategory = activeCategory
    ? availableFaq.filter((f) => f.category === activeCategory && !askedQuestions.has(normalize(f.question)))
    : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ayuda"
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-950/25 hover:bg-brand-600 transition-colors"
      >
        <MessageCircleQuestionMark className="h-6 w-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-end bg-black/20 sm:p-5" onClick={() => setOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[min(600px,85vh)] w-full flex-col rounded-t-[24px] bg-white shadow-[0_24px_64px_-24px_rgba(0,0,0,0.35)] sm:h-[560px] sm:w-96 sm:rounded-[24px]"
          >
            <div className="flex items-center justify-between border-b border-brand-950/[0.06] px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-brand-950">Ayuda de QuickTap</p>
                <p className="text-xs font-light text-brand-950/50">Preguntas frecuentes del panel</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar ayuda"
                className="rounded-full p-1.5 text-brand-950/40 hover:bg-brand-950/5 hover:text-brand-950"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm ${
                      m.from === 'user'
                        ? 'bg-brand-500 text-white rounded-br-md'
                        : 'bg-brand-950/[0.05] text-brand-950 rounded-bl-md'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}

              {activeCategory === null ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {availableCategories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setActiveCategory(c)}
                      className="rounded-full border border-brand-950/10 bg-white px-3 py-1.5 text-xs font-medium text-brand-950/70 hover:bg-brand-950/5"
                    >
                      {HELP_CATEGORY_LABELS[c]}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveCategory(null)}
                    className="flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-600"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Todos los temas
                  </button>
                  {questionsInCategory.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {questionsInCategory.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => ask(f.question)}
                          className="rounded-full border border-brand-950/10 bg-white px-3 py-1.5 text-xs font-medium text-brand-950/70 hover:bg-brand-950/5"
                        >
                          {f.question}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs font-light text-brand-950/40">Ya viste todas las preguntas de este tema.</p>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-brand-950/[0.06] p-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe tu pregunta…"
                aria-label="Escribe tu pregunta"
                className="flex-1 rounded-full border border-brand-950/15 bg-white px-4 py-2.5 text-sm text-brand-950 placeholder:text-brand-950/35 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Enviar pregunta"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
