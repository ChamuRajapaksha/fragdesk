import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Command, Users, Activity, X } from 'lucide-react';

interface Step {
  icon: React.ElementType;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    icon: Zap,
    title: 'Welcome to FragDesk',
    description:
      'A gaming companion, productivity utility, and community fragment aggregator, all in one. A quick tour of the essentials before you dive in.',
  },
  {
    icon: Zap,
    title: 'Record macros anywhere',
    description:
      'Press F9 from anywhere — even if FragDesk isn\'t focused — to start or stop recording keyboard and mouse input. Give a macro its own hotkey later for instant playback during a game.',
  },
  {
    icon: Command,
    title: 'Ctrl+K for instant search',
    description:
      'Jump to any tab or play any saved macro by name, without touching the mouse. Works from anywhere in the app.',
  },
  {
    icon: Users,
    title: 'Share what you build',
    description:
      'Macros, clipboard snippets, monitor alert rules, even your Monitor layout — share any of them to the Community Library, or import what others have shared. Every macro shows a preview of what it actually does before you import it.',
  },
  {
    icon: Activity,
    title: 'Monitor with alerts',
    description:
      'Track CPU and RAM live, set alert rules (like "notify me when CPU is above 90%"), and rearrange the page layout to your liking from the Customize Layout button.',
  },
];

export default function OnboardingTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    invoke<boolean>('has_completed_onboarding')
      .then((completed) => setVisible(!completed))
      .catch(() => {
        // If the check itself fails, err toward NOT interrupting the
        // person with a tour on top of a possibly broken app state.
        setVisible(false);
      });
  }, []);

  async function finish() {
    setVisible(false);
    try {
      await invoke('mark_onboarding_completed');
    } catch (err) {
      console.error('Failed to persist onboarding completion:', err);
    }
  }

  function next() {
    if (step === STEPS.length - 1) {
      void finish();
    } else {
      setStep((s) => s + 1);
    }
  }

  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  if (!visible) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLastStep = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="bg-frag-surface border border-frag-border rounded-xl w-full max-w-md p-8 relative shadow-2xl"
        >
          <button
            onClick={() => void finish()}
            className="absolute top-4 right-4 text-frag-muted hover:text-frag-text"
            aria-label="Skip tour"
          >
            <X size={18} />
          </button>

          <div className="w-12 h-12 rounded-lg bg-frag-primary/10 flex items-center justify-center mb-4">
            <Icon className="text-frag-primary" size={24} />
          </div>

          <h2 className="text-xl font-bold text-frag-text mb-2">{current.title}</h2>
          <p className="text-sm text-frag-muted leading-relaxed mb-6">{current.description}</p>

          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? 'w-5 bg-frag-primary' : 'w-1.5 bg-frag-border'
                  }`}
                />
              ))}
            </div>

            <div className="flex gap-2">
              {step > 0 && (
                <button
                  onClick={back}
                  className="px-3 py-1.5 rounded-lg text-sm text-frag-muted hover:text-frag-text"
                >
                  Back
                </button>
              )}
              <button
                onClick={next}
                className="px-4 py-1.5 rounded-lg bg-frag-primary text-frag-bg text-sm font-semibold hover:bg-frag-primary/90"
              >
                {isLastStep ? 'Get Started' : 'Next'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}